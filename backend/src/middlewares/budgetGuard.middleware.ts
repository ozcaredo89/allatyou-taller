import { Request, Response, NextFunction } from 'express';
import { supabase } from '../config/supabase';
import { logearIntento } from './utils/logearIntento';

// Tope global diario en USD — si se supera, todos los talleres quedan sin servicio hasta mañana.
const LIMITE_GLOBAL_DIARIO_USD = parseFloat(process.env.AI_BUDGET_GLOBAL_USD || '2.00');

/**
 * Obtiene la fecha actual en zona horaria Colombia (America/Bogota) en formato 'YYYY-MM-DD'.
 * Crítico: CURRENT_DATE en Postgres usa UTC por defecto en Supabase.
 * Aquí calculamos la fecha Colombia en Node para hacer queries consistentes.
 */
function fechaBogota(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
}

/**
 * Respuesta de bloqueo consistente con payload de fallback para el widget.
 * Función síncrona — garantiza que res.status().json() siempre se ejecuta.
 */
function respuestaBloqueo(res: Response, mensaje: string): void {
  res.status(503).json({
    error: 'El asistente virtual no está disponible en este momento.',
    fallback: true,
    mensaje,
  });
}

// logearIntento importado desde utils/logearIntento.ts — helper compartido
// entre tenantGuard y budgetGuard para garantizar que el rate limiter por IP
// siempre cuente TODOS los intentos, incluso los rechazados antes de llegar al controller.

/**
 * Middleware: Circuit Breaker de Presupuesto (Budget Guard)
 *
 * Se ejecuta DESPUÉS de tenantGuard, que ya validó el slug y cargó config_ai.
 * Verifica dos condiciones:
 *  1. Presupuesto global del sistema (LIMITE_GLOBAL_DIARIO_USD).
 *  2. Presupuesto individual del taller (config_ai.presupuesto_diario_usd).
 *
 * OPTIMIZACIÓN: Lee config_ai desde req.empresaConfigAI (adjuntado por tenantGuard)
 * en lugar de volver a consultar taller_empresas — 1 round-trip en vez de 2.
 *
 * DECISIÓN DE FAIL-CLOSED:
 * A diferencia del rate limiter (anti-abuso, falla abierto), este middleware
 * falla CERRADO ante cualquier error de infraestructura.
 * Justificación: si Supabase tiene un timeout mientras estamos cerca del límite,
 * "chatbot caído por unos minutos" > "cobro sorpresa en Gemini/OpenAI".
 * El fallback de WhatsApp cubre la atención al cliente durante ese tiempo.
 *
 * Nota sobre el soft-overshoot: el costo real se conoce DESPUÉS de la respuesta
 * del LLM (depende de tokens de salida). Dos requests concurrentes que entren
 * justo al límite pueden generar un sobrepaso de ~$0.001-0.003 USD. Aceptado.
 */
export async function budgetGuard(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const empresaSlug = (req.body?.empresa_slug as string | undefined) ?? 'unknown';
  const ipHash = (req as any).ipHash ?? 'unknown';
  const hoy = fechaBogota();

  try {
    // 1. Verificar presupuesto global
    const { data: globalRows, error: errGlobal } = await supabase
      .from('taller_ai_uso_global')
      .select('costo_estimado_usd')
      .eq('fecha', hoy);

    if (errGlobal) {
      console.error('[BudgetGuard] Error crítico al consultar gasto global, bloqueando por seguridad:', errGlobal.message);
      logearIntento({ empresaSlug, ipHash, motivo: 'error_db_global' });
      respuestaBloqueo(res, 'Contáctanos directamente para cotizar.');
      return;
    }

    const costoTotalGlobal = (globalRows ?? []).reduce((acc, r) => acc + (r.costo_estimado_usd || 0), 0);
    if (costoTotalGlobal >= LIMITE_GLOBAL_DIARIO_USD) {
      logearIntento({ empresaSlug, ipHash, motivo: 'limite_global' });
      respuestaBloqueo(res, 'Nuestro asistente ha alcanzado el límite de uso del día. Por favor contáctanos directamente.');
      return;
    }

    // 2. Verificar presupuesto del taller
    //    config_ai ya fue validado y cargado por tenantGuard — sin segundo round-trip.
    const configAI = (req as any).empresaConfigAI as Record<string, any> | undefined;

    if (!configAI) {
      // tenantGuard debería haber puesto esto. Si no está, es un error de configuración
      // del pipeline — fail-closed para no asumir nada sobre el presupuesto.
      console.error('[BudgetGuard] req.empresaConfigAI no encontrado. ¿Está tenantGuard en el pipeline antes que budgetGuard?');
      logearIntento({ empresaSlug, ipHash, motivo: 'error_pipeline' });
      respuestaBloqueo(res, 'Contáctanos directamente para cotizar.');
      return;
    }

    const limiteTenant: number = configAI.presupuesto_diario_usd ?? 0.50;

    const { data: tenantUsage, error: errTenant } = await supabase
      .from('taller_ai_uso_diario')
      .select('costo_estimado_usd')
      .eq('empresa_slug', empresaSlug)
      .eq('fecha', hoy);

    if (errTenant) {
      console.error('[BudgetGuard] Error crítico al consultar uso de tenant, bloqueando por seguridad:', errTenant.message);
      logearIntento({ empresaSlug, ipHash, motivo: 'error_db_uso_tenant' });
      respuestaBloqueo(res, 'Contáctanos directamente para cotizar.');
      return;
    }

    const costoTenant = (tenantUsage ?? []).reduce((acc, r) => acc + (r.costo_estimado_usd || 0), 0);
    if (costoTenant >= limiteTenant) {
      logearIntento({ empresaSlug, ipHash, motivo: 'limite_tenant' });
      respuestaBloqueo(res, 'El asistente ha alcanzado su límite de uso de hoy. Contáctanos directamente para cotizar.');
      return;
    }

    next();
  } catch (err) {
    // Fail-CLOSED: cualquier excepción inesperada bloquea la petición.
    // Preferimos un chatbot temporalmente caído a un cobro sorpresa.
    console.error('[BudgetGuard] Error inesperado al verificar presupuesto, bloqueando por seguridad:', err);
    logearIntento({ empresaSlug, ipHash, motivo: 'error_inesperado' });
    respuestaBloqueo(res, 'Contáctanos directamente para cotizar.');
  }
}
