import { getInventoryClientIfConfigured } from '../config/supabase';

export interface VentaMostrador {
  id: string;
  fecha: string;
  producto: string;
  cantidad: number;
  precio_unitario: number;
  ingreso: number;
  costo: number;
}

export async function consultarVentasMostrador(empresa: string, desde: string, hasta: string): Promise<VentaMostrador[]> {
  const client = getInventoryClientIfConfigured();
  if (!client) return [];

  const ventas: VentaMostrador[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client.rpc('consultar_ventas_mostrador', {
      p_empresa: empresa, p_desde: desde, p_hasta: hasta,
    }).range(offset, offset + pageSize - 1);
    if (error?.code === 'PGRST202' || error?.code === '42883') return [];
    if (error) throw error;
    for (const venta of data) {
      ventas.push({
        ...venta,
        cantidad: Number(venta.cantidad),
        precio_unitario: Number(venta.precio_unitario),
        ingreso: Number(venta.ingreso),
        costo: Number(venta.costo),
      });
    }
    if (data.length < pageSize) return ventas;
  }
}
