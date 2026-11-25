export const CATEGORIA_CAMBIO_ACEITE = 'Cambio de aceite';

export function esCambioAceite(item: { category?: unknown; categoria_crm?: unknown } | null | undefined) {
  return item?.category === CATEGORIA_CAMBIO_ACEITE || item?.categoria_crm === 'aceite';
}

export function pedirKilometrajeEntrega() {
  const lectura = window.prompt('Cambio de aceite: ingresa el kilometraje del tablero en km.');
  if (lectura === null) return null;
  const kilometraje = Number(lectura.trim().replace(',', '.'));
  if (Number.isFinite(kilometraje) && kilometraje > 0) return kilometraje;
  window.alert('Ingresa un kilometraje en km mayor a cero para entregar el vehículo.');
  return null;
}
