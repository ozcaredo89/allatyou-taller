/**
 * Heurística para detectar descripciones que parecen mano de obra / servicio.
 * Mantener sincronizado con backend/src/utils/tipoItemUtils.ts.
 */
const normalizar = (s: string): string =>
  (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const PATRON_MANO_OBRA = new RegExp(
  '(^|\\s)(' +
    [
      'mano de obra', 'mano obra', 'm o', 'mo', 'labor',
      'instalacion', 'instalar', 'desinstal', 'desmont', 'montaje',
      'revision', 'revisar', 'diagnostic', 'escaneo', 'scanner', 'inspeccion',
      'alineacion', 'balanceo', 'sincronizacion', 'calibracion',
      'rectificacion', 'rectificar', 'rectificado', 'torneado', 'tornear',
      'purga', 'purgar', 'purgado', 'mantenimiento', 'reparacion', 'reparar',
      'soldadura', 'programacion', 'limpieza', 'lavado', 'servicio',
    ].join('|') +
    ')(\\s|$)'
);

const PATRON_PREFIJO = /(^|\s)(desinstal|desmont|diagnostic)[a-z]*/;

export function pareceManoObra(descripcion: string): boolean {
  const n = normalizar(descripcion);
  if (!n) return false;
  return PATRON_MANO_OBRA.test(n) || PATRON_PREFIJO.test(n);
}
