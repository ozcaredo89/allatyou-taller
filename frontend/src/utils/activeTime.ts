import { trackEvent } from './analytics';

const IDLE_MS = 60_000;
const REPORT_MS = 30_000;
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

export function trackActiveTime(seccion: string): () => void {
  let visible = document.visibilityState === 'visible';
  let lastSample = performance.now();
  let activeUntil = 0;
  let pendingMs = 0;

  function sample(now: number) {
    if (visible) pendingMs += Math.max(0, Math.min(now, activeUntil) - lastSample);
    lastSample = now;
  }

  function report() {
    sample(performance.now());
    const segundos_activos = Math.floor(pendingMs / 1000);
    if (segundos_activos === 0) return;
    pendingMs -= segundos_activos * 1000;
    trackEvent('modulo.tiempo_activo', { seccion, segundos_activos });
  }

  function onActivity() {
    if (!visible) return;
    const now = performance.now();
    sample(now);
    activeUntil = now + IDLE_MS;
  }

  function onVisibilityChange() {
    report();
    visible = document.visibilityState === 'visible';
    activeUntil = 0;
  }

  for (const event of ACTIVITY_EVENTS) {
    window.addEventListener(event, onActivity, { passive: true, capture: true });
  }
  document.addEventListener('visibilitychange', onVisibilityChange);
  const timer = window.setInterval(report, REPORT_MS);

  return () => {
    window.clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    for (const event of ACTIVITY_EVENTS) window.removeEventListener(event, onActivity, true);
    report();
  };
}
