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
  operacion uuid := (p_datos->>'operacion_id')::uuid;
BEGIN
  SELECT * INTO STRICT producto FROM taller_inventario_items
    WHERE empresa_id = p_empresa AND id = p_item FOR UPDATE;

  IF operacion IS NOT NULL THEN
    SELECT * INTO movimiento FROM taller_inventario_movimientos
      WHERE id = operacion AND empresa_id = p_empresa AND item_id = p_item AND tipo = p_tipo;
    IF FOUND THEN RETURN movimiento; END IF;
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
    IF round(cantidad * costo, 2) <= 0 THEN
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
        'Compra de ' || producto.nombre, cantidad * costo, p_datos->>'proveedor',
        concat_ws(' · ', p_datos->>'factura_ref', p_datos->>'notas')) RETURNING id INTO gasto;
  END IF;

  UPDATE taller_inventario_items SET stock_actual = nuevo_stock, costo_promedio = nuevo_costo
    WHERE empresa_id = p_empresa AND id = p_item;
  INSERT INTO taller_inventario_movimientos (
    id, empresa_id, item_id, tipo, cantidad, costo_unitario, precio_unitario, ingreso_id,
    ingreso_item_id, gasto_id, proveedor, factura_ref, notas, usuario_email, anula_movimiento_id
  ) VALUES (
    coalesce(operacion, gen_random_uuid()), p_empresa, p_item, p_tipo, cantidad, costo, precio, orden, linea, gasto,
    coalesce(p_datos->>'proveedor', original.proveedor), coalesce(p_datos->>'factura_ref', original.factura_ref),
    p_datos->>'notas', p_usuario, original.id
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

CREATE FUNCTION public.actualizar_orden_inventario_operativo(p_empresa uuid, p_orden uuid, p_cambios jsonb, p_usuario text, p_estado_anterior text)
RETURNS text[] LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  anterior taller_ingresos;
  siguiente taller_ingresos;
  campos text;
  asignaciones text;
  lineas jsonb;
  linea jsonb;
  salida taller_inventario_movimientos;
  producto taller_inventario_items;
  faltantes text[] := ARRAY[]::text[];
BEGIN
  SELECT * INTO STRICT anterior FROM taller_ingresos
    WHERE empresa_id = p_empresa AND id = p_orden FOR UPDATE;
  IF anterior.estado::text IS DISTINCT FROM p_estado_anterior THEN
    RAISE EXCEPTION 'La orden cambió de estado. Actualiza la página antes de continuar.' USING ERRCODE = '40001';
  END IF;
  p_cambios := p_cambios - ARRAY['id', 'empresa_id'];
  siguiente := jsonb_populate_record(anterior, p_cambios);

  IF p_cambios ?| ARRAY['estado', 'items_factura'] THEN
    lineas := '[]'::jsonb;
    IF siguiente.estado <> 'cancelado' THEN
      SELECT coalesce(jsonb_agg(l), '[]'::jsonb) INTO lineas
        FROM jsonb_array_elements(CASE WHEN jsonb_typeof(siguiente.items_factura) = 'array' THEN siguiente.items_factura ELSE '[]' END) l
        WHERE l->>'tipo' = 'repuesto' AND l->>'inventario_item_id' IS NOT NULL;

      IF EXISTS (
        SELECT 1 FROM jsonb_array_elements(lineas) l
        LEFT JOIN taller_inventario_items p ON p.empresa_id = p_empresa AND p.id::text = l->>'inventario_item_id'
        WHERE p.id IS NULL OR nullif(btrim(l->>'id'), '') IS NULL
          OR coalesce(jsonb_typeof(l->'cantidad'), '') <> 'number'
          OR (l->>'cantidad')::numeric <= 0 OR (l->>'cantidad')::numeric <> round((l->>'cantidad')::numeric, 3)
      ) OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(lineas) l GROUP BY l->>'id' HAVING count(*) > 1
      ) THEN
        RAISE EXCEPTION 'Las líneas de inventario de la orden son inválidas' USING ERRCODE = '22023';
      END IF;
    END IF;
    IF siguiente.estado <> 'entregado' THEN lineas := '[]'::jsonb; END IF;

    -- Orden uniforme de bloqueo para entregas concurrentes con productos en común.
    PERFORM p.id FROM taller_inventario_items p
      WHERE p.empresa_id = p_empresa AND (
        p.id::text IN (SELECT l->>'inventario_item_id' FROM jsonb_array_elements(lineas) l)
        OR p.id IN (
          SELECT m.item_id FROM taller_inventario_salidas_vigentes s
          JOIN taller_inventario_movimientos m ON m.id = s.movimiento_id
          WHERE s.empresa_id = p_empresa AND s.ingreso_id = p_orden
        )
      ) ORDER BY p.id FOR UPDATE;

    FOR salida IN
      SELECT m.* FROM taller_inventario_salidas_vigentes s
      JOIN taller_inventario_movimientos m ON m.id = s.movimiento_id
      WHERE s.empresa_id = p_empresa AND s.ingreso_id = p_orden
        AND NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(lineas) l
          WHERE l->>'id' = m.ingreso_item_id AND l->>'inventario_item_id' = m.item_id::text
            AND (l->>'cantidad')::numeric = -m.cantidad
            AND (l->>'precio_unitario')::numeric = m.precio_unitario
        )
    LOOP
      PERFORM registrar_movimiento_inventario(p_empresa, salida.item_id, 'ANULACION',
        jsonb_build_object('anula_movimiento_id', salida.id, 'notas', 'Cambio en la orden'), p_usuario);
    END LOOP;

    FOR linea IN SELECT l FROM jsonb_array_elements(lineas) l
      WHERE NOT EXISTS (
        SELECT 1 FROM taller_inventario_salidas_vigentes s
        WHERE s.empresa_id = p_empresa AND s.ingreso_id = p_orden AND s.ingreso_item_id = l->>'id'
      )
    LOOP
      SELECT * INTO STRICT producto FROM taller_inventario_items
        WHERE empresa_id = p_empresa AND id = (linea->>'inventario_item_id')::uuid;
      IF producto.stock_actual < (linea->>'cantidad')::numeric THEN
        faltantes := array_append(faltantes, producto.nombre);
        CONTINUE;
      END IF;
      PERFORM registrar_movimiento_inventario(p_empresa, producto.id, 'SALIDA_ORDEN',
        jsonb_build_object('ingreso_id', p_orden, 'ingreso_item_id', linea->>'id',
          'cantidad', linea->'cantidad', 'precio_unitario', linea->'precio_unitario'), p_usuario);
    END LOOP;
  END IF;

  SELECT string_agg(format('%1$I = ($1).%1$I', k), ', ')
    INTO asignaciones FROM jsonb_object_keys(p_cambios) k;
  IF asignaciones IS NOT NULL THEN
    EXECUTE format('UPDATE taller_ingresos SET %s WHERE empresa_id = $2 AND id = $3', asignaciones)
      USING siguiente, p_empresa, p_orden;
  END IF;
  RETURN faltantes;
END;
$$;
REVOKE ALL ON FUNCTION public.actualizar_orden_inventario_operativo(uuid, uuid, jsonb, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.actualizar_orden_inventario_operativo(uuid, uuid, jsonb, text, text) TO service_role;

-- Regularizar gastos generados por compras que ya fueron anuladas.
DELETE FROM public.taller_gastos g
USING public.taller_inventario_movimientos original, public.taller_inventario_movimientos reverso
WHERE original.tipo = 'ENTRADA' AND reverso.tipo = 'ANULACION'
  AND reverso.anula_movimiento_id = original.id AND reverso.empresa_id = original.empresa_id
  AND g.empresa_id = original.empresa_id AND g.id = original.gasto_id;

CREATE FUNCTION public.consultar_ventas_mostrador(p_empresa uuid, p_desde date, p_hasta date)
RETURNS TABLE (id uuid, fecha date, producto text, cantidad numeric, precio_unitario numeric, ingreso numeric, costo numeric)
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT m.id, (m.created_at AT TIME ZONE 'America/Bogota')::date, p.nombre,
    -m.cantidad, m.precio_unitario, round(-m.cantidad * m.precio_unitario, 2),
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
