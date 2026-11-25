CREATE TABLE public.taller_inventario_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.taller_empresas(id),
  codigo text NOT NULL CHECK (btrim(codigo) <> ''),
  nombre text NOT NULL CHECK (btrim(nombre) <> ''),
  categoria text,
  unidad text NOT NULL DEFAULT 'und' CHECK (unidad IN ('und', 'litro', 'galón')),
  costo_promedio numeric(16,6) NOT NULL DEFAULT 0 CHECK (costo_promedio >= 0),
  precio_venta numeric(14,2) NOT NULL DEFAULT 0 CHECK (precio_venta >= 0),
  stock_actual numeric(12,3) NOT NULL DEFAULT 0 CHECK (stock_actual >= 0),
  stock_minimo numeric(12,3) NOT NULL DEFAULT 0 CHECK (stock_minimo >= 0),
  activo boolean NOT NULL DEFAULT true,
  UNIQUE (empresa_id, codigo),
  UNIQUE (empresa_id, id)
);

CREATE TABLE public.taller_inventario_movimientos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL,
  item_id uuid NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('ENTRADA', 'SALIDA_ORDEN', 'SALIDA_VENTA', 'AJUSTE', 'ANULACION')),
  cantidad numeric(12,3) NOT NULL CHECK (cantidad <> 0),
  costo_unitario numeric(16,6) NOT NULL CHECK (costo_unitario >= 0),
  precio_unitario numeric(14,2) CHECK (precio_unitario >= 0),
  ingreso_id uuid,
  ingreso_item_id text,
  gasto_id uuid,
  proveedor text,
  factura_ref text,
  notas text,
  usuario_email text NOT NULL,
  anula_movimiento_id uuid UNIQUE REFERENCES public.taller_inventario_movimientos(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (empresa_id, item_id) REFERENCES public.taller_inventario_items(empresa_id, id)
);
CREATE INDEX ON public.taller_inventario_movimientos (empresa_id, created_at DESC, id DESC);

-- La proyección de salidas vigentes permite reutilizar la línea al reentregar
-- y conserva intactos todos los asientos del historial.
CREATE TABLE public.taller_inventario_salidas_vigentes (
  empresa_id uuid NOT NULL,
  ingreso_id uuid NOT NULL,
  ingreso_item_id text NOT NULL,
  movimiento_id uuid PRIMARY KEY REFERENCES public.taller_inventario_movimientos(id)
);
CREATE UNIQUE INDEX ON public.taller_inventario_salidas_vigentes (ingreso_id, ingreso_item_id);

ALTER TABLE public.taller_inventario_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.taller_inventario_movimientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.taller_inventario_salidas_vigentes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.taller_inventario_items, public.taller_inventario_movimientos,
  public.taller_inventario_salidas_vigentes FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.taller_inventario_items, public.taller_inventario_movimientos,
  public.taller_inventario_salidas_vigentes FROM service_role;
GRANT SELECT ON public.taller_inventario_items, public.taller_inventario_movimientos,
  public.taller_inventario_salidas_vigentes TO service_role;
GRANT INSERT (empresa_id, codigo, nombre, categoria, unidad, precio_venta, stock_minimo, activo),
  UPDATE (codigo, nombre, categoria, unidad, precio_venta, stock_minimo, activo)
  ON public.taller_inventario_items TO service_role;

CREATE FUNCTION public.registrar_movimiento_inventario(
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
    INSERT INTO taller_categorias_gastos (empresa_id, nombre)
      VALUES (p_empresa, 'Repuestos') ON CONFLICT (empresa_id, nombre) DO NOTHING;
    SELECT id INTO STRICT categoria FROM taller_categorias_gastos
      WHERE empresa_id = p_empresa AND nombre = 'Repuestos';
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

CREATE FUNCTION public.consultar_inventario(p_empresa uuid)
RETURNS SETOF jsonb LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT to_jsonb(p) || jsonb_build_object('stock_comprometido', coalesce(c.cantidad, 0))
  FROM taller_inventario_items p
  LEFT JOIN (
    SELECT linea->>'inventario_item_id' AS item, sum((linea->>'cantidad')::numeric) AS cantidad
    FROM taller_ingresos i
    CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(i.items_factura) = 'array' THEN i.items_factura ELSE '[]' END) linea
    WHERE i.empresa_id = p_empresa AND i.estado NOT IN ('entregado', 'cancelado')
      AND linea->>'tipo' = 'repuesto' AND linea->>'inventario_item_id' IS NOT NULL
      AND jsonb_typeof(linea->'cantidad') = 'number'
    GROUP BY 1
  ) c ON c.item = p.id::text
  WHERE p.empresa_id = p_empresa
  ORDER BY p.nombre, p.id;
$$;
REVOKE ALL ON FUNCTION public.consultar_inventario(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consultar_inventario(uuid) TO service_role;

CREATE FUNCTION public.actualizar_orden_inventario(p_empresa uuid, p_orden uuid, p_cambios jsonb, p_usuario text, p_estado_anterior text)
RETURNS void LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  anterior taller_ingresos;
  siguiente taller_ingresos;
  campos text;
  asignaciones text;
  lineas jsonb;
  linea jsonb;
  salida taller_inventario_movimientos;
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
      PERFORM registrar_movimiento_inventario(p_empresa, (linea->>'inventario_item_id')::uuid, 'SALIDA_ORDEN',
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
END;
$$;
REVOKE ALL ON FUNCTION public.actualizar_orden_inventario(uuid, uuid, jsonb, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.actualizar_orden_inventario(uuid, uuid, jsonb, text, text) TO service_role;
