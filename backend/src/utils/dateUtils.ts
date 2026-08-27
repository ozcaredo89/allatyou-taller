/**
 * dateUtils.ts
 * Helpers de fecha anclados a la zona horaria America/Bogota (UTC-5).
 * Usan Intl.DateTimeFormat para ser correctos independientemente de la zona horaria
 * del servidor o del proceso en ejecución.
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
 * Convierte un timestamp (ISO string, Date, o epoch ms) a "YYYY-MM-DD" en zona Bogotá.
 * Ejemplo: "2026-08-27T01:00:00Z" → "2026-08-26" (en UTC-5)
 */
export function toBogotaDateStr(input: string | Date | number): string {
  const d = input instanceof Date ? input : new Date(input);
  return bogotaFormatter.format(d);
}

/**
 * Devuelve la fecha "hoy" en zona Bogotá como "YYYY-MM-DD".
 */
export function bogotaToday(base?: Date): string {
  return toBogotaDateStr(base ?? new Date());
}

/**
 * Calcula el rango { startStr, endStr } en formato "YYYY-MM-DD" para el filtro dado,
 * siempre anclado a America/Bogota.
 */
export function getBogotaRange(
  filtro: 'hoy' | 'ayer' | 'semana' | 'mes',
  base?: Date
): { startStr: string; endStr: string } {
  const now = base ?? new Date();
  const endStr = toBogotaDateStr(now);

  if (filtro === 'hoy') {
    return { startStr: endStr, endStr };
  }

  if (filtro === 'ayer') {
    const yesterday = new Date(now);
    yesterday.setUTCDate(now.getUTCDate() - 1);
    // Restar 1 día al timestamp y reformat en Bogotá
    const d = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const s = toBogotaDateStr(d);
    return { startStr: s, endStr: s };
  }

  if (filtro === 'semana') {
    const d = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
    return { startStr: toBogotaDateStr(d), endStr };
  }

  // 'mes' → últimos 29 días + hoy = 30 días
  const d = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
  return { startStr: toBogotaDateStr(d), endStr };
}
