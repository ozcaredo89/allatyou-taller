import { supabase } from '../config/supabase';
import { sendEmail } from './emailService';
import {
  IAiProvider,
  MensajeChat,
  ResultadoIA,
  GeminiProvider,
  OpenAIProvider,
  StaticFallbackProvider,
} from './aiProvider.adapter';

// Tope global diario en USD (se lee del mismo env que budgetGuard)
const LIMITE_GLOBAL_USD = parseFloat(process.env.AI_BUDGET_GLOBAL_USD || '2.00');

// Email del administrador de la plataforma para recibir alertas
const ADMIN_EMAIL = process.env.ADMIN_ALERT_EMAIL || 'oscar.hv89@gmail.com';

/**
 * Obtiene la fecha actual en zona horaria Colombia (America/Bogota).
 */
function fechaBogota(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
}

/**
 * Lista ordenada de proveedores de IA (primario → fallbacks).
 * El router intenta cada proveedor en orden. Si uno falla o no está disponible,
 * pasa automáticamente al siguiente.
 */
const PROVEEDORES: IAiProvider[] = [
  new GeminiProvider(),
  new OpenAIProvider(),
  new StaticFallbackProvider(),
];

/**
 * AI Router Service
 *
 * Orquesta el ciclo completo de una petición de IA pública:
 *  1. Selecciona el proveedor disponible con menor prioridad de costo.
 *  2. Invoca el LLM con el prompt y el historial sanitizado.
 *  3. Acumula el costo en Supabase vía RPC atómica.
 *  4. Dispara alertas de correo al 70% y 100% del presupuesto (deduplicado).
 *  5. Registra la conversación en el log de auditoría.
 */
export async function routerIA(params: {
  systemPrompt: string;
  historial: MensajeChat[];
  ultimoMensaje: string;
  empresaSlug: string;
  ipHash: string;
}): Promise<ResultadoIA> {
  const { systemPrompt, historial, ultimoMensaje, empresaSlug, ipHash } = params;

  let resultado: ResultadoIA | null = null;
  let ultimoError: Error | null = null;

  // Intentar cada proveedor en orden de prioridad
  for (const proveedor of PROVEEDORES) {
    if (!proveedor.estaDisponible()) continue;

    try {
      resultado = await proveedor.chat({ systemPrompt, historial, ultimoMensaje });
      break; // Si el proveedor respondió bien, salimos del loop
    } catch (err: any) {
      ultimoError = err;
      console.warn(
        `[AIRouter] Proveedor "${proveedor.nombre}" falló. ` +
        `Motivo: ${err.message}. Intentando siguiente proveedor...`
      );
    }
  }

  if (!resultado) {
    // Esto no debería ocurrir porque StaticFallbackProvider siempre devuelve algo
    throw ultimoError ?? new Error('Todos los proveedores de IA fallaron.');
  }

  // Post-llamada: registrar uso (solo si no fue el fallback estático)
  if (resultado.proveedor !== 'static_fallback') {
    acumularYAlertar({
      proveedor: resultado.proveedor,
      empresaSlug,
      ipHash,
      tokensIn: resultado.tokens_in,
      tokensOut: resultado.tokens_out,
      costoUsd: resultado.costo_usd,
    }).catch(err => {
      // Error no bloqueante: el usuario ya recibió su respuesta
      console.error('[AIRouter] Error al registrar uso post-llamada:', err);
    });
  }

  return resultado;
}

/**
 * Acumula el costo de la llamada en Supabase y dispara alertas de correo
 * de forma deduplicada (máximo 1 correo por nivel por día).
 *
 * Este proceso corre de forma asíncrona DESPUÉS de enviar la respuesta al usuario.
 */
async function acumularYAlertar(params: {
  proveedor: string;
  empresaSlug: string;
  ipHash: string;
  tokensIn: number;
  tokensOut: number;
  costoUsd: number;
}): Promise<void> {
  const { proveedor, empresaSlug, ipHash, tokensIn, tokensOut, costoUsd } = params;

  try {
    // 1. Acumular costo vía RPC atómica (zona horaria America/Bogota)
    const { data: rpcResult, error: rpcError } = await supabase.rpc('acumular_costo_diario', {
      p_proveedor: proveedor,
      p_empresa_slug: empresaSlug,
      p_costo: costoUsd,
      p_tokens_in: tokensIn,
      p_tokens_out: tokensOut,
    });

    if (rpcError) {
      console.error('[AIRouter] Error en RPC acumular_costo_diario:', rpcError);
      return;
    }

    const estado = rpcResult as {
      fecha: string;
      costo_global_usd: number;
      alerta_70_enviada: boolean;
      alerta_100_enviada: boolean;
      bloqueado: boolean;
    };

    const costoGlobal = estado.costo_global_usd;
    const umbral70 = LIMITE_GLOBAL_USD * 0.7;
    const hoy = fechaBogota();

    // 2. Verificar si debemos enviar alerta al 70% (deduplicado)
    if (costoGlobal >= umbral70 && !estado.alerta_70_enviada) {
      await marcarAlerta(proveedor, '70');
      await enviarAlertaPresupuesto({
        nivel: '70',
        costoActual: costoGlobal,
        limite: LIMITE_GLOBAL_USD,
        proveedor,
        fecha: hoy,
      });
    }

    // 3. Verificar si debemos enviar alerta al 100% (deduplicado)
    if (costoGlobal >= LIMITE_GLOBAL_USD && !estado.alerta_100_enviada) {
      await marcarAlerta(proveedor, '100');
      await enviarAlertaPresupuesto({
        nivel: '100',
        costoActual: costoGlobal,
        limite: LIMITE_GLOBAL_USD,
        proveedor,
        fecha: hoy,
      });
    }

    // 4. Registrar en el log de auditoría
    await supabase.from('taller_ai_conversaciones_log').insert({
      empresa_slug: empresaSlug,
      proveedor,
      ip_hash: ipHash,
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      costo_usd: costoUsd,
      fue_bloqueado: false,
    });

  } catch (err) {
    console.error('[AIRouter] Error en acumularYAlertar:', err);
  }
}

/**
 * Marca un nivel de alerta como enviado en Supabase (deduplicación).
 */
async function marcarAlerta(proveedor: string, nivel: '70' | '100'): Promise<void> {
  const { error } = await supabase.rpc('marcar_alerta_enviada', {
    p_proveedor: proveedor,
    p_nivel: nivel,
  });
  if (error) {
    console.error(`[AIRouter] Error marcando alerta ${nivel}:`, error);
  }
}

/**
 * Envía un correo de alerta al administrador de la plataforma.
 */
async function enviarAlertaPresupuesto(params: {
  nivel: '70' | '100';
  costoActual: number;
  limite: number;
  proveedor: string;
  fecha: string;
}): Promise<void> {
  const { nivel, costoActual, limite, proveedor, fecha } = params;
  const porcentaje = Math.round((costoActual / limite) * 100);
  const esLimite = nivel === '100';

  const subject = esLimite
    ? `🔴 [TallerPro AI] Límite diario alcanzado — Chatbot bloqueado (${proveedor})`
    : `⚠️ [TallerPro AI] Gasto IA al ${porcentaje}% del límite diario (${proveedor})`;

  const text = esLimite
    ? `El chatbot público (proveedor: ${proveedor}) ha alcanzado el límite diario de gasto.\n\nGasto: $${costoActual.toFixed(4)} USD / $${limite.toFixed(2)} USD\nFecha (Bogotá): ${fecha}\n\nEl servicio está temporalmente bloqueado hasta el próximo día. Se activa el fallback de WhatsApp automáticamente.`
    : `El gasto del chatbot público (proveedor: ${proveedor}) ha alcanzado el ${porcentaje}% del límite diario.\n\nGasto: $${costoActual.toFixed(4)} USD / $${limite.toFixed(2)} USD\nFecha (Bogotá): ${fecha}\n\nRevisa el panel de administración si es necesario ajustar el presupuesto.`;

  try {
    await sendEmail({ to: ADMIN_EMAIL, subject, text });
  } catch (err) {
    console.error('[AIRouter] Error enviando alerta por correo:', err);
  }
}
