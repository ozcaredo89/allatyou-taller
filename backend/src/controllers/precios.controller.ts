import { Request, Response, NextFunction } from 'express';
import {
  obtenerVehiculosDisponibles,
  obtenerMatrizPreciosVehiculo,
  obtenerAuditoriaItem,
} from '../services/catalog.service';

// Express req.query can be string | string[] | ParsedQs - extract plain string safely.
function qs(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0] as string;
  return undefined;
}

// ─── Middleware: Validacion del token beta (fail-closed) ──────────────────────
//
// PROPOSITO: Friccion para la fase beta privada + prevencion de indexacion accidental.
// NO es autenticacion criptografica - el token va en URL y puede aparecer en logs/historiales.
// Se ejecuta PRIMERO en el router, ANTES de distributedRateLimiter o tenantGuard,
// garantizando CERO consultas a Supabase si el token es invalido o ausente.
// Si PRECIOS_BETA_TOKEN no esta en el entorno, falla cerrado (503).
export const betaTokenGuard = (req: Request, res: Response, next: NextFunction): void => {
  const expectedToken = process.env.PRECIOS_BETA_TOKEN;

  if (!expectedToken) {
    res.status(503).json({
      error: 'Modulo de precios beta temporalmente no disponible.',
    });
    return;
  }

  const receivedToken = Array.isArray(req.query.ef_token)
    ? req.query.ef_token[0]
    : (req.query.ef_token as string | undefined);

  if (receivedToken !== expectedToken) {
    res.status(403).json({ error: 'Acceso no autorizado. Enlace beta requerido.' });
    return;
  }

  next();
};

// GET /api/public/precios/:slug/vehiculos
// Lista marcas y lineas disponibles (con datos en los ultimos 180 dias).
export const getVehiculosConPrecios = async (req: Request, res: Response): Promise<void> => {
  const slug = req.params.slug as string;
  const tenantId = (req as any).tenantId;
  const configAI = (req as any).empresaConfigAI;

  try {
    const vehiculos = await obtenerVehiculosDisponibles(slug, tenantId, configAI);
    res.json({ vehiculos });
  } catch (err: any) {
    console.error('[Precios] Error en getVehiculosConPrecios:', err.message);
    res.status(500).json({ error: 'Error interno al obtener vehiculos disponibles.' });
  }
};

// GET /api/public/precios/:slug/matriz?marca=X&linea=Y
// Tabla de precios para un vehiculo concreto. Solo items con >= 3 ocurrencias.
export const getMatrizPrecios = async (req: Request, res: Response): Promise<void> => {
  const slug = req.params.slug as string;
  const tenantId = (req as any).tenantId;
  const configAI = (req as any).empresaConfigAI;
  const marca = qs(req.query.marca)?.trim();
  const linea = qs(req.query.linea)?.trim();

  if (!marca || !linea) {
    res.status(400).json({ error: 'Se requieren los parametros ?marca= y ?linea=' });
    return;
  }

  try {
    const items = await obtenerMatrizPreciosVehiculo(slug, marca!, linea!, tenantId, configAI);
    res.json({ marca, linea, items });
  } catch (err: any) {
    console.error('[Precios] Error en getMatrizPrecios:', err.message);
    res.status(500).json({ error: 'Error interno al calcular la matriz de precios.' });
  }
};

// GET /api/public/precios/:slug/auditoria?marca=X&linea=Y&item=Z
// Casos anonimizados que componen el promedio de un item.
// HABEAS DATA: No expone nombres, telefonos, placas completas ni descripcion cruda de clientes.
export const getAuditoriaPrecios = async (req: Request, res: Response): Promise<void> => {
  const slug = req.params.slug as string;
  const tenantId = (req as any).tenantId;
  const configAI = (req as any).empresaConfigAI;
  const marca = qs(req.query.marca)?.trim();
  const linea = qs(req.query.linea)?.trim();
  const item = qs(req.query.item)?.trim();

  if (!marca || !linea || !item) {
    res.status(400).json({ error: 'Se requieren los parametros ?marca=, ?linea= e ?item=' });
    return;
  }

  try {
    const casos = await obtenerAuditoriaItem(slug, marca!, linea!, item!, tenantId, configAI);
    res.json({ marca, linea, item, casos });
  } catch (err: any) {
    console.error('[Precios] Error en getAuditoriaPrecios:', err.message);
    res.status(500).json({ error: 'Error interno al obtener la auditoria del item.' });
  }
};
