/**
 * analytics.ts
 * Wrapper resiliente sobre posthog-js con política estricta Zero-PII.
 *
 * - Si VITE_PUBLIC_POSTHOG_KEY no está configurada, la app opera
 *   normalmente: initAnalytics() y trackEvent() son no-ops silenciosos.
 * - Nunca se capturan datos personales (placas, nombres, teléfonos).
 * - autocapture y pageviews automáticos desactivados; solo eventos manuales.
 * - persistence: 'memory' → sin cookies ni localStorage de analytics.
 */

import posthog from 'posthog-js';

let initialized = false;

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

export function trackEvent(eventName: string, properties?: Record<string, unknown>): void {
  if (!initialized) return;
  try {
    posthog.capture(eventName, properties);
  } catch {
    // Analytics nunca debe romper la UI
  }
}
