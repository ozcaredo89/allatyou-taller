ALTER TABLE public.taller_inventario_items
  ADD COLUMN es_granel boolean NOT NULL DEFAULT false,
  ADD COLUMN capacidad_envase numeric(12,3),
  ADD CONSTRAINT inventario_capacidad_granel CHECK (
    (NOT es_granel AND capacidad_envase IS NULL)
    OR (es_granel AND unidad = 'litro' AND capacidad_envase IS NOT NULL
        AND capacidad_envase > 0 AND capacidad_envase < 'Infinity'::numeric)
  );

ALTER TABLE public.taller_inventario_movimientos
  ADD COLUMN presentacion text,
  ADD COLUMN cantidad_presentacion numeric(12,3),
  ADD CONSTRAINT inventario_presentacion_compra CHECK (
    (presentacion IS NULL AND cantidad_presentacion IS NULL)
    OR (presentacion IS NOT NULL AND presentacion IN ('tambor', 'galón', 'litro')
        AND cantidad_presentacion IS NOT NULL AND cantidad_presentacion > 0
        AND cantidad_presentacion < 'Infinity'::numeric)
  );

GRANT INSERT (es_granel, capacidad_envase), UPDATE (es_granel, capacidad_envase)
  ON public.taller_inventario_items TO service_role;

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

  IF presentacion IS NOT NULL OR cantidad_presentacion IS NOT NULL THEN
    IF p_tipo <> 'ENTRADA' OR NOT producto.es_granel OR presentacion IS NULL
      OR presentacion NOT IN ('tambor', 'galón', 'litro') OR cantidad_presentacion IS NULL
      OR cantidad_presentacion <= 0 OR cantidad_presentacion <> round(cantidad_presentacion, 3)
      OR cantidad_presentacion::text IN ('NaN', 'Infinity', '-Infinity')
      OR costo_presentacion IS NULL OR costo_presentacion < 0 OR costo_presentacion::text IN ('NaN', 'Infinity', '-Infinity') THEN
      RAISE EXCEPTION 'Presentación, cantidad o costo de compra inválidos' USING ERRCODE = '22023';
    END IF;
    cantidad := round(cantidad_presentacion * CASE presentacion
      WHEN 'tambor' THEN producto.capacidad_envase WHEN 'galón' THEN 3.785412 ELSE 1 END, 3);
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
    cantidad := medido - producto.stock_actual;
    IF cantidad = 0 THEN RETURN NULL; END IF;
    costo := producto.costo_promedio;
    notas_movimiento := concat_ws(' · ', 'Medición física', nullif(btrim(notas_movimiento), ''));
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
    ingreso_item_id, gasto_id, proveedor, factura_ref, notas, usuario_email, anula_movimiento_id, presentacion, cantidad_presentacion
  ) VALUES (
    coalesce(operacion, gen_random_uuid()), p_empresa, p_item, p_tipo, cantidad, costo, precio, orden, linea, gasto,
    coalesce(p_datos->>'proveedor', original.proveedor), coalesce(p_datos->>'factura_ref', original.factura_ref),
    notas_movimiento, p_usuario, original.id, presentacion, cantidad_presentacion
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
