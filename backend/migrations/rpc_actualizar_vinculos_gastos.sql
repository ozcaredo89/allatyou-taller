CREATE OR REPLACE FUNCTION actualizar_vinculos_gastos(
  p_empresa_id UUID,
  p_vinculos JSONB -- [{ "gasto_id": "...", "ingreso_id": "...", "item_id": "..." }]
) RETURNS JSONB LANGUAGE plpgsql
SET search_path = public, pg_temp AS $$
DECLARE
  v_elem JSONB;
  v_gasto_id UUID;
  v_ingreso_id UUID;
  v_item_id TEXT;
  v_orden RECORD;
  v_item_found BOOLEAN;
  v_item_elem JSONB;
  v_actualizados INT := 0;
BEGIN
  IF p_vinculos IS NULL OR jsonb_array_length(p_vinculos) = 0 THEN
    RETURN jsonb_build_object('ok', true, 'actualizados', 0);
  END IF;

  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_vinculos)
  LOOP
    v_gasto_id := (v_elem->>'gasto_id')::UUID;
    v_ingreso_id := NULLIF(v_elem->>'ingreso_id', '')::UUID;
    v_item_id := NULLIF(v_elem->>'item_id', '');

    -- 1. Validar que el gasto pertenezca a la empresa
    IF NOT EXISTS (SELECT 1 FROM taller_gastos WHERE id = v_gasto_id AND empresa_id = p_empresa_id) THEN
      RAISE EXCEPTION 'El gasto % no existe o no pertenece a tu taller.', v_gasto_id;
    END IF;

    -- 2. Validar que no se envie un item sin orden
    IF v_item_id IS NOT NULL AND v_ingreso_id IS NULL THEN
      RAISE EXCEPTION 'No se puede vincular un item sin especificar la orden de servicio (Gasto %).', v_gasto_id;
    END IF;

    -- 3. Si viene ingreso_id, validar que pertenezca a la MISMA empresa (cierra fuga multi-tenant)
    IF v_ingreso_id IS NOT NULL THEN
      SELECT id, items_factura INTO v_orden
      FROM taller_ingresos
      WHERE id = v_ingreso_id AND empresa_id = p_empresa_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'La orden de servicio % no existe o no pertenece a tu taller.', v_ingreso_id;
      END IF;

      -- 4. Si viene item_id, validar que exista en items_factura y sea tipo 'repuesto'
      IF v_item_id IS NOT NULL THEN
        v_item_found := FALSE;
        IF v_orden.items_factura IS NOT NULL AND jsonb_typeof(v_orden.items_factura) = 'array' THEN
          FOR v_item_elem IN SELECT * FROM jsonb_array_elements(v_orden.items_factura)
          LOOP
            IF v_item_elem->>'id' = v_item_id THEN
              IF v_item_elem->>'tipo' <> 'repuesto' THEN
                RAISE EXCEPTION 'El item % en la orden % no es de tipo repuesto.', v_item_id, v_ingreso_id;
              END IF;
              v_item_found := TRUE;
              EXIT;
            END IF;
          END LOOP;
        END IF;

        IF NOT v_item_found THEN
          RAISE EXCEPTION 'El item % no existe en la orden de servicio %.', v_item_id, v_ingreso_id;
        END IF;
      END IF;
    END IF;

    -- 5. Actualizar vinculo
    UPDATE taller_gastos
    SET
      ingreso_id = v_ingreso_id,
      item_id = CASE WHEN v_ingreso_id IS NOT NULL THEN v_item_id ELSE NULL END
    WHERE id = v_gasto_id AND empresa_id = p_empresa_id;

    v_actualizados := v_actualizados + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'actualizados', v_actualizados);
END;
$$;