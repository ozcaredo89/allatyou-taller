import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { Response, Router } from 'express';
import { Pool } from 'pg';
import { JWT_SECRET } from '../config/jwt';
import { supabase } from '../config/supabase';
import { requireAuth } from '../middlewares/auth.middleware';

const db = process.env.DATABASE_URL ? new Pool({
  connectionString: process.env.DATABASE_URL,
  // Misma política TLS que el ejecutor de migraciones.
  ssl: { rejectUnauthorized: false },
  max: 3,
  connectionTimeoutMillis: 5000
}) : undefined;
const enlaces = 'public.taller_seguimiento_enlaces';
const publicaciones = 'public.taller_seguimiento_publicaciones';
const camposPublicacion = 'evento_id,mensaje,fecha_entrega_estimada,publicado_at';
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

function database() {
  if (!db) throw new Error('DATABASE_URL no está configurada.');
  return db;
}

db?.on('error', error => console.error('[seguimiento-cliente]', error.message));

function firma(nonce: string) {
  return createHmac('sha256', JWT_SECRET).update('seguimiento-cliente:' + nonce).digest();
}

function responderError(res: Response, error: unknown) {
  console.error('[seguimiento-cliente]', error);
  res.status(500).json({ error: 'No se pudo procesar el seguimiento.' });
}

export const seguimientoInterno = Router();
seguimientoInterno.use('/:id/seguimiento-cliente', requireAuth, async (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  const { id } = req.params;
  if (!req.empresa_id || typeof id !== 'string' || !uuid.test(id)) {
    res.sendStatus(404);
    return;
  }

  try {
    const { data, error } = await supabase.from('taller_ingresos').select('id,fecha_entrega_estimada')
      .eq('empresa_id', req.empresa_id).eq('id', id).maybeSingle();
    if (error) throw error;
    if (!data) {
      res.sendStatus(404);
      return;
    }
    res.locals.fechaEntrega = data.fecha_entrega_estimada;
    next();
  } catch (error) {
    responderError(res, error);
  }
});

seguimientoInterno.get('/:id/seguimiento-cliente', async (req, res) => {
  try {
    const [link, avances] = await Promise.all([
      database().query(`SELECT nonce, vence_at FROM ${enlaces}
        WHERE empresa_id = $1 AND ingreso_id = $2 AND vence_at > now()`, [req.empresa_id, req.params.id]),
      database().query(`SELECT ${camposPublicacion} FROM ${publicaciones}
        WHERE empresa_id = $1 AND ingreso_id = $2 ORDER BY publicado_at DESC LIMIT 1000`, [req.empresa_id, req.params.id])
    ]);
    const enlace = link.rows[0];
    res.json({
      enlace: enlace ? { token: enlace.nonce + '.' + firma(enlace.nonce).toString('hex'), vence_at: enlace.vence_at } : null,
      publicaciones: avances.rows
    });
  } catch (error) {
    responderError(res, error);
  }
});

seguimientoInterno.post('/:id/seguimiento-cliente/enlace', async (req, res) => {
  try {
    const nonce = randomUUID();
    const vence_at = new Date(Date.now() + 30 * 86400 * 1000).toISOString();
    const { rowCount } = await database().query(`INSERT INTO ${enlaces} AS enlace (ingreso_id, empresa_id, nonce, vence_at)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (ingreso_id) DO UPDATE SET nonce = EXCLUDED.nonce, vence_at = EXCLUDED.vence_at
      WHERE enlace.empresa_id = EXCLUDED.empresa_id`, [req.params.id, req.empresa_id, nonce, vence_at]);
    if (!rowCount) {
      res.sendStatus(404);
      return;
    }
    res.json({ token: nonce + '.' + firma(nonce).toString('hex'), vence_at });
  } catch (error) {
    responderError(res, error);
  }
});

seguimientoInterno.delete('/:id/seguimiento-cliente/enlace', async (req, res) => {
  try {
    await database().query(`DELETE FROM ${enlaces} WHERE empresa_id = $1 AND ingreso_id = $2`,
      [req.empresa_id, req.params.id]);
    res.sendStatus(204);
  } catch (error) {
    responderError(res, error);
  }
});

seguimientoInterno.put('/:id/seguimiento-cliente/avances/:eventoId', async (req, res) => {
  const { id, eventoId } = req.params;
  const mensaje = typeof req.body?.mensaje === 'string' ? req.body.mensaje.trim() : '';
  if (!uuid.test(eventoId) || !mensaje || mensaje.length > 2000) {
    res.status(400).json({ error: 'Escribe un mensaje de hasta 2000 caracteres.' });
    return;
  }
  try {
    const { data, error } = await supabase.from('taller_ingresos_bitacora').select('id')
      .eq('empresa_id', req.empresa_id).eq('ingreso_id', id).eq('id', eventoId)
      .in('tipo_evento', ['seguimiento', 'reprogramacion']).maybeSingle();
    if (error) throw error;
    if (!data) {
      res.sendStatus(404);
      return;
    }

    const { rows } = await database().query(`INSERT INTO ${publicaciones} AS publicacion
      (evento_id, empresa_id, ingreso_id, mensaje, fecha_entrega_estimada) VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (evento_id) DO UPDATE SET mensaje = EXCLUDED.mensaje,
        fecha_entrega_estimada = EXCLUDED.fecha_entrega_estimada, publicado_at = now()
      WHERE publicacion.empresa_id = EXCLUDED.empresa_id AND publicacion.ingreso_id = EXCLUDED.ingreso_id
      RETURNING ${camposPublicacion}`,
    [eventoId, req.empresa_id, id, mensaje, req.body.mostrar_fecha === true ? res.locals.fechaEntrega : null]);
    if (!rows.length) {
      res.sendStatus(404);
      return;
    }
    res.json(rows[0]);
  } catch (error) {
    responderError(res, error);
  }
});

seguimientoInterno.delete('/:id/seguimiento-cliente/avances/:eventoId', async (req, res) => {
  if (!uuid.test(req.params.eventoId)) {
    res.sendStatus(404);
    return;
  }
  try {
    await database().query(`DELETE FROM ${publicaciones} WHERE empresa_id = $1 AND ingreso_id = $2 AND evento_id = $3`,
      [req.empresa_id, req.params.id, req.params.eventoId]);
    res.sendStatus(204);
  } catch (error) {
    responderError(res, error);
  }
});

export const seguimientoPublico = Router();
seguimientoPublico.get('/', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.set('X-Robots-Tag', 'noindex, nofollow');
  const [nonce, signature, extra] = (req.get('Authorization')?.match(/^Bearer (\S+)$/)?.[1] ?? '').split('.');
  if (!uuid.test(nonce) || !/^[a-f0-9]{64}$/.test(signature ?? '') || extra !== undefined ||
      !timingSafeEqual(firma(nonce), Buffer.from(signature, 'hex'))) {
    res.sendStatus(404);
    return;
  }

  try {
    const { rows: [link] } = await database().query(`SELECT empresa_id, ingreso_id FROM ${enlaces}
      WHERE nonce = $1 AND vence_at > now()`, [nonce]);
    if (!link) {
      res.sendStatus(404);
      return;
    }
    const [visita, avances] = await Promise.all([
      supabase.from('taller_ingresos').select('estado,taller_vehiculos(placa,marca,linea)')
        .eq('empresa_id', link.empresa_id).eq('id', link.ingreso_id).maybeSingle(),
      database().query(`SELECT mensaje, fecha_entrega_estimada, publicado_at FROM ${publicaciones}
        WHERE empresa_id = $1 AND ingreso_id = $2 ORDER BY publicado_at DESC, evento_id DESC LIMIT 1000`,
      [link.empresa_id, link.ingreso_id])
    ]);
    if (visita.error) throw visita.error;
    if (!visita.data) {
      res.sendStatus(404);
      return;
    }
    res.json({
      estado: visita.data.estado,
      vehiculo: visita.data.taller_vehiculos,
      avances: avances.rows
    });
  } catch (error) {
    responderError(res, error);
  }
});
