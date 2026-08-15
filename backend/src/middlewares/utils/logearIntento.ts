import { supabase } from '../../config/supabase';

/**
 * Registra cualquier intento recibido por el pipeline público de IA
 * en taller_ai_conversaciones_log, independientemente de si fue bloqueado
 * por tenantGuard, budgetGuard, o completado con éxito por el controller.
 *
 * PATRÓN: Fire-and-forget SEGURO.
 * - Promise.resolve() garantiza que .then/.catch están disponibles en el tipo.
 * - La función retorna void síncronamente — nunca puede bloquear el middleware
 *   llamante ni interferir con la respuesta ya enviada al cliente.
 * - Los errores de Supabase solo se loguean a consola; no propagan al caller.
 *
 * USO: Llamar sin await ANTES de res.status().json() para registrar el intento
 * incluso cuando el request es rechazado (404, 429, 503).
 */
export function logearIntento(params: {
  ipHash: string;
  empresaSlug: string;
  motivo: string;
  fueBloqueado?: boolean;
}): void {
  const { ipHash, empresaSlug, motivo, fueBloqueado = true } = params;

  Promise.resolve(
    supabase.from('taller_ai_conversaciones_log').insert({
      empresa_slug: empresaSlug || 'unknown',
      proveedor: motivo,       // El motivo actúa como proveedor para auditoría
      ip_hash: ipHash || 'unknown',
      tokens_in: 0,
      tokens_out: 0,
      costo_usd: 0,
      fue_bloqueado: fueBloqueado,
    })
  ).then(({ error }) => {
    if (error) {
      console.warn(`[logearIntento] No se pudo registrar intento (${motivo}):`, error.message);
    }
  }).catch((err: unknown) => {
    console.warn(`[logearIntento] Error de red al registrar intento (${motivo}):`, err);
  });
}
