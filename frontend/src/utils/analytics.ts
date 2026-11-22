/**
 * analytics.ts
 * Wrapper resiliente sobre posthog-js con política estricta Zero-PII.
 *
 * - Si VITE_PUBLIC_POSTHOG_KEY no está configurada, la app opera
 *   normalmente: todas las funciones son no-ops silenciosos.
 * - Nunca se capturan datos personales (placas, nombres de clientes, teléfonos, emails).
 * - La unidad de análisis es el TALLER (empresa_id), no la persona.
 * - autocapture y grabación de sesión desactivados; solo eventos manuales.
 * - persistence: 'memory' → sin cookies ni localStorage de analytics.
 * - Las encuestas de PostHog (Surveys) quedan activas: se lanzan desde el
 *   panel de PostHog sin necesidad de desplegar.
 */

import posthog, { type CaptureOptions } from 'posthog-js';

let initialized = false;
let tallerIdentificado: { id: string; nombre: string } | null = null;

export function initAnalytics(): void {
  const key = import.meta.env.VITE_PUBLIC_POSTHOG_KEY as string | undefined;
  if (!key) return;
  try {
    posthog.init(key, {
      api_host: (import.meta.env.VITE_PUBLIC_POSTHOG_HOST as string | undefined) || 'https://us.i.posthog.com',
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      disable_session_recording: true,
      capture_dead_clicks: false,
      capture_exceptions: false,
      capture_performance: false,
      save_referrer: false,
      save_campaign_params: false,
      before_send: (event) => {
        if (!event) return null;
        for (const properties of [event.properties, event.$set, event.$set_once]) {
          if (!properties) continue;
          for (const key of Object.keys(properties)) {
            if (/url|pathname|referrer|hostname/i.test(key)) delete properties[key];
          }
        }
        return event;
      },
      persistence: 'memory',
    });
    initialized = true;
  } catch {
    // No bloquear la app si PostHog falla al inicializar
  }
}

export function isAnalyticsEnabled(): boolean {
  return initialized;
}

export function trackEvent(
  eventName: string,
  properties?: Record<string, unknown>,
  options?: CaptureOptions,
): void {
  if (!initialized) return;
  try {
    posthog.capture(eventName, properties, options);
  } catch {
    // Analytics nunca debe romper la UI
  }
}

/** Asocia la sesión al taller (tenant). No envía email ni datos de personas. */
export function identifyTaller(empresaId: string, nombre: string): void {
  if (!initialized) return;
  if (tallerIdentificado?.id === empresaId && tallerIdentificado.nombre === nombre) return;
  try {
    if (tallerIdentificado && tallerIdentificado.id !== empresaId) resetAnalytics();
    posthog.identify(empresaId);
    posthog.group('taller', empresaId, { nombre });
    posthog.register({ taller_id: empresaId });
    tallerIdentificado = { id: empresaId, nombre };
  } catch {
    // noop
  }
}

export function resetAnalytics(): void {
  if (!initialized || !tallerIdentificado) return;
  try {
    posthog.reset();
    tallerIdentificado = null;
  } catch {
    // noop
  }
}

/** Pageview manual de SPA. `seccion` va normalizada (sin slug ni ids). */
export function trackPageview(seccion: string): void {
  trackEvent('$pageview', { seccion });
}

export type FeedbackTipo = 'idea' | 'problema' | 'me_gusta';

/** Devuelve false si analytics no está disponible (el feedback no se envió). */
export function sendFeedback(tipo: FeedbackTipo, mensaje: string, seccion: string): boolean {
  if (!initialized) return false;
  try {
    posthog.capture('feedback.enviado', { tipo, mensaje, seccion });
    return true;
  } catch {
    return false;
  }
}

/** `/mi-taller/historial/123` → `historial/:id`; `/mi-taller` → `dashboard`. */
export function seccionDesdePath(pathname: string): string {
  const [, , seccion, detalle] = pathname.split('/');
  if (!seccion) return 'dashboard';
  return detalle ? `${seccion}/:id` : seccion;
}
