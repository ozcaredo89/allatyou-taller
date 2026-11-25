export const CATEGORIA_CAMBIO_ACEITE = 'Cambio de aceite';

export function esCambioAceite(item: { category?: unknown; categoria_crm?: unknown } | null | undefined) {
  return item?.category === CATEGORIA_CAMBIO_ACEITE || item?.categoria_crm === 'aceite';
}

/** Kilometraje registrado en la recepción, si es válido (> 0). */
export function kilometrajeRecepcion(ingreso: { kilometraje?: unknown } | null | undefined): number | null {
  const km = Number(ingreso?.kilometraje);
  return ingreso?.kilometraje != null && Number.isFinite(km) && km > 0 ? km : null;
}

/** Convierte la lectura del tablero (km enteros; acepta "85.400" o "85,400") a número. null si no es > 0. */
export function parseKilometraje(lectura: string): number | null {
  const limpio = lectura.trim().replace(/[.,\s]/g, '');
  if (!/^\d+$/.test(limpio)) return null;
  const kilometraje = Number(limpio);
  return Number.isFinite(kilometraje) && kilometraje > 0 ? kilometraje : null;
}
