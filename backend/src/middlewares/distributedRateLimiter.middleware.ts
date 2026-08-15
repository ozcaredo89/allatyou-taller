import { Request, Response, NextFunction } from 'express';
import { supabase } from '../config/supabase';
import crypto from 'crypto';

// Configuración de ventanas y límites
const VENTANA_MS = 10 * 60 * 1000; // 10 minutos en milisegundos
const LIMITE_POR_IP = 15;           // max peticiones por IP en la ventana
const LIMITE_POR_TENANT = 60;       // max peticiones por empresa_slug en la ventana

/**
 * Genera un hash SHA-256 de una cadena.
 * Usado para anonimizar IPs en logs sin exponer datos personales.
 */
function hashearIdentificador(valor: string): string {
  return crypto.createHash('sha256').update(valor).digest('hex').slice(0, 16);
}

/**
 * Ventana de tiempo desde ahora menos VENTANA_MS, en formato ISO.
 */
function inicioVentana(): string {
  return new Date(Date.now() - VENTANA_MS).toISOString();
}

/**
 * Middleware: Rate Limiting Distribuido respaldado en Postgres/Supabase
 *
 * A diferencia del rate limiting en memoria (que no funciona en entornos
 * serverless o con múltiples instancias de Railway), este middleware consulta
 * la tabla taller_ai_conversaciones_log en Supabase para contar peticiones reales
 * por IP y por tenant en los últimos 10 minutos.
 *
 * Estrategia dual:
 *  - Por IP:     Evita abusos de un usuario o bot específico.
 *  - Por Tenant: Evita que un atacante drene el presupuesto de un taller.
 */
export async function distributedRateLimiter(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  const ipHash = hashearIdentificador(ip);
  const empresaSlug = (req.body?.empresa_slug as string | undefined) || 'unknown';
  const desde = inicioVentana();

  try {
    // Verificar límite por IP
    const { count: countIp, error: errIp } = await supabase
      .from('taller_ai_conversaciones_log')
      .select('*', { count: 'exact', head: true })
      .eq('ip_hash', ipHash)
      .gte('created_at', desde);

    if (errIp) {
      // Si hay error de BD, dejamos pasar (fail-open en rate limiting, fail-closed en seguridad)
      console.error('[RateLimit] Error consultando IP en Supabase:', errIp.message);
      next();
      return;
    }

    if ((countIp ?? 0) >= LIMITE_POR_IP) {
      res.status(429).json({
        error: 'Demasiadas solicitudes. Por favor, espera unos minutos antes de continuar.',
        retry_after_seconds: Math.ceil(VENTANA_MS / 1000),
      });
      return;
    }

    // Verificar límite por tenant
    if (empresaSlug !== 'unknown') {
      const { count: countTenant, error: errTenant } = await supabase
        .from('taller_ai_conversaciones_log')
        .select('*', { count: 'exact', head: true })
        .eq('empresa_slug', empresaSlug)
        .gte('created_at', desde);

      if (!errTenant && (countTenant ?? 0) >= LIMITE_POR_TENANT) {
        res.status(429).json({
          error: 'El servicio de este taller está temporalmente ocupado. Intenta en unos minutos.',
          retry_after_seconds: Math.ceil(VENTANA_MS / 1000),
        });
        return;
      }
    }

    // Adjuntar el hash de IP al request para que el controller lo use en el log
    (req as any).ipHash = ipHash;
    next();
  } catch (err) {
    // Fail-open: si el rate limiter falla por error inesperado, no bloqueamos producción
    console.error('[RateLimit] Error inesperado en distributedRateLimiter:', err);
    next();
  }
}
