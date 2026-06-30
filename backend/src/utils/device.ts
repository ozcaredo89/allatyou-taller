import crypto from 'crypto';
import { Request } from 'express';

const DEVICE_SALT = process.env.JWT_SECRET || 'allatyou-super-secret-key';

export const generateDeviceFingerprint = (req: Request): string => {
  // En base a la recomendación, usamos el User-Agent + Salt secreto
  // Evitamos la IP para no causar deslogueos al cambiar de red (ej. WiFi a 4G)
  const userAgent = req.headers['user-agent'] || 'unknown-device';
  
  return crypto
    .createHash('sha256')
    .update(`${userAgent}-${DEVICE_SALT}`)
    .digest('hex');
};

export const getDeviceName = (req: Request): string => {
  const userAgent = req.headers['user-agent'] || 'Dispositivo Desconocido';
  // Lógica simple para extraer el nombre del dispositivo
  // Podríamos usar una librería como uaparser.js, pero para no añadir dependencias:
  if (userAgent.includes('Windows')) return 'Windows PC';
  if (userAgent.includes('Mac OS')) return 'Mac';
  if (userAgent.includes('iPhone')) return 'iPhone';
  if (userAgent.includes('iPad')) return 'iPad';
  if (userAgent.includes('Android')) return 'Android Device';
  if (userAgent.includes('Linux')) return 'Linux PC';
  return 'Dispositivo Genérico';
};
