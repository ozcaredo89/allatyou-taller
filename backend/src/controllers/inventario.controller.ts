import { NextFunction, Request, Response } from 'express';
import { seguimientoDb } from '../config/seguimientoDb';
import { consultarVentasMostrador } from '../services/ventasMostrador.service';
import { bogotaToday } from '../utils/dateUtils';
import { resumirAceites, sugerirAceite } from '../services/aceites.service';

const PAGE_SIZE = 100;
const TIPOS = ['ENTRADA', 'AJUSTE', 'SALIDA_VENTA', 'SALIDA_ORDEN', 'ANULACION'];

export async function sugerenciaAceite(req: Request, res: Response) {
  const id = req.query.vehiculo_id;
  if (typeof id !== 'string' || !/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(id)) {
    res.status(400).json({ error: 'Selecciona un vehículo válido.' });
    return;
  }
  res.json(await sugerirAceite(req.empresa_id!, id));
}

export async function resumenAceites(req: Request, res: Response) {
  const { desde, hasta } = req.query;
  const fecha = /^\d{4}-\d{2}-\d{2}$/;
  if (typeof desde !== 'string' || typeof hasta !== 'string' || !fecha.test(desde) || !fecha.test(hasta) || desde > hasta) {
    res.status(400).json({ error: 'Selecciona un rango de fechas válido.' });
    return;
  }
  res.json(await resumirAceites(req.empresa_id!, desde, hasta));
}

function responderError(res: Response, error: { code?: string; message: string }) {
  const status = error.code === '23505' || error.code === '40001' ? 409
    : error.code === 'P0002' ? 404
    : /^(22|23)/.test(error.code || '') ? 400 : 500;
  res.status(status).json({ error: status >= 500 ? 'No se pudo consultar o actualizar el inventario.' : error.message });
}

export function manejarErrorInventario(error: Error, _req: Request, res: Response, _next: NextFunction) {
  console.error('[inventario]', error.message);
  responderError(res, error);
}

export async function listarItems(req: Request, res: Response) {
  const { rows } = await seguimientoDb().query(
    `SELECT producto || jsonb_build_object('aceite_ordenes_abiertas', coalesce(a.abiertos, 0),
                                           'stock_pendiente_entrega', coalesce(a.pendientes, 0)) AS producto
     FROM public.consultar_inventario($1) AS producto
     LEFT JOIN public.consultar_aceite_por_descontar($1) a ON a.item_id::text = producto->>'id'`,
    [req.empresa_id]
  );
  res.json(rows.map(row => row.producto));
}

export async function guardarItem(req: Request, res: Response) {
  const body = req.body ?? {};
  const esGranel = body.es_granel === true;
  const tipo = body.tipo_producto ?? (esGranel ? 'aceite' : 'repuesto');
  const viscosidad = typeof body.viscosidad === 'string' ? body.viscosidad.trim().toUpperCase() || null : null;
  const base = body.base_aceite || null;
  const texto = (valor: unknown) => typeof valor === 'string' ? valor.trim() || null : null;
  if (!['repuesto','aceite'].includes(tipo) || (esGranel && tipo !== 'aceite') ||
      (tipo === 'aceite' && ((viscosidad && !/^([0-9]{1,2}W-[0-9]{2}|SAE [0-9]{1,2})$/.test(viscosidad)) ||
        (base && !['mineral','semisintetico','sintetico'].includes(base)) || (!esGranel &&
          (body.unidad !== 'und' || !Number.isFinite(body.contenido_litros) || body.contenido_litros < 0.001))))) {
    res.status(400).json({ error: 'Revisa el tipo, la viscosidad, la base y la presentación del aceite.' });
    return;
  }
  if ((body.es_granel !== undefined && typeof body.es_granel !== 'boolean') ||
      (esGranel && (body.unidad !== 'litro' || !Number.isFinite(body.capacidad_envase) || body.capacidad_envase <= 0))) {
    res.status(400).json({ error: 'El producto a granel requiere unidad litro y una capacidad de envase mayor que cero.' });
    return;
  }
  if (typeof body.codigo !== 'string' || !body.codigo.trim() ||
      typeof body.nombre !== 'string' || !body.nombre.trim() ||
      !['und', 'litro', 'galón'].includes(body.unidad) ||
      typeof body.precio_venta !== 'number' || body.precio_venta < 0 ||
      typeof body.stock_minimo !== 'number' || body.stock_minimo < 0 ||
      (body.activo !== undefined && typeof body.activo !== 'boolean')) {
    res.status(400).json({ error: 'Completa el código, nombre, unidad, precio y stock mínimo.' });
    return;
  }

  const valores = [
    req.empresa_id, body.codigo.trim(), body.nombre.trim(),
    typeof body.categoria === 'string' ? body.categoria.trim() || null : null,
    body.unidad, body.precio_venta, body.stock_minimo, body.activo ?? true, esGranel, esGranel ? body.capacidad_envase : null,
  ];
  const atributos = [tipo, tipo === 'aceite' ? viscosidad : null, tipo === 'aceite' ? base : null,
    tipo === 'aceite' ? texto(body.marca) : null, tipo === 'aceite' ? texto(body.especificacion) : null,
    tipo === 'aceite' && !esGranel ? body.contenido_litros : null];
  const { rows } = req.params.id
    ? await seguimientoDb().query(
      `UPDATE public.taller_inventario_items
       SET codigo=$2, nombre=$3, categoria=$4, unidad=$5, precio_venta=$6, stock_minimo=$7, activo=$8,
           es_granel=CASE WHEN $11 THEN $9 ELSE es_granel END,
           capacidad_envase=CASE WHEN $11 THEN $10 ELSE capacidad_envase END,
           tipo_producto=CASE WHEN $19 THEN $13 ELSE tipo_producto END,
           viscosidad=CASE WHEN $19 THEN $14 ELSE viscosidad END,
           base_aceite=CASE WHEN $19 THEN $15 ELSE base_aceite END,
           marca=CASE WHEN $19 THEN $16 ELSE marca END,
           especificacion=CASE WHEN $19 THEN $17 ELSE especificacion END,
           contenido_litros=CASE WHEN $19 THEN $18 ELSE contenido_litros END
       WHERE empresa_id=$1 AND id=$12
         AND (unidad=$5 OR NOT (es_granel OR $9) OR (stock_actual=0 AND NOT EXISTS (
           SELECT 1 FROM public.taller_inventario_movimientos m WHERE m.empresa_id=$1 AND m.item_id=$12
         )))
       RETURNING to_jsonb(taller_inventario_items) AS producto`,
      [...valores, body.es_granel !== undefined, req.params.id, ...atributos, body.tipo_producto !== undefined]
    )
    : await seguimientoDb().query(
      `INSERT INTO public.taller_inventario_items
       (empresa_id,codigo,nombre,categoria,unidad,precio_venta,stock_minimo,activo,es_granel,capacidad_envase,
        tipo_producto,viscosidad,base_aceite,marca,especificacion,contenido_litros)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING to_jsonb(taller_inventario_items) AS producto`,
      [...valores, ...atributos]
    );
  if (!rows.length) {
    const { rowCount } = await seguimientoDb().query(
      'SELECT 1 FROM public.taller_inventario_items WHERE empresa_id=$1 AND id=$2', [req.empresa_id, req.params.id]
    );
    if (rowCount) {
      res.status(409).json({ error: 'El producto ya tiene stock o movimientos. Crea un producto a granel con unidad litro.' });
      return;
    }
    return responderError(res, { code: 'P0002', message: 'Producto no encontrado.' });
  }
  res.status(req.params.id ? 200 : 201).json(rows[0].producto);
}

export async function desactivarItem(req: Request, res: Response) {
  const { rowCount } = await seguimientoDb().query(
    'UPDATE public.taller_inventario_items SET activo=false WHERE empresa_id=$1 AND id=$2',
    [req.empresa_id, req.params.id]
  );
  if (!rowCount) return responderError(res, { code: 'P0002', message: 'Producto no encontrado.' });
  res.sendStatus(204);
}

export async function listarMovimientos(req: Request, res: Response) {
  const { tipo, item_id, desde, hasta } = req.query;
  const pagina = Number(req.query.pagina ?? 1);
  const fecha = /^\d{4}-\d{2}-\d{2}$/;
  if (!Number.isSafeInteger(pagina) || pagina < 1 || pagina > 100000 ||
      (tipo !== undefined && (typeof tipo !== 'string' || !TIPOS.includes(tipo))) ||
      (item_id !== undefined && typeof item_id !== 'string') ||
      [desde, hasta].some(value => value !== undefined && (typeof value !== 'string' || !fecha.test(value)))) {
    res.status(400).json({ error: 'Los filtros de movimientos son inválidos.' });
    return;
  }
  const { rows: [resultado] } = await seguimientoDb().query(
    `WITH filtrados AS (
       SELECT m.* FROM public.taller_inventario_movimientos m
       WHERE m.empresa_id=$1 AND ($2::text IS NULL OR m.tipo=$2) AND ($3::uuid IS NULL OR m.item_id=$3)
         AND ($4::date IS NULL OR m.created_at >= ($4::date::timestamp AT TIME ZONE 'America/Bogota'))
         AND ($5::date IS NULL OR m.created_at < (($5::date + 1)::timestamp AT TIME ZONE 'America/Bogota'))
     ), pagina AS (
       SELECT m.*, jsonb_build_object('codigo', i.codigo, 'nombre', i.nombre) AS taller_inventario_items,
         EXISTS (SELECT 1 FROM public.taller_inventario_movimientos a
           WHERE a.empresa_id=m.empresa_id AND a.anula_movimiento_id=m.id) AS anulado
       FROM filtrados m JOIN public.taller_inventario_items i ON i.empresa_id=m.empresa_id AND i.id=m.item_id
       ORDER BY m.created_at DESC, m.id DESC LIMIT $6 OFFSET $7
     )
     SELECT coalesce((SELECT jsonb_agg(p ORDER BY p.created_at DESC, p.id DESC) FROM pagina p), '[]') AS movimientos,
       (SELECT count(*) FROM filtrados) AS total`,
    [req.empresa_id, tipo, item_id, desde, hasta, PAGE_SIZE, (pagina - 1) * PAGE_SIZE]
  );
  res.json({ movimientos: resultado.movimientos, paginas: Math.ceil(Number(resultado.total) / PAGE_SIZE) });
}

async function moverStock(req: Request, item: string, tipo: string, datos: object) {
  const { rows: [resultado] } = await seguimientoDb().query(
    'SELECT to_jsonb(m) AS movimiento FROM public.registrar_movimiento_inventario($1,$2,$3,$4,$5) AS m WHERE m.id IS NOT NULL',
    [req.empresa_id, item, tipo, JSON.stringify(datos), req.user_email]
  );
  return resultado?.movimiento ?? null;
}

export async function registrarMovimiento(req: Request, res: Response) {
  const { tipo, item_id, cantidad, costo_unitario, precio_unitario, registrar_gasto, proveedor, factura_ref, notas, operacion_id } = req.body ?? {};
  if (!['ENTRADA', 'AJUSTE', 'SALIDA_VENTA'].includes(tipo) || typeof item_id !== 'string') {
    res.status(400).json({ error: 'Selecciona un producto y un tipo de movimiento válido.' });
    return;
  }
  const movimiento = await moverStock(req, item_id, tipo, {
    cantidad, costo_unitario, precio_unitario, registrar_gasto, proveedor, factura_ref, notas, operacion_id,
    presentacion: req.body.presentacion, cantidad_presentacion: req.body.cantidad_presentacion,
    costo_presentacion: req.body.costo_presentacion,
    stock_medido: req.body.stock_medido, stock_esperado: req.body.stock_esperado,
    litros_despachados_sin_descontar: req.body.litros_despachados_sin_descontar,
    por_descontar_esperado: req.body.por_descontar_esperado,
  });
  res.status(201).json(movimiento);
}

export async function anularMovimiento(req: Request, res: Response) {
  const { rows: [original] } = await seguimientoDb().query(
    'SELECT item_id, tipo FROM public.taller_inventario_movimientos WHERE empresa_id=$1 AND id=$2',
    [req.empresa_id, req.params.id]
  );
  if (!original) return responderError(res, { code: 'P0002', message: 'Movimiento no encontrado.' });
  if (original.tipo === 'SALIDA_ORDEN' || original.tipo === 'ANULACION') {
    res.status(400).json({ error: 'Para revertir una salida de orden, modifica, cancela o reabre la orden.' });
    return;
  }
  const movimiento = await moverStock(req, original.item_id, 'ANULACION', {
    anula_movimiento_id: req.params.id, notas: req.body?.notas,
  });
  res.json(movimiento);
}

export async function listarDescuentosPendientes(req: Request, res: Response) {
  const pagina = Number(req.query.pagina ?? 1);
  if (!Number.isSafeInteger(pagina) || pagina < 1 || pagina > 100000) {
    res.status(400).json({ error: 'Página inválida.' });
    return;
  }
  const { rows: [resultado] } = await seguimientoDb().query(
    `WITH pendientes AS MATERIALIZED (SELECT * FROM public.consultar_descuentos_pendientes($1)),
       pagina AS (SELECT * FROM pendientes LIMIT $2 OFFSET $3)
     SELECT coalesce((SELECT jsonb_agg(p) FROM pagina p), '[]') AS pendientes,
       (SELECT count(*) FROM pendientes) AS total`,
    [req.empresa_id, PAGE_SIZE, (pagina - 1) * PAGE_SIZE]
  );
  res.json({ pendientes: resultado.pendientes, paginas: Math.ceil(Number(resultado.total) / PAGE_SIZE) });
}

export async function resumirVentasMostradorHoy(req: Request, res: Response) {
  const hoy = bogotaToday();
  try {
    const ventas = await consultarVentasMostrador(req.empresa_id!, hoy, hoy);
    const ingreso = ventas.reduce((total, venta) => total + Number(venta.ingreso), 0);
    const costo = ventas.reduce((total, venta) => total + Number(venta.costo), 0);
    res.json({ ventas: ventas.length, ingreso, utilidad: Math.round((ingreso - costo) * 100) / 100 });
  } catch (error) {
    console.error('[resumirVentasMostradorHoy]', error);
    res.status(500).json({ error: 'No se pudieron consultar las ventas de mostrador.' });
  }
}
