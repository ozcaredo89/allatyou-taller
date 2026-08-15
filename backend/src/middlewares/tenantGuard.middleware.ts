import { Request, Response, NextFunction } from 'express';
import { supabase } from '../config/supabase';
import { logearIntento } from './utils/logearIntento';

/**
 * Middleware: Tenant Guard — Validación Anti-Enumeración
 *
 * PROPÓSITO PRINCIPAL: Respuesta uniforme independientemente de si el slug
 * no existe, el taller tiene el módulo IA desactivado, o cualquier otro
 * motivo de rechazo. Esto impide que un competidor detecte qué talleres
 * existen en la plataforma midiendo diferencias de respuesta (timing, status
 * codes, mensajes de error diferentes).
 *
 * INTEGRACIÓN CON RATE LIMITER:
 * Llama a logearIntento() ANTES de responder el 404, incluso para slugs inválidos.
 * Esto garantiza que el distributedRateLimiter (que cuenta filas en
 * taller_ai_conversaciones_log) acumula los intentos de enumeración y puede
 * disparar el 429 cuando el atacante supere el límite por IP — cerrando el
 * hueco donde un atacante con Turnstile válido podía probar miles de slugs
 * sin que el rate limiter lo detectara.
 *
 * Valida en orden:
 *  1. empresa_slug presente en el body.
 *  2. El slug existe en taller_empresas.
 *  3. config_ai.activo === true para este taller.
 *
 * Si la validación es exitosa, adjunta empresa_id y config_ai al request
 * para que los middlewares siguientes no repitan la consulta.
 */
export async function tenantGuard(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // Mensaje homogéneo — mismo código y mismo texto en todos los casos de rechazo
  const RESPUESTA_UNIFORME = { error: 'Servicio no disponible para este taller.' };

  const ipHash = (req as any).ipHash ?? 'unknown'; // adjuntado por distributedRateLimiter
  const empresaSlug = (req.body?.empresa_slug as string | undefined)?.trim() ?? '';

  if (!empresaSlug) {
    // No hay slug — ni siquiera consultamos la BD, pero sí contamos el intento
    logearIntento({ ipHash, empresaSlug: 'missing', motivo: 'slug_ausente' });
    res.status(404).json(RESPUESTA_UNIFORME);
    return;
  }

  try {
    const { data: empresa, error } = await supabase
      .from('taller_empresas')
      .select('id, config_ai')
      .eq('slug', empresaSlug)
      .single();

    if (error || !empresa || !empresa.config_ai?.activo) {
      // CRÍTICO: loguear ANTES de responder para que distributedRateLimiter
      // cuente este intento en la próxima petición del mismo atacante.
      logearIntento({ ipHash, empresaSlug, motivo: 'tenant_no_valido' });
      res.status(404).json(RESPUESTA_UNIFORME);
      return;
    }

    // Adjuntar datos validados al request para reutilizar downstream
    // y evitar round-trips duplicados a Supabase en los middlewares siguientes.
    (req as any).tenantId = empresa.id;
    (req as any).empresaConfigAI = empresa.config_ai; // consumido por budgetGuard

    next();
  } catch (err) {
    // Fail-closed: si no podemos validar el tenant, no dejamos pasar.
    // Preferimos un 503 temporal a permitir tráfico no validado.
    console.error('[TenantGuard] Error al verificar tenant:', err);
    logearIntento({ ipHash, empresaSlug, motivo: 'error_db_tenant_guard' });
    res.status(503).json({
      error: 'El servicio no está disponible en este momento. Intenta de nuevo en unos segundos.',
    });
  }
}
