import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import axios from 'axios';
import { supabase } from '../config/supabase';
import { sendEmail } from '../services/emailService';
import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'allatyou-super-secret-key';

export const registro = async (req: Request, res: Response): Promise<void> => {
  try {
    const { nombre, email, turnstileToken } = req.body;
    if (!nombre || !email) {
      res.status(400).json({ error: 'Faltan campos requeridos (nombre, email).' });
      return;
    }

    // Validación Cloudflare Turnstile
    if (!turnstileToken) {
      res.status(400).json({ error: 'Validación de seguridad requerida.' });
      return;
    }

    const turnstileResponse = await axios.post(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      new URLSearchParams({
        secret: process.env.TURNSTILE_SECRET_KEY || '',
        response: turnstileToken
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    if (!turnstileResponse.data.success) {
      res.status(403).json({ error: 'Error de verificación de seguridad. Por favor, intenta de nuevo.' });
      return;
    }

    // 1. Generar Slug
    let baseSlug = nombre.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    let finalSlug = baseSlug;
    let suffix = 1;

    // Verificar si el slug existe
    while (true) {
      const { data: existing } = await supabase
        .from('taller_empresas')
        .select('id')
        .eq('slug', finalSlug)
        .limit(1);

      if (!existing || existing.length === 0) break;
      finalSlug = `${baseSlug}-${suffix}`;
      suffix++;
    }

    // 2. Insertar Empresa
    const { data: nuevaEmpresa, error: empresaError } = await supabase
      .from('taller_empresas')
      .insert({
        nombre,
        slug: finalSlug,
        codigo_acceso: crypto.randomUUID()
      })
      .select('id')
      .single();

    if (empresaError || !nuevaEmpresa) {
      throw new Error(`Error creando empresa: ${empresaError?.message}`);
    }

    // 3. Generar OTP y guardar Correo
    const initialOtp = Math.floor(1000 + Math.random() * 9000).toString();

    const { error: correoError } = await supabase
      .from('taller_empresas_correos')
      .insert({
        empresa_id: nuevaEmpresa.id,
        email,
        otp_code: initialOtp
      });

    if (correoError) {
      throw new Error(`Error registrando correo: ${correoError.message}`);
    }

    // 4. Enviar OTP
    await sendEmail({
      to: email,
      subject: `¡Bienvenido a AllAtYou Renting - ${nombre}!`,
      text: `Hola,\n\nTu taller "${nombre}" ha sido registrado exitosamente.\n\nEl código de verificación de 4 dígitos para acceder por primera vez a tu tablero es: ${initialOtp}\n\nEscríbelo en la pantalla para continuar.`
    });

    res.status(201).json({ 
      success: true, 
      empresa_id: nuevaEmpresa.id, 
      slug: finalSlug, 
      message: 'Registro exitoso y OTP enviado' 
    });

  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const getEmpresas = async (req: Request, res: Response): Promise<void> => {
  try {
    const { data: empresas, error } = await supabase
      .from('taller_empresas')
      .select('id, nombre, slug, config_diagnostico');

    if (error) throw error;
    res.json(empresas || []);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const updateEmpresaConfig = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { config_diagnostico } = req.body;

    if (!id || config_diagnostico === undefined) {
      res.status(400).json({ error: 'Faltan datos requeridos.' });
      return;
    }

    const { error } = await supabase
      .from('taller_empresas')
      .update({ config_diagnostico })
      .eq('id', id);

    if (error) throw error;
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const requestOtp = async (req: Request, res: Response): Promise<void> => {
  try {
    const { empresa_id } = req.body;
    
    // 1. Obtener la empresa
    const { data: empresa, error: empresaError } = await supabase
      .from('taller_empresas')
      .select('id, nombre, slug')
      .eq('id', empresa_id)
      .single();

    if (empresaError || !empresa) {
      res.status(404).json({ error: 'Empresa no encontrada.' });
      return;
    }

    // 2. Obtener SOLO los correos verificados de la empresa (no los pendientes de aprobación)
    const { data: correosRecords } = await supabase
      .from('taller_empresas_correos')
      .select('email')
      .eq('empresa_id', empresa_id)
      .eq('is_verified', true);

    if (!correosRecords || correosRecords.length === 0) {
      res.status(404).json({ error: 'Esta empresa no tiene correos configurados.' });
      return;
    }

    const emailsToNotify = correosRecords.map(r => r.email);

    // 3. Generar OTP de 4 dígitos compartido
    const otp = Math.floor(1000 + Math.random() * 9000).toString();

    // 4. Actualizar el OTP SOLO para los correos verificados
    await supabase
      .from('taller_empresas_correos')
      .update({ otp_code: otp })
      .eq('empresa_id', empresa_id)
      .eq('is_verified', true);

    // 5. Enviar el OTP solo a correos verificados
    await sendEmail({
      to: emailsToNotify,
      subject: `Acceso TallerPro - ${empresa.nombre}`,
      text: `Hola equipo,\n\nEl código de verificación de 4 dígitos para acceder al tablero de ${empresa.nombre} es: ${otp}\n\nEscríbelo en la pantalla de ingreso para continuar.`
    });

    res.json({ success: true, message: 'OTP enviado a todos los administradores' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const verifyOtp = async (req: Request, res: Response): Promise<void> => {
  try {
    const { empresa_id, otp } = req.body;
    
    // 1. Obtener la empresa por id
    const { data: empresa, error: empresaError } = await supabase
      .from('taller_empresas')
      .select('id, nombre, slug')
      .eq('id', empresa_id)
      .single();

    if (empresaError || !empresa) {
      res.status(404).json({ error: 'Empresa no encontrada.' });
      return;
    }

    // 2. Validar OTP en BD (solo entre correos verificados para evitar bypass de aprobación)
    const { data: validRecords, error } = await supabase
      .from('taller_empresas_correos')
      .select('id, email')
      .eq('empresa_id', empresa_id)
      .eq('otp_code', otp)
      .eq('is_verified', true)
      .limit(1);

    if (error || !validRecords || validRecords.length === 0) {
      res.status(401).json({ error: 'Código inválido.' });
      return;
    }

    const validRecord = validRecords[0];

    // CRÍTICO: NO se actualiza ni se limpia el otp_code para permitir múltiples sesiones simultáneas.

    // 3. Crear JWT (Inyectando un email representativo del que validó el código)
    const token = jwt.sign({ empresa_id: empresa.id, email: validRecord.email }, JWT_SECRET, { expiresIn: '24h' });
    
    res.json({ 
      success: true, 
      token, 
      empresa: { id: empresa.id, nombre: empresa.nombre, slug: empresa.slug } 
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const loginWithPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { empresa_id, email, password } = req.body;

    if (!empresa_id || !email || !password) {
      res.status(400).json({ error: 'Faltan campos requeridos (empresa_id, email, password).' });
      return;
    }

    // 1. Obtener la empresa
    const { data: empresa, error: empresaError } = await supabase
      .from('taller_empresas')
      .select('id, nombre, slug')
      .eq('id', empresa_id)
      .single();

    if (empresaError || !empresa) {
      res.status(404).json({ error: 'Empresa no encontrada.' });
      return;
    }

    // 2. Buscar el correo asociado a la empresa
    const { data: correoRecord, error: correoError } = await supabase
      .from('taller_empresas_correos')
      .select('id, email, password_hash, is_verified')
      .eq('empresa_id', empresa_id)
      .eq('email', email.toLowerCase().trim())
      .single();

    if (correoError || !correoRecord) {
      res.status(401).json({ error: 'Credenciales inválidas.' });
      return;
    }

    // 3. Validar contraseña con bcrypt
    if (!correoRecord.password_hash) {
      res.status(401).json({ error: 'Credenciales inválidas.' });
      return;
    }

    const passwordValid = await bcrypt.compare(password, correoRecord.password_hash);
    if (!passwordValid) {
      res.status(401).json({ error: 'Credenciales inválidas.' });
      return;
    }

    // 4. Verificar si el usuario está aprobado
    if (!correoRecord.is_verified) {
      res.status(403).json({ error: 'Tu usuario aún está pendiente de aprobación por el administrador.' });
      return;
    }

    // 5. Crear JWT (misma estructura que verify-otp)
    const token = jwt.sign({ empresa_id: empresa.id, email: correoRecord.email }, JWT_SECRET, { expiresIn: '24h' });

    res.json({
      success: true,
      token,
      empresa: { id: empresa.id, nombre: empresa.nombre, slug: empresa.slug }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// ──────── EQUIPO ────────

export const getEquipo = async (req: Request, res: Response): Promise<void> => {
  try {
    const { data, error } = await supabase
      .from('taller_empresas_correos')
      .select('id, email, is_verified')
      .eq('empresa_id', req.empresa_id)
      .order('is_verified', { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const crearMiembroEquipo = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Correo y contraseña son requeridos.' });
      return;
    }

    const emailNorm = email.toLowerCase().trim();

    // Verificar duplicado
    const { data: existing } = await supabase
      .from('taller_empresas_correos')
      .select('id')
      .eq('empresa_id', req.empresa_id)
      .eq('email', emailNorm)
      .limit(1);

    if (existing && existing.length > 0) {
      res.status(409).json({ error: 'Este correo ya está registrado en tu equipo.' });
      return;
    }

    // Encriptar contraseña
    const password_hash = await bcrypt.hash(password, 10);

    // Insertar con is_verified: false (pendiente de aprobación)
    const { error: insertError } = await supabase
      .from('taller_empresas_correos')
      .insert({
        empresa_id: req.empresa_id,
        email: emailNorm,
        password_hash,
        is_verified: false
      });

    if (insertError) throw insertError;

    // Notificar a los administradores verificados
    const { data: admins } = await supabase
      .from('taller_empresas_correos')
      .select('email')
      .eq('empresa_id', req.empresa_id)
      .eq('is_verified', true);

    if (admins && admins.length > 0) {
      const adminEmails = admins.map(a => a.email);
      await sendEmail({
        to: adminEmails,
        subject: 'Nuevo usuario pendiente de aprobación',
        text: `Se ha creado un nuevo usuario (${emailNorm}) en el taller.\n\nPor seguridad, está inactivo. Ingresa al sistema, ve a la sección "Equipo" y apruébalo para que pueda acceder.`
      });
    }

    res.status(201).json({ success: true, message: 'Usuario creado. Pendiente de aprobación.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const aprobarMiembro = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // Scoped por empresa_id para seguridad
    const { error } = await supabase
      .from('taller_empresas_correos')
      .update({ is_verified: true })
      .eq('id', id)
      .eq('empresa_id', req.empresa_id);

    if (error) throw error;
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};
