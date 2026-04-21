import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { supabase } from '../config/supabase';
import { sendEmail } from '../services/emailService';
import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'allatyou-super-secret-key';

export const registro = async (req: Request, res: Response): Promise<void> => {
  try {
    const { nombre, email } = req.body;
    if (!nombre || !email) {
      res.status(400).json({ error: 'Faltan campos requeridos (nombre, email).' });
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

    // 2. Obtener los correos de la empresa
    const { data: correosRecords } = await supabase
      .from('taller_empresas_correos')
      .select('email')
      .eq('empresa_id', empresa_id);

    if (!correosRecords || correosRecords.length === 0) {
      res.status(404).json({ error: 'Esta empresa no tiene correos configurados.' });
      return;
    }

    const emailsToNotify = correosRecords.map(r => r.email);

    // 3. Generar OTP de 4 dígitos compartido
    const otp = Math.floor(1000 + Math.random() * 9000).toString();

    // 4. Actualizar masivamente el OTP para todos los correos de la empresa
    await supabase
      .from('taller_empresas_correos')
      .update({ otp_code: otp })
      .eq('empresa_id', empresa_id);

    // 5. Enviar el OTP en bloque
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

    // 2. Validar OTP en BD (cualquier registro con ese OTP para esa empresa)
    const { data: validRecords, error } = await supabase
      .from('taller_empresas_correos')
      .select('id, email')
      .eq('empresa_id', empresa_id)
      .eq('otp_code', otp)
      .limit(1);

    if (error || !validRecords || validRecords.length === 0) {
      res.status(401).json({ error: 'Código inválido.' });
      return;
    }

    const validRecord = validRecords[0];

    // CRÍTICO: NO se actualiza ni se limpia el otp_code para permitir múltiples sesiones simultáneas.
    
    // Marcar como verificado solo para tener rastro si es la primera vez
    await supabase
      .from('taller_empresas_correos')
      .update({ is_verified: true })
      .eq('id', validRecord.id);

    // 4. Crear JWT (Inyectando un email representativo del que validó el código)
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
      .select('id, email, password_hash')
      .eq('empresa_id', empresa_id)
      .eq('email', email.toLowerCase().trim())
      .single();

    if (correoError || !correoRecord) {
      res.status(401).json({ error: 'Credenciales inválidas.' });
      return;
    }

    // 3. Validar contraseña (comparación directa por ahora, migrar a bcrypt en Etapa 2)
    if (!correoRecord.password_hash || correoRecord.password_hash !== password) {
      res.status(401).json({ error: 'Credenciales inválidas.' });
      return;
    }

    // 4. Marcar como verificado
    await supabase
      .from('taller_empresas_correos')
      .update({ is_verified: true })
      .eq('id', correoRecord.id);

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
