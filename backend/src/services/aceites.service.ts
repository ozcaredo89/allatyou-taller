import { seguimientoDb } from '../config/seguimientoDb';

const contenido = (alias: 'p' | 'a') => `CASE ${alias}.contenido_litros
  WHEN 0.946 THEN 0.946353 WHEN 3.785 THEN 3.785412 ELSE ${alias}.contenido_litros END`;

const ordenesAceite = `
  SELECT i.id, coalesce(entrega.fecha, i.updated_at) AS fecha, i.vehiculo_id,
    p.id AS item_id, p.nombre, p.viscosidad, p.es_granel, p.contenido_litros,
    l.linea, (l.linea->>'cantidad')::numeric AS cantidad,
    CASE WHEN p.es_granel THEN (l.linea->>'cantidad')::numeric
      ELSE (l.linea->>'cantidad')::numeric * (${contenido('p')}) END AS litros
  FROM public.taller_ingresos i
  LEFT JOIN LATERAL (
    SELECT max(b.created_at) AS fecha FROM public.taller_ingresos_bitacora b
    WHERE b.empresa_id=i.empresa_id AND b.ingreso_id=i.id AND b.tipo_evento='entrega'
  ) entrega ON true
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(i.items_factura)='array' THEN i.items_factura ELSE '[]' END
  ) AS l(linea)
  JOIN public.taller_inventario_items p ON p.empresa_id=i.empresa_id
    AND p.id::text=l.linea->>'inventario_item_id' AND p.tipo_producto='aceite'
  WHERE i.empresa_id=$1 AND i.estado='entregado' AND l.linea->>'tipo'='repuesto'
    AND jsonb_typeof(l.linea->'cantidad')='number'
`;

export async function sugerirAceite(empresa: string, vehiculo: string) {
  const { rows } = await seguimientoDb().query(
    `WITH ultimo AS (
       ${ordenesAceite} AND i.vehiculo_id=$2
       ORDER BY fecha DESC NULLS LAST, i.id DESC, l.linea->>'id' LIMIT 1
     )
     SELECT u.nombre, u.viscosidad, (u.fecha AT TIME ZONE 'America/Bogota')::date::text AS fecha,
       u.linea->>'unidad_captura' AS unidad_captura,
       (u.linea->>'cantidad_captura')::numeric AS cantidad_captura,
       u.litros, to_jsonb(p) AS producto, (p.id <> u.item_id) AS sustituto,
       CASE WHEN p.es_granel THEN round(u.litros,3) ELSE ceil(round(u.litros / (${contenido('p')}),3)) END AS cantidad_stock
     FROM ultimo u
     LEFT JOIN LATERAL (
       SELECT a.* FROM public.taller_inventario_items a
       WHERE a.empresa_id=$1 AND a.activo AND a.tipo_producto='aceite'
         AND (a.id=u.item_id OR (u.viscosidad IS NOT NULL AND a.viscosidad=u.viscosidad))
         AND a.stock_actual >= CASE WHEN a.es_granel THEN round(u.litros,3) ELSE ceil(round(u.litros/(${contenido('a')}),3)) END
       ORDER BY (a.id=u.item_id) DESC, (a.es_granel=u.es_granel) DESC, a.nombre, a.id LIMIT 1
     ) p ON true`, [empresa, vehiculo]
  );
  return rows[0] ?? null;
}

export async function resumirAceites(empresa: string, desde: string, hasta: string) {
  const { rows: [resumen] } = await seguimientoDb().query(
    `WITH ordenes AS (
       ${ordenesAceite}
       AND coalesce(entrega.fecha, i.updated_at) >= ($2::date::timestamp AT TIME ZONE 'America/Bogota')
       AND coalesce(entrega.fecha, i.updated_at) < (($3::date + 1)::timestamp AT TIME ZONE 'America/Bogota')
     ), movimientos AS (
       SELECT m.*, p.viscosidad,
         CASE WHEN p.es_granel THEN m.cantidad ELSE m.cantidad*(${contenido('p')}) END AS litros
       FROM public.taller_inventario_movimientos m
       JOIN public.taller_inventario_items p ON p.empresa_id=m.empresa_id AND p.id=m.item_id
       WHERE m.empresa_id=$1 AND p.tipo_producto='aceite'
         AND m.created_at >= ($2::date::timestamp AT TIME ZONE 'America/Bogota')
         AND m.created_at < (($3::date + 1)::timestamp AT TIME ZONE 'America/Bogota')
         AND (m.tipo='SALIDA_VENTA' OR (m.tipo='AJUSTE' AND m.notas LIKE 'Medición física%'))
         AND NOT EXISTS (SELECT 1 FROM public.taller_inventario_movimientos r
           WHERE r.empresa_id=m.empresa_id AND r.anula_movimiento_id=m.id)
     ), ventas AS (
       SELECT coalesce(viscosidad,'Sin viscosidad') AS viscosidad, litros, 'orden' AS canal FROM ordenes
       UNION ALL SELECT coalesce(viscosidad,'Sin viscosidad'), -litros, 'mostrador' FROM movimientos WHERE tipo='SALIDA_VENTA'
     ), por_viscosidad AS (
       SELECT viscosidad, round(coalesce(sum(litros) FILTER (WHERE canal='orden'),0)/0.946353,2) AS ordenes,
         round(coalesce(sum(litros) FILTER (WHERE canal='mostrador'),0)/0.946353,2) AS mostrador
       FROM ventas GROUP BY viscosidad
     ), margenes AS (
       SELECT o.id, sum(coalesce((o.linea->>'total')::numeric,0) - (-m.cantidad*m.costo_unitario)) AS margen
       FROM ordenes o
       LEFT JOIN public.taller_inventario_salidas_vigentes s ON s.empresa_id=$1 AND s.ingreso_id=o.id AND s.ingreso_item_id=o.linea->>'id'
       LEFT JOIN public.taller_inventario_movimientos m ON m.empresa_id=$1 AND m.id=s.movimiento_id
       GROUP BY o.id HAVING count(*)=count(m.id)
     ), totales AS (
       SELECT (SELECT coalesce(sum(litros),0) FROM ventas) AS vendidos,
         (SELECT -coalesce(sum(litros),0) FROM movimientos WHERE tipo='AJUSTE') AS merma
     )
     SELECT coalesce((SELECT jsonb_agg(v ORDER BY viscosidad) FROM por_viscosidad v),'[]') AS viscosidades,
       round(merma/0.946353,2) AS merma_cuartos,
       round(100*merma/nullif(vendidos,0),2) AS merma_pct,
       (SELECT round(avg(margen),2) FROM margenes) AS margen_promedio,
       (SELECT count(*)::int FROM margenes) AS ordenes_con_costo FROM totales`, [empresa, desde, hasta]
  );
  return resumen;
}
