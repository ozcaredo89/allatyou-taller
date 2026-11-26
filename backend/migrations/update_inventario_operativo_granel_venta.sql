ALTER TABLE public.taller_inventario_movimientos
  ADD COLUMN importe_venta numeric(14,2)
  CHECK (importe_venta IS NULL OR (tipo = 'SALIDA_VENTA' AND importe_venta >= 0));

CREATE OR REPLACE FUNCTION public.registrar_movimiento_inventario(
  p_empresa uuid, p_item uuid, p_tipo text, p_datos jsonb, p_usuario text
) RETURNS public.taller_inventario_movimientos
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  producto taller_inventario_items;
  original taller_inventario_movimientos;
  movimiento taller_inventario_movimientos;
  cantidad numeric := (p_datos->>'cantidad')::numeric;
  costo numeric := (p_datos->>'costo_unitario')::numeric;
  precio numeric := (p_datos->>'precio_unitario')::numeric;
  nuevo_stock numeric;
  nuevo_costo numeric;
  categoria uuid;
  gasto uuid;
  orden uuid := (p_datos->>'ingreso_id')::uuid;
  linea text := p_datos->>'ingreso_item_id';
  presentacion text := p_datos->>'presentacion';
  cantidad_presentacion numeric := (p_datos->>'cantidad_presentacion')::numeric;
  costo_presentacion numeric := coalesce((p_datos->>'costo_presentacion')::numeric, costo);
  medido numeric := (p_datos->>'stock_medido')::numeric;
  importe_compra numeric;
  unidad_venta text := p_datos->>'unidad_captura_venta';
  cantidad_venta numeric := (p_datos->>'cantidad_captura_venta')::numeric;
  precio_venta numeric := (p_datos->>'precio_captura_venta')::numeric;
  importe_venta numeric;
  despachado numeric := (p_datos->>'litros_despachados_sin_descontar')::numeric;
  por_descontar numeric;
  pendientes_entregados numeric;
  notas_movimiento text := p_datos->>'notas';
  operacion uuid := (p_datos->>'operacion_id')::uuid;
BEGIN
  SELECT * INTO STRICT producto FROM taller_inventario_items
    WHERE empresa_id = p_empresa AND id = p_item FOR UPDATE;

  IF operacion IS NOT NULL THEN
    SELECT * INTO movimiento FROM taller_inventario_movimientos
      WHERE id = operacion AND empresa_id = p_empresa AND item_id = p_item AND tipo = p_tipo;
    IF FOUND THEN RETURN movimiento; END IF;
  END IF;

  IF unidad_venta IS NOT NULL OR cantidad_venta IS NOT NULL OR precio_venta IS NOT NULL THEN
    IF p_tipo <> 'SALIDA_VENTA' OR NOT producto.es_granel
      OR unidad_venta IS NULL OR unidad_venta NOT IN ('cuarto','galón','litro')
      OR cantidad_venta IS NULL OR cantidad_venta <= 0 OR cantidad_venta <> round(cantidad_venta, 3)
      OR cantidad_venta::text IN ('NaN','Infinity','-Infinity')
      OR precio_venta IS NULL OR precio_venta < 0 OR precio_venta <> round(precio_venta, 2)
      OR precio_venta::text IN ('NaN','Infinity','-Infinity')
      OR cantidad IS DISTINCT FROM round(cantidad_venta * CASE unidad_venta
        WHEN 'cuarto' THEN 0.946353 WHEN 'galón' THEN 3.785412 ELSE 1 END, 3) THEN
      RAISE EXCEPTION 'La cantidad y el precio de venta no corresponden a la unidad capturada' USING ERRCODE = '22023';
    END IF;
    importe_venta := round(cantidad_venta * precio_venta, 2);
  END IF;

  IF presentacion IS NOT NULL OR cantidad_presentacion IS NOT NULL THEN
    IF p_tipo <> 'ENTRADA' OR NOT producto.es_granel OR presentacion IS NULL
      OR presentacion NOT IN ('tambor', 'galón', 'litro', 'cuarto') OR cantidad_presentacion IS NULL
      OR cantidad_presentacion <= 0 OR cantidad_presentacion <> round(cantidad_presentacion, 3)
      OR cantidad_presentacion::text IN ('NaN', 'Infinity', '-Infinity')
      OR costo_presentacion IS NULL OR costo_presentacion < 0 OR costo_presentacion::text IN ('NaN', 'Infinity', '-Infinity') THEN
      RAISE EXCEPTION 'Presentación, cantidad o costo de compra inválidos' USING ERRCODE = '22023';
    END IF;
    cantidad := round(cantidad_presentacion * CASE presentacion
      WHEN 'tambor' THEN producto.capacidad_envase WHEN 'galón' THEN 3.785412 WHEN 'cuarto' THEN 0.946353 ELSE 1 END, 3);
    IF cantidad <= 0 THEN
      RAISE EXCEPTION 'La compra debe equivaler al menos a 0,001 litros' USING ERRCODE = '22023';
    END IF;
    importe_compra := round(cantidad_presentacion * costo_presentacion, 2);
    costo := cantidad_presentacion * costo_presentacion / cantidad;
  END IF;

  IF medido IS NOT NULL THEN
    IF p_tipo <> 'AJUSTE' OR NOT producto.es_granel OR medido < 0 OR medido <> round(medido, 3)
      OR medido::text IN ('NaN', 'Infinity', '-Infinity') THEN
      RAISE EXCEPTION 'La medición debe expresarse en litros con hasta tres decimales' USING ERRCODE = '22023';
    END IF;
    IF producto.stock_actual IS DISTINCT FROM (p_datos->>'stock_esperado')::numeric THEN
      RAISE EXCEPTION 'El stock cambió. Abre de nuevo la medición antes de confirmar' USING ERRCODE = '40001';
    END IF;
    SELECT coalesce(sum(abiertos + pendientes), 0), coalesce(sum(pendientes), 0) INTO por_descontar, pendientes_entregados
    FROM public.consultar_aceite_por_descontar(p_empresa) WHERE item_id = p_item;
    IF (p_datos->>'por_descontar_esperado')::numeric IS DISTINCT FROM por_descontar THEN
      RAISE EXCEPTION 'Cambió el aceite por descontar. Abre de nuevo la medición antes de confirmar' USING ERRCODE = '40001';
    END IF;
    IF (por_descontar > 0 AND despachado IS NULL)
      OR despachado < pendientes_entregados OR despachado > por_descontar
      OR despachado <> round(despachado, 3)
      OR despachado::text IN ('NaN', 'Infinity', '-Infinity') THEN
      RAISE EXCEPTION 'Incluye todos los litros pendientes de órdenes entregadas y confirma los litros ya usados en órdenes abiertas' USING ERRCODE = '22023';
    END IF;
    despachado := coalesce(despachado, 0);
    cantidad := medido + despachado - producto.stock_actual;
    IF cantidad = 0 THEN RETURN NULL; END IF;
    costo := producto.costo_promedio;
    notas_movimiento := concat_ws(' · ', 'Medición física',
      CASE WHEN despachado > 0 THEN format('%s L medidos + %s L usados por descontar', medido, despachado) END,
      nullif(btrim(notas_movimiento), ''));
  END IF;

  IF p_tipo = 'ANULACION' THEN
    SELECT * INTO STRICT original FROM taller_inventario_movimientos
      WHERE empresa_id = p_empresa AND item_id = p_item
        AND id = (p_datos->>'anula_movimiento_id')::uuid AND tipo <> 'ANULACION';
    SELECT * INTO movimiento FROM taller_inventario_movimientos WHERE anula_movimiento_id = original.id;
    IF FOUND THEN RETURN movimiento; END IF;
    cantidad := -original.cantidad;
    costo := original.costo_unitario;
    precio := original.precio_unitario;
    gasto := original.gasto_id;
    orden := original.ingreso_id;
    linea := original.ingreso_item_id;
    presentacion := original.presentacion;
    cantidad_presentacion := original.cantidad_presentacion;
    IF original.tipo = 'ENTRADA' AND original.gasto_id IS NOT NULL THEN
      DELETE FROM taller_gastos WHERE empresa_id = p_empresa AND id = original.gasto_id;
    END IF;
  ELSIF p_tipo IN ('SALIDA_ORDEN', 'SALIDA_VENTA') THEN
    IF cantidad IS NULL OR cantidad <= 0 OR precio IS NULL OR precio < 0 THEN
      RAISE EXCEPTION 'Indica cantidad y precio válidos para la salida' USING ERRCODE = '22023';
    END IF;
    IF p_tipo = 'SALIDA_ORDEN' THEN
      IF NULLIF(btrim(linea), '') IS NULL OR NOT EXISTS (
        SELECT 1 FROM taller_ingresos WHERE empresa_id = p_empresa AND id = orden
      ) THEN
        RAISE EXCEPTION 'Orden o línea inválida' USING ERRCODE = '22023';
      END IF;
    END IF;
    cantidad := -cantidad;
    costo := producto.costo_promedio;
  ELSIF p_tipo = 'AJUSTE' THEN
    IF cantidad < 0 THEN costo := producto.costo_promedio; END IF;
    costo := coalesce(costo, producto.costo_promedio);
  ELSIF p_tipo <> 'ENTRADA' OR cantidad IS NULL OR cantidad <= 0 THEN
    RAISE EXCEPTION 'Movimiento inválido' USING ERRCODE = '22023';
  END IF;

  IF cantidad IS NULL OR cantidad = 0 OR cantidad <> round(cantidad, 3)
    OR cantidad::text IN ('NaN', 'Infinity', '-Infinity')
    OR costo IS NULL OR costo < 0 OR costo::text IN ('NaN', 'Infinity', '-Infinity')
    OR precio::text IN ('NaN', 'Infinity', '-Infinity') THEN
    RAISE EXCEPTION 'Cantidad o valor inválido' USING ERRCODE = '22023';
  END IF;
  costo := round(costo, 6);
  IF NOT producto.activo AND p_tipo IN ('ENTRADA', 'SALIDA_VENTA') THEN
    RAISE EXCEPTION 'El producto está inactivo' USING ERRCODE = '22023';
  END IF;
  nuevo_stock := producto.stock_actual + cantidad;
  IF nuevo_stock < 0 THEN
    RAISE EXCEPTION 'Stock insuficiente para % (disponible: %)', producto.nombre, producto.stock_actual USING ERRCODE = '22023';
  END IF;
  nuevo_costo := producto.costo_promedio;
  IF nuevo_stock > 0 AND (cantidad > 0 OR p_tipo = 'ANULACION') THEN
    nuevo_costo := (producto.stock_actual * producto.costo_promedio + cantidad * costo) / nuevo_stock;
    IF nuevo_costo < -0.000001 THEN
      RAISE EXCEPTION 'La anulación dejaría un valor de inventario negativo' USING ERRCODE = '22023';
    END IF;
    nuevo_costo := greatest(nuevo_costo, 0);
  END IF;

  IF p_tipo = 'ENTRADA' AND coalesce((p_datos->>'registrar_gasto')::boolean, false) THEN
    importe_compra := coalesce(importe_compra, round(cantidad * costo, 2));
    IF importe_compra <= 0 THEN
      RAISE EXCEPTION 'Para registrar el gasto, el importe de la compra debe ser mayor que cero' USING ERRCODE = '22023';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(p_empresa::text || ':categoria-repuestos', 0));
    SELECT id INTO categoria FROM taller_categorias_gastos
      WHERE empresa_id = p_empresa AND lower(btrim(nombre)) = 'repuestos'
      ORDER BY activa DESC NULLS LAST, (nombre = 'Repuestos') DESC, id LIMIT 1;
    IF NOT FOUND THEN
      INSERT INTO taller_categorias_gastos (empresa_id, nombre)
        VALUES (p_empresa, 'Repuestos')
        ON CONFLICT (empresa_id, nombre) DO UPDATE SET nombre = EXCLUDED.nombre RETURNING id INTO categoria;
    END IF;
    INSERT INTO taller_gastos (empresa_id, fecha, categoria_id, descripcion, monto, proveedor, notas)
      VALUES (p_empresa, (now() AT TIME ZONE 'America/Bogota')::date, categoria,
        'Compra de ' || producto.nombre, importe_compra, p_datos->>'proveedor',
        concat_ws(' · ', p_datos->>'factura_ref', p_datos->>'notas')) RETURNING id INTO gasto;
  END IF;

  UPDATE taller_inventario_items SET stock_actual = nuevo_stock, costo_promedio = nuevo_costo
    WHERE empresa_id = p_empresa AND id = p_item;
  INSERT INTO taller_inventario_movimientos (
    id, empresa_id, item_id, tipo, cantidad, costo_unitario, precio_unitario, ingreso_id,
    ingreso_item_id, gasto_id, proveedor, factura_ref, notas, usuario_email, anula_movimiento_id, presentacion, cantidad_presentacion, importe_venta
  ) VALUES (
    coalesce(operacion, gen_random_uuid()), p_empresa, p_item, p_tipo, cantidad, costo, precio, orden, linea, gasto,
    coalesce(p_datos->>'proveedor', original.proveedor), coalesce(p_datos->>'factura_ref', original.factura_ref),
    notas_movimiento, p_usuario, original.id, presentacion, cantidad_presentacion, importe_venta
  ) RETURNING * INTO movimiento;

  IF p_tipo = 'SALIDA_ORDEN' THEN
    INSERT INTO taller_inventario_salidas_vigentes VALUES (p_empresa, orden, linea, movimiento.id);
  ELSIF original.tipo = 'SALIDA_ORDEN' THEN
    DELETE FROM taller_inventario_salidas_vigentes WHERE empresa_id = p_empresa AND movimiento_id = original.id;
  END IF;
  RETURN movimiento;
END;
$$;
REVOKE ALL ON FUNCTION public.registrar_movimiento_inventario(uuid, uuid, text, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_movimiento_inventario(uuid, uuid, text, jsonb, text) TO service_role;

CREATE OR REPLACE FUNCTION public.consultar_ventas_mostrador(p_empresa uuid, p_desde date, p_hasta date)
RETURNS TABLE (id uuid, fecha date, producto text, cantidad numeric, precio_unitario numeric, ingreso numeric, costo numeric)
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT m.id, (m.created_at AT TIME ZONE 'America/Bogota')::date, p.nombre,
    -m.cantidad, m.precio_unitario, coalesce(m.importe_venta, round(-m.cantidad * m.precio_unitario, 2)),
    round(-m.cantidad * m.costo_unitario, 2)
  FROM taller_inventario_movimientos m
  JOIN taller_inventario_items p ON p.empresa_id = m.empresa_id AND p.id = m.item_id
  WHERE m.empresa_id = p_empresa AND m.tipo = 'SALIDA_VENTA'
    AND m.created_at >= p_desde::timestamp AT TIME ZONE 'America/Bogota'
    AND m.created_at < (p_hasta + 1)::timestamp AT TIME ZONE 'America/Bogota'
    AND NOT EXISTS (
      SELECT 1 FROM taller_inventario_movimientos a
      WHERE a.empresa_id = p_empresa AND a.anula_movimiento_id = m.id
    )
  ORDER BY m.created_at DESC, m.id DESC;
$$;
REVOKE ALL ON FUNCTION public.consultar_ventas_mostrador(uuid, date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consultar_ventas_mostrador(uuid, date, date) TO service_role;



CREATE OR REPLACE FUNCTION public.resumir_ventas_mostrador_por_dia(p_empresa uuid, p_hasta date)
RETURNS TABLE (fecha date, ingreso numeric)
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT (m.created_at AT TIME ZONE 'America/Bogota')::date,
    sum(coalesce(m.importe_venta, round(-m.cantidad * m.precio_unitario, 2)))
  FROM taller_inventario_movimientos m
  WHERE m.empresa_id = p_empresa AND m.tipo = 'SALIDA_VENTA'
    AND m.created_at < (p_hasta + 1)::timestamp AT TIME ZONE 'America/Bogota'
    AND NOT EXISTS (
      SELECT 1 FROM taller_inventario_movimientos a
      WHERE a.empresa_id = m.empresa_id AND a.anula_movimiento_id = m.id
    )
  GROUP BY 1 ORDER BY 1;
$$;
REVOKE ALL ON FUNCTION public.resumir_ventas_mostrador_por_dia(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resumir_ventas_mostrador_por_dia(uuid, date) TO service_role;
