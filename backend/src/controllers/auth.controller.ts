import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import axios from 'axios';
import { supabase } from '../config/supabase';
import { sendEmail } from '../services/emailService';
import crypto from 'crypto';
import { generateDeviceFingerprint, getDeviceName } from '../utils/device';

import { JWT_SECRET } from '../config/jwt';

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

    const turnstileSecret = process.env.TURNSTILE_SECRET_KEY;
    if (!turnstileSecret) {
      console.error('[registro] TURNSTILE_SECRET_KEY no está definida en las variables de entorno.');
      res.status(500).json({ error: 'Error de configuración del servidor.' });
      return;
    }

    let turnstileOk = false;
    try {
      const turnstileResponse = await axios.post(
        'https://challenges.cloudflare.com/turnstile/v0/siteverify',
        new URLSearchParams({
          secret: turnstileSecret,
          response: turnstileToken
        }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );
      console.log('[registro] Turnstile response:', JSON.stringify(turnstileResponse.data));
      turnstileOk = turnstileResponse.data.success === true;
    } catch (turnstileErr: any) {
      console.error('[registro] Error llamando a Cloudflare siteverify:',
        turnstileErr.response?.data ?? turnstileErr.message
      );
      res.status(500).json({ error: 'No se pudo verificar el captcha. Intenta de nuevo.' });
      return;
    }

    if (!turnstileOk) {
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
        otp_code: initialOtp,
        is_verified: true   // El fundador queda verificado al confirmar su OTP
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
    const { empresa_id, otp, rememberMe } = req.body;
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

    let device_id: string | undefined;

    if (rememberMe) {
      const fingerprint_hash = generateDeviceFingerprint(req);
      const device_name = getDeviceName(req);
      const expires_at = new Date();
      expires_at.setHours(expires_at.getHours() + 24);

      const { data: device, error: deviceError } = await supabase
        .from('taller_dispositivos_autorizados')
        .insert({
          empresa_id: empresa.id,
          usuario_email: validRecord.email,
          device_name,
          fingerprint_hash,
          expires_at: expires_at.toISOString()
        })
        .select('id')
        .single();
        
      if (!deviceError && device) {
        device_id = device.id;
      } else if (deviceError) {
        // No bloqueamos el login, pero sí lo registramos en el response para depuración
        console.error('[verifyOtp] Error creando dispositivo autorizado:', JSON.stringify(deviceError));
        // En desarrollo podemos incluir el error en el response para visibilidad
        res.json({
          success: true,
          token: jwt.sign({ empresa_id: empresa.id, email: validRecord.email }, JWT_SECRET, { expiresIn: '24h' }),
          empresa: { id: empresa.id, nombre: empresa.nombre, slug: empresa.slug },
          device_warning: `No se pudo registrar el dispositivo: ${deviceError.message || JSON.stringify(deviceError)}`
        });
        return;
      }
    }

    // 3. Crear JWT (Inyectando un email representativo del que validó el código)
    const jwtPayload: any = { empresa_id: empresa.id, email: validRecord.email };
    if (device_id) jwtPayload.device_id = device_id;

    const token = jwt.sign(jwtPayload, JWT_SECRET, { expiresIn: '24h' });
    
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
    const { empresa_id, email, password, rememberMe } = req.body;

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

    // 5. Crear dispositivo autorizado si 'rememberMe' es true
    let device_id: string | undefined;

    if (rememberMe) {
      const fingerprint_hash = generateDeviceFingerprint(req);
      const device_name = getDeviceName(req);
      const expires_at = new Date();
      expires_at.setHours(expires_at.getHours() + 24);

      const { data: device, error: deviceError } = await supabase
        .from('taller_dispositivos_autorizados')
        .insert({
          empresa_id: empresa.id,
          usuario_email: correoRecord.email,
          device_name,
          fingerprint_hash,
          expires_at: expires_at.toISOString()
        })
        .select('id')
        .single();
        
      if (!deviceError && device) {
        device_id = device.id;
      } else if (deviceError) {
        console.error('[loginWithPassword] Error creando dispositivo autorizado:', JSON.stringify(deviceError));
        res.json({
          success: true,
          token: jwt.sign({ empresa_id: empresa.id, email: correoRecord.email }, JWT_SECRET, { expiresIn: '24h' }),
          empresa: { id: empresa.id, nombre: empresa.nombre, slug: empresa.slug },
          device_warning: `No se pudo registrar el dispositivo: ${deviceError.message || JSON.stringify(deviceError)}`
        });
        return;
      }
    }

    // 6. Crear JWT
    const jwtPayload: any = { empresa_id: empresa.id, email: correoRecord.email };
    if (device_id) jwtPayload.device_id = device_id;

    // Si no marcó "Mantener sesión", podríamos poner expiresIn: '4h' y si la marcó '24h'
    // Para simplificar, dejamos 24h para ambos pero el 'rememberMe' tiene protección de dispositivo
    const token = jwt.sign(jwtPayload, JWT_SECRET, { expiresIn: rememberMe ? '24h' : '4h' });

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

// ──────── DISPOSITIVOS AUTORIZADOS ────────

export const getDispositivos = async (req: Request, res: Response): Promise<void> => {
  try {
    const { data, error } = await supabase
      .from('taller_dispositivos_autorizados')
      .select('id, device_name, usuario_email, is_active, last_used_at, expires_at, created_at')
      .eq('empresa_id', req.empresa_id)
      .eq('is_active', true)
      .order('last_used_at', { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const revocarDispositivo = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('taller_dispositivos_autorizados')
      .update({ is_active: false })
      .eq('id', id)
      .eq('empresa_id', req.empresa_id)
      .eq('usuario_email', req.user_email);

    if (error) throw error;
    res.json({ success: true, message: 'Dispositivo revocado' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const logout = async (req: Request, res: Response): Promise<void> => {
  try {
    // Si el usuario tiene sesión vinculada a un device_id, la revocamos
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as { device_id?: string };
        if (decoded.device_id) {
          await supabase
            .from('taller_dispositivos_autorizados')
            .update({ is_active: false })
            .eq('id', decoded.device_id);
        }
      } catch (e) {
        // Ignorar si el token ya expiró o es inválido al hacer logout
      }
    }
    
    res.json({ success: true, message: 'Sesión cerrada correctamente' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// ──────── RECUPERACIÓN / CREACIÓN DE CONTRASEÑA ────────

export const forgotPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { empresa_id, email } = req.body;

    if (!empresa_id || !email) {
      res.status(400).json({ error: 'Faltan campos requeridos (empresa_id, email).' });
      return;
    }

    const emailNorm = email.toLowerCase().trim();

    // 1. Validar que la empresa exista
    const { data: empresa, error: empresaError } = await supabase
      .from('taller_empresas')
      .select('id, nombre, slug')
      .eq('id', empresa_id)
      .single();

    if (empresaError || !empresa) {
      res.status(404).json({ error: 'Empresa no encontrada.' });
      return;
    }

    // 2. Buscar si el correo pertenece a la empresa
    const { data: usuario, error: usuarioError } = await supabase
      .from('taller_empresas_correos')
      .select('id, email, is_verified')
      .eq('empresa_id', empresa_id)
      .eq('email', emailNorm)
      .single();

    if (usuarioError || !usuario) {
      res.status(404).json({ error: 'No se encontró un usuario con ese correo registrado en esta sucursal.' });
      return;
    }

    // 3. Verificar si el usuario está aprobado
    if (!usuario.is_verified) {
      res.status(403).json({ error: 'Tu usuario aún está pendiente de aprobación por el administrador.' });
      return;
    }

    // 4. Generar código de 6 dígitos numérico criptográficamente seguro y expiración (15 minutos)
    const resetCode = crypto.randomInt(100000, 1000000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    // 5. Guardar en BD (intento con columnas dedicadas y fallback seguro a otp_code)
    let saveError = null;
    try {
      const { error } = await supabase
        .from('taller_empresas_correos')
        .update({
          reset_password_token: resetCode,
          reset_password_expires_at: expiresAt
        })
        .eq('id', usuario.id)
        .eq('empresa_id', empresa_id);

      saveError = error;
    } catch (e: any) {
      saveError = e;
    }

    if (saveError) {
      console.warn('[forgotPassword] Fallback a otp_code:', saveError.message || saveError);
      const { error: fallbackError } = await supabase
        .from('taller_empresas_correos')
        .update({ otp_code: resetCode })
        .eq('id', usuario.id)
        .eq('empresa_id', empresa_id);

      if (fallbackError) {
        throw new Error(`Error guardando código de recuperación: ${fallbackError.message}`);
      }
    }

    // 6. Enviar correo vía Resend
    await sendEmail({
      to: emailNorm,
      subject: `Restablecer o crear contraseña - ${empresa.nombre}`,
      text: `Hola,\n\nHas solicitado restablecer o crear tu contraseña de acceso para ${empresa.nombre} en TallerPro.\n\nTu código de verificación de 6 dígitos es: ${resetCode}\n\nEste código es válido por 15 minutos.\n\nSi tú no realizaste esta solicitud, puedes ignorar este mensaje de forma segura.`
    });

    res.json({
      success: true,
      message: 'Código de verificación enviado a tu correo.'
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const resetPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { empresa_id, email, code, new_password } = req.body;

    if (!empresa_id || !email || !code || !new_password) {
      res.status(400).json({ error: 'Faltan campos requeridos (empresa_id, email, code, new_password).' });
      return;
    }

    if (typeof new_password !== 'string' || new_password.trim().length < 6) {
      res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres.' });
      return;
    }

    const emailNorm = email.toLowerCase().trim();
    const codeNorm = code.toString().trim();

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

    // 2. Buscar el usuario
    let usuario: any = null;
    let usuarioError: any = null;

    const initialQuery = await supabase
      .from('taller_empresas_correos')
      .select('id, email, is_verified, reset_password_token, reset_password_expires_at, otp_code')
      .eq('empresa_id', empresa_id)
      .eq('email', emailNorm)
      .single();

    usuario = initialQuery.data;
    usuarioError = initialQuery.error;

    // Fallback si la columna reset_password_token aún no existe en DB
    if (usuarioError && usuarioError.message?.includes('reset_password_token')) {
      const fallbackQuery = await supabase
        .from('taller_empresas_correos')
        .select('id, email, is_verified, otp_code')
        .eq('empresa_id', empresa_id)
        .eq('email', emailNorm)
        .single();
      usuario = fallbackQuery.data;
      usuarioError = fallbackQuery.error;
    }

    if (usuarioError || !usuario) {
      res.status(404).json({ error: 'No se encontró un usuario con ese correo registrado en esta sucursal.' });
      return;
    }

    if (!usuario.is_verified) {
      res.status(403).json({ error: 'Tu usuario aún está pendiente de aprobación por el administrador.' });
      return;
    }

    // 3. Validar código y expiración
    let codeValid = false;
    if (usuario.reset_password_token && usuario.reset_password_token === codeNorm) {
      if (usuario.reset_password_expires_at) {
        const expires = new Date(usuario.reset_password_expires_at).getTime();
        if (Date.now() > expires) {
          res.status(400).json({ error: 'El código ha expirado. Por favor solicita uno nuevo.' });
          return;
        }
      }
      codeValid = true;
    } else if (usuario.otp_code && usuario.otp_code === codeNorm) {
      codeValid = true;
    }

    if (!codeValid) {
      res.status(400).json({ error: 'Código de verificación inválido.' });
      return;
    }

    // 4. Hashear la nueva contraseña con bcrypt
    const password_hash = await bcrypt.hash(new_password.trim(), 10);

    // 5. Actualizar contraseña y limpiar tokens
    const updatePayload: any = {
      password_hash,
      otp_code: null
    };

    if ('reset_password_token' in usuario) {
      updatePayload.reset_password_token = null;
      updatePayload.reset_password_expires_at = null;
    }

    const { error: updateError } = await supabase
      .from('taller_empresas_correos')
      .update(updatePayload)
      .eq('id', usuario.id)
      .eq('empresa_id', empresa_id);

    if (updateError) {
      // Fallback si la columna no existe aún
      const { error: retryError } = await supabase
        .from('taller_empresas_correos')
        .update({ password_hash, otp_code: null })
        .eq('id', usuario.id)
        .eq('empresa_id', empresa_id);

      if (retryError) throw retryError;
    }

    // 6. Generar JWT para login directo
    const token = jwt.sign(
      { empresa_id: empresa.id, email: usuario.email },
      JWT_SECRET,
      { expiresIn: '4h' }
    );

    res.json({
      success: true,
      message: 'Contraseña actualizada correctamente.',
      token,
      empresa: { id: empresa.id, nombre: empresa.nombre, slug: empresa.slug }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};
