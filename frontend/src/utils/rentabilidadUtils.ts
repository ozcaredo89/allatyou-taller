export interface ItemRentabilidad {
  id: string;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  total: number;
  gastosVinculados: any[];
  costoTotal: number;
  tieneCosto: boolean;
  utilidad: number | null;
  margenPct: number | null;
}

export interface ResumenRentabilidad {
  itemsRepuesto: ItemRentabilidad[];
  totalVentaConCosto: number;
  totalCostoConCosto: number;
  utilidadConCosto: number;
  margenConCostoPct: number;
  repuestosConCostoCount: number;
  repuestosTotalCount: number;
  gastosSinItem: any[];
  totalGastosSinItem: number;
}

export function calcularRentabilidad(
  itemsFactura: any[] = [],
  gastosOrden: any[] = []
): ResumenRentabilidad {
  const repuestos = (itemsFactura || []).filter((i: any) => i && i.tipo === 'repuesto' && i.id);

  const itemsRepuesto: ItemRentabilidad[] = repuestos.map((item: any) => {
    const gastosVinculados = (gastosOrden || []).filter((g: any) => g && g.item_id === item.id);
    const costoTotal = gastosVinculados.reduce((acc: number, g: any) => acc + Number(g.monto || 0), 0);
    const tieneCosto = gastosVinculados.length > 0;
    const ventaTotal = Number(item.total || 0);
    const utilidad = tieneCosto ? ventaTotal - costoTotal : null;
    const margenPct = tieneCosto && ventaTotal > 0 ? ((ventaTotal - costoTotal) / ventaTotal) * 100 : null;

    return {
      id: item.id,
      descripcion: item.descripcion || '',
      cantidad: item.cantidad || 1,
      precio_unitario: item.precio_unitario || 0,
      total: ventaTotal,
      gastosVinculados,
      costoTotal,
      tieneCosto,
      utilidad,
      margenPct,
    };
  });

  const repuestosConCosto = itemsRepuesto.filter((i) => i.tieneCosto);
  const totalVentaConCosto = repuestosConCosto.reduce((acc, i) => acc + i.total, 0);
  const totalCostoConCosto = repuestosConCosto.reduce((acc, i) => acc + i.costoTotal, 0);
  const utilidadConCosto = totalVentaConCosto - totalCostoConCosto;
  const margenConCostoPct = totalVentaConCosto > 0 ? (utilidadConCosto / totalVentaConCosto) * 100 : 0;

  // Gastos vinculados a la orden pero que no tienen item_id o cuyo repuesto ya no existe en la cotización
  const repuestosIds = new Set(repuestos.map((r: any) => r.id));
  const gastosSinItem = (gastosOrden || []).filter((g: any) => g && (!g.item_id || !repuestosIds.has(g.item_id)));
  const totalGastosSinItem = gastosSinItem.reduce((acc: number, g: any) => acc + Number(g.monto || 0), 0);

  return {
    itemsRepuesto,
    totalVentaConCosto,
    totalCostoConCosto,
    utilidadConCosto,
    margenConCostoPct,
    repuestosConCostoCount: repuestosConCosto.length,
    repuestosTotalCount: repuestos.length,
    gastosSinItem,
    totalGastosSinItem,
  };
}
