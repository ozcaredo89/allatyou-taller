/**
 * facturaUtils.ts
 * Helpers reutilizables para el calculo de montos de factura.
 */

/**
 * Suma los totales de un array de items_factura.
 * Retorna 0 si el array es nulo, undefined, o esta vacio.
 */
export function sumarItemsFactura(items: any[] | null | undefined): number {
  return (items || []).reduce(
    (acc: number, item: any) => acc + (Number(item?.total) || 0),
    0
  );
}
