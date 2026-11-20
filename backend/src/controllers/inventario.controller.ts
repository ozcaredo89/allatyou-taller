import { Request, Response } from 'express';
import { getInventoryClient } from '../config/supabase';

const PAGE_SIZE = 100;
const TIPOS = ['ENTRADA', 'AJUSTE', 'SALIDA_VENTA', 'SALIDA_ORDEN', 'ANULACION'];

function responderError(res: Response, error: { code?: string; message: string }) {
  const status = error.code === '23505' ? 409
    : error.code === 'P0002' || error.code === 'PGRST116' ? 404
    : /^(22|23)/.test(error.code || '') ? 400 : 500;
  res.status(status).json({ error: error.message });
}

export async function listarItems(req: Request, res: Response) {
  const items = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await getInventoryClient().rpc('consultar_inventario', {
      p_empresa: req.empresa_id,
    }).range(offset, offset + PAGE_SIZE - 1);
    if (error) return responderError(res, error);
    items.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  res.json(items);
}

export async function guardarItem(req: Request, res: Response) {
  const body = req.body ?? {};
  if (typeof body.codigo !== 'string' || !body.codigo.trim() ||
      typeof body.nombre !== 'string' || !body.nombre.trim() ||
      !['und', 'litro', 'galón'].includes(body.unidad) ||
      typeof body.precio_venta !== 'number' || body.precio_venta < 0 ||
      typeof body.stock_minimo !== 'number' || body.stock_minimo < 0 ||
      (body.activo !== undefined && typeof body.activo !== 'boolean')) {
    res.status(400).json({ error: 'Completa el código, nombre, unidad, precio y stock mínimo.' });
    return;
  }

  const item = {
    codigo: body.codigo.trim(),
    nombre: body.nombre.trim(),
    categoria: typeof body.categoria === 'string' ? body.categoria.trim() || null : null,
    unidad: body.unidad,
    precio_venta: body.precio_venta,
    stock_minimo: body.stock_minimo,
    activo: body.activo ?? true,
  };

  const table = getInventoryClient().from('taller_inventario_items');
  const query = req.params.id
    ? table.update(item).eq('empresa_id', req.empresa_id).eq('id', req.params.id)
    : table.insert({ ...item, empresa_id: req.empresa_id });
  const { data, error } = await query.select().single();
  if (error) return responderError(res, error);
  res.status(req.params.id ? 200 : 201).json(data);
}

export async function desactivarItem(req: Request, res: Response) {
  const { error } = await getInventoryClient().from('taller_inventario_items')
    .update({ activo: false }).eq('empresa_id', req.empresa_id).eq('id', req.params.id).select('id').single();
  if (error) return responderError(res, error);
  res.sendStatus(204);
}

export async function listarMovimientos(req: Request, res: Response) {
  const { tipo, item_id, desde, hasta } = req.query;
  const pagina = Number(req.query.pagina ?? 1);
  const fecha = /^\d{4}-\d{2}-\d{2}$/;
  if (!Number.isSafeInteger(pagina) || pagina < 1 || pagina > 100000 ||
      (tipo !== undefined && (typeof tipo !== 'string' || !TIPOS.includes(tipo))) ||
      [desde, hasta].some(value => value !== undefined && (typeof value !== 'string' || !fecha.test(value)))) {
    res.status(400).json({ error: 'Los filtros de movimientos son inválidos.' });
    return;
  }
  let query = getInventoryClient().from('taller_inventario_movimientos')
    .select('*, taller_inventario_items(codigo,nombre)', { count: 'exact' })
    .eq('empresa_id', req.empresa_id);
  if (tipo) query = query.eq('tipo', tipo);
  if (item_id) query = query.eq('item_id', item_id);
  if (desde) query = query.gte('created_at', `${desde}T00:00:00-05:00`);
  if (hasta) query = query.lte('created_at', `${hasta}T23:59:59.999999-05:00`);
  const { data, count, error } = await query.order('created_at', { ascending: false })
    .order('id', { ascending: false }).range((pagina - 1) * PAGE_SIZE, pagina * PAGE_SIZE - 1);
  if (error) return responderError(res, error);
  const ids = data.map(movimiento => movimiento.id);
  const anulados = new Set<string>();
  if (ids.length > 0) {
    const { data: anulaciones, error: errorAnulaciones } = await getInventoryClient().from('taller_inventario_movimientos')
      .select('anula_movimiento_id').eq('empresa_id', req.empresa_id).in('anula_movimiento_id', ids);
    if (errorAnulaciones) return responderError(res, errorAnulaciones);
    anulaciones.forEach(movimiento => anulados.add(movimiento.anula_movimiento_id));
  }
  res.json({
    movimientos: data.map(movimiento => ({ ...movimiento, anulado: anulados.has(movimiento.id) })),
    paginas: Math.ceil((count ?? 0) / PAGE_SIZE),
  });
}

export async function registrarMovimiento(req: Request, res: Response) {
  const { tipo, item_id, cantidad, costo_unitario, precio_unitario, registrar_gasto, proveedor, factura_ref, notas, operacion_id } = req.body ?? {};
  if (!['ENTRADA', 'AJUSTE', 'SALIDA_VENTA'].includes(tipo) || typeof item_id !== 'string') {
    res.status(400).json({ error: 'Selecciona un producto y un tipo de movimiento válido.' });
    return;
  }
  const { data, error } = await getInventoryClient().rpc('registrar_movimiento_inventario', {
    p_empresa: req.empresa_id, p_item: item_id, p_tipo: tipo, p_usuario: req.user_email,
    p_datos: { cantidad, costo_unitario, precio_unitario, registrar_gasto, proveedor, factura_ref, notas, operacion_id },
  });
  if (error) return responderError(res, error);
  res.status(201).json(data);
}

export async function anularMovimiento(req: Request, res: Response) {
  const { data: original, error: buscarError } = await getInventoryClient().from('taller_inventario_movimientos')
    .select('item_id, tipo').eq('empresa_id', req.empresa_id).eq('id', req.params.id).single();
  if (buscarError) return responderError(res, buscarError);
  if (original.tipo === 'SALIDA_ORDEN' || original.tipo === 'ANULACION') {
    res.status(400).json({ error: 'Para revertir una salida de orden, modifica, cancela o reabre la orden.' });
    return;
  }
  const { data, error } = await getInventoryClient().rpc('registrar_movimiento_inventario', {
    p_empresa: req.empresa_id, p_item: original.item_id, p_tipo: 'ANULACION', p_usuario: req.user_email,
    p_datos: { anula_movimiento_id: req.params.id, notas: req.body?.notas },
  });
  if (error) return responderError(res, error);
  res.json(data);
}
