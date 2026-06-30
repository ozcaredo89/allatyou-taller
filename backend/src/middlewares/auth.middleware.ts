import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { supabase } from '../config/supabase';
import { generateDeviceFingerprint } from '../utils/device';

// Extend Express Request object
declare module 'express-serve-static-core' {
  interface Request {
    empresa_id?: string;
    user_email?: string;
  }
}

const JWT_SECRET = process.env.JWT_SECRET || 'allatyou-super-secret-key';

export const requireAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Autorización requerida. Token faltante.' });
      return;
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as { empresa_id: string, email: string, device_id?: string };
    
    // Si el token incluye un device_id, requiere validación estricta
    if (decoded.device_id) {
      // 1. Re-calcular fingerprint
      const currentFingerprint = generateDeviceFingerprint(req);
      
      // 2. Verificar estado en base de datos
      const { data: device, error } = await supabase
        .from('taller_dispositivos_autorizados')
        .select('fingerprint_hash, is_active, expires_at')
        .eq('id', decoded.device_id)
        .single();
        
      if (error || !device) {
        res.status(401).json({ error: 'Sesión no encontrada o revocada.' });
        return;
      }
      
      if (!device.is_active) {
        res.status(401).json({ error: 'Esta sesión ha sido revocada remotamente.' });
        return;
      }
      
      if (new Date(device.expires_at) < new Date()) {
        res.status(401).json({ error: 'La sesión persistente ha expirado.' });
        return;
      }
      
      // 3. Verificar robo de token (Token Hijacking)
      if (device.fingerprint_hash !== currentFingerprint) {
        console.warn(`[Seguridad] Intento de uso de token robado detectado. Device ID: ${decoded.device_id}`);
        // Opcional: Podríamos revocarlo aquí mismo automáticamente por seguridad
        // await supabase.from('taller_dispositivos_autorizados').update({ is_active: false }).eq('id', decoded.device_id);
        res.status(403).json({ error: 'Brecha de seguridad detectada: Entorno no coincide. Inicia sesión nuevamente.' });
        return;
      }
      
      // Actualización asíncrona de last_used_at (no esperamos a que termine)
      supabase.from('taller_dispositivos_autorizados')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', decoded.device_id)
        .then(({ error }) => {
          if (error) console.error('Error updating device last_used_at', error);
        });
    }

    req.empresa_id = decoded.empresa_id;
    req.user_email = decoded.email;

    next();
  } catch (error) {
    res.status(403).json({ error: 'Token inválido o expirado.' });
  }
};
