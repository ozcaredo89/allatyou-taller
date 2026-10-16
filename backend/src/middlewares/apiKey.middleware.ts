import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { supabase } from '../config/supabase';

declare module 'express-serve-static-core' {
  interface Request {
    api_key_id?: string;
  }
}

export const API_KEY_PREFIX = 'tp_live_';

// Rate limit por key: 120 req/min. En memoria (por instancia); suficiente para
// clientes autenticados con key. Si se escala a varias instancias, migrar a Postgres.
const VENTANA_MS = 60 * 1000;
const LIMITE_POR_KEY = 120;
const usoPorKey = new Map<string, number[]>();

export const hashApiKey = (key: string): string =>
  crypto.createHash('sha256').update(key).digest('hex');

/**
 * Genera una key nueva. La key completa solo se devuelve una vez al crearla.
 */
export const generarApiKey = (): { key: string; prefix: string; hash: string } => {
  const key = API_KEY_PREFIX + crypto.randomBytes(32).toString('base64url');
  return { key, prefix: key.slice(0, API_KEY_PREFIX.length + 4), hash: hashApiKey(key) };
};

const excedeLimite = (keyId: string): boolean => {
  const ahora = Date.now();
  const recientes = (usoPorKey.get(keyId) || []).filter(t => ahora - t < VENTANA_MS);
  recientes.push(ahora);
  usoPorKey.set(keyId, recientes);
  return recientes.length > LIMITE_POR_KEY;
};

/**
 * Middleware: autentica integraciones por header `X-API-Key`.
 * Respuesta uniforme 401 para key faltante, inválida o revocada (no revela cuál).
 * Fail-closed: cualquier error de BD rechaza la petición.
 */
export const requireApiKey = (scope: string) =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const key = req.header('x-api-key');
      if (!key || !key.startsWith(API_KEY_PREFIX)) {
        res.status(401).json({ error: 'API key inválida.' });
        return;
      }

      const { data: apiKey, error } = await supabase
        .from('taller_api_keys')
        .select('id, empresa_id, scopes, activa')
        .eq('key_hash', hashApiKey(key))
        .maybeSingle();

      if (error || !apiKey || !apiKey.activa) {
        res.status(401).json({ error: 'API key inválida.' });
        return;
      }

      if (!(apiKey.scopes || []).includes(scope)) {
        res.status(403).json({ error: 'La API key no tiene permiso para este recurso.' });
        return;
      }

      if (excedeLimite(apiKey.id)) {
        res.status(429).json({
          error: 'Demasiadas solicitudes.',
          retry_after_seconds: Math.ceil(VENTANA_MS / 1000),
        });
        return;
      }

      req.empresa_id = apiKey.empresa_id;
      req.api_key_id = apiKey.id;

      // Actualización asíncrona de ultimo_uso (no bloquea la respuesta)
      supabase.from('taller_api_keys')
        .update({ ultimo_uso: new Date().toISOString() })
        .eq('id', apiKey.id)
        .then(({ error }) => {
          if (error) console.error('[requireApiKey] Error actualizando ultimo_uso:', error.message);
        });

      next();
    } catch (err: any) {
      console.error('[requireApiKey] Error:', err.message);
      res.status(401).json({ error: 'API key inválida.' });
    }
  };
