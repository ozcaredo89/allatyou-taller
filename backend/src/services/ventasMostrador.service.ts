import { seguimientoDbSiConfigurada } from '../config/seguimientoDb';

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
  const db = seguimientoDbSiConfigurada();
  if (!db) return [];
  try {
    const { rows } = await db.query<{ venta: VentaMostrador }>(
      'SELECT to_jsonb(v) AS venta FROM public.consultar_ventas_mostrador($1,$2,$3) v',
      [empresa, desde, hasta]
    );
    return rows.map(row => row.venta);
  } catch (error: any) {
    if (error.code === '42883') return [];
    throw error;
  }
}

export async function resumirVentasMostradorPorDia(empresa: string, hasta: string) {
  const db = seguimientoDbSiConfigurada();
  if (!db) return [];
  try {
    const { rows } = await db.query<{ fecha: string; ingreso: string }>(
      'SELECT fecha::text, ingreso FROM public.resumir_ventas_mostrador_por_dia($1,$2)',
      [empresa, hasta]
    );
    return rows;
  } catch (error: any) {
    if (error.code === '42883') return [];
    throw error;
  }
}
