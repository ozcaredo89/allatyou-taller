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

import posthog from 'posthog-js';

let initialized = false;
let identified = false;

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

export function trackEvent(eventName: string, properties?: Record<string, unknown>): void {
  if (!initialized) return;
  try {
    posthog.capture(eventName, properties);
  } catch {
    // Analytics nunca debe romper la UI
  }
}

/** Asocia la sesión al taller (tenant). No envía email ni datos de personas. */
export function identifyTaller(empresaId: string, slug: string | null, nombre: string): void {
  if (!initialized) return;
  try {
    posthog.identify(empresaId, { empresa_slug: slug, empresa_nombre: nombre });
    posthog.register({ empresa_slug: slug });
    identified = true;
  } catch {
    // noop
  }
}

export function resetAnalytics(): void {
  if (!initialized || !identified) return;
  try {
    posthog.reset();
    identified = false;
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
