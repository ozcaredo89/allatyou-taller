/**
 * dateUtils.ts (frontend)
 * Helpers de fecha anclados a la zona horaria America/Bogota (UTC-5).
 * Usan Intl.DateTimeFormat para funcionar correctamente en cualquier navegador
 * y timezone del usuario (soporte remoto, devs fuera de Colombia, etc.)
 */

const TZ = 'America/Bogota';

/** Formateador reutilizable: produce "YYYY-MM-DD" en zona Bogotá */
const bogotaFormatter = new Intl.DateTimeFormat('sv-SE', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * Convierte cualquier Date o string ISO a "YYYY-MM-DD" en zona Bogotá.
 */
export function toBogotaDateStr(input: string | Date | number): string {
  const d = input instanceof Date ? input : new Date(input);
  return bogotaFormatter.format(d);
}

/**
 * Devuelve la fecha de "hoy" en zona Bogotá como "YYYY-MM-DD".
 */
export function bogotaToday(base?: Date): string {
  return toBogotaDateStr(base ?? new Date());
}

/**
 * Calcula el rango { start, end } en "YYYY-MM-DD" para el filtro dado,
 * siempre anclado a America/Bogota independientemente de la zona horaria
 * del navegador del usuario.
 */
export function getBogotaRange(
  filtro: 'hoy' | 'ayer' | 'semana' | 'mes',
  base?: Date
): { start: string; end: string } {
  const now = base ?? new Date();
  const end = toBogotaDateStr(now);

  if (filtro === 'hoy') {
    return { start: end, end };
  }

  if (filtro === 'ayer') {
    const d = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const s = toBogotaDateStr(d);
    return { start: s, end: s };
  }

  if (filtro === 'semana') {
    const d = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
    return { start: toBogotaDateStr(d), end };
  }

  // 'mes' → últimos 29 días + hoy = 30 días
  const d = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
  return { start: toBogotaDateStr(d), end };
}
