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
 * Calcula el rango { start, end } (lunes a domingo) en "YYYY-MM-DD" en zona Bogotá
 * para la semana desplazada en `offsetWeeks` (0 = semana actual, -1 = semana pasada, etc.).
 */
export function getBogotaWeekRange(
  offsetWeeks = 0,
  base?: Date
): { start: string; end: string } {
  const now = base ?? new Date();
  const todayBogota = toBogotaDateStr(now);
  const [year, month, day] = todayBogota.split('-').map(Number);
  const dt = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const dayOfWeek = dt.getUTCDay(); // 0 = Domingo, 1 = Lunes, ..., 6 = Sábado
  const diffToMonday = (dayOfWeek + 6) % 7;
  const mondayUTC = new Date(Date.UTC(year, month - 1, day - diffToMonday + offsetWeeks * 7, 12, 0, 0));
  const sundayUTC = new Date(Date.UTC(year, month - 1, day - diffToMonday + offsetWeeks * 7 + 6, 12, 0, 0));
  return { start: toBogotaDateStr(mondayUTC), end: toBogotaDateStr(sundayUTC) };
}

/**
 * Calcula el rango { start, end } en "YYYY-MM-DD" para el filtro dado,
 * siempre anclado a America/Bogota independientemente de la zona horaria
 * del navegador del usuario.
 */
export function getBogotaRange(
  filtro: 'hoy' | 'ayer' | 'semana' | 'semana_pasada' | 'dos_semanas' | 'mes',
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
    return getBogotaWeekRange(0, now);
  }

  if (filtro === 'semana_pasada') {
    return getBogotaWeekRange(-1, now);
  }

  if (filtro === 'dos_semanas') {
    const prev = getBogotaWeekRange(-1, now);
    const curr = getBogotaWeekRange(0, now);
    return { start: prev.start, end: curr.end };
  }

  // 'mes' → últimos 29 días + hoy = 30 días
  const d = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
  return { start: toBogotaDateStr(d), end };
}
