-- ============================================================
-- Migration: Liquidación de Técnicos — RPC atómica + trazabilidad
-- Ejecutar en el SQL Editor de Supabase Dashboard
-- ============================================================

-- ── 1. NUEVAS COLUMNAS EN taller_ingresos_tecnicos ──────────────────────────

ALTER TABLE taller_ingresos_tecnicos
  ADD COLUMN IF NOT EXISTS estado     VARCHAR(20) NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'liquidado')),
  ADD COLUMN IF NOT EXISTS fecha_pago DATE,
  ADD COLUMN IF NOT EXISTS gasto_id   UUID
    REFERENCES taller_gastos(id) ON DELETE RESTRICT;

-- Índice para consultas de técnico+estado (pestaña de pendientes/historial)
CREATE INDEX IF NOT EXISTS idx_ingresos_tecnicos_tecnico_estado
  ON taller_ingresos_tecnicos(tecnico_id, estado);

-- ── 2. BACKFILL DEL HISTÓRICO ────────────────────────────────────────────────
-- Marca como 'liquidado' (sin gasto_id) todas las comisiones de órdenes
-- entregadas ANTES de hoy. Así no aparece deuda falsa por pagos que ya se
-- hicieron en efectivo fuera del sistema.
-- fecha_pago = fecha de entrega de la orden, convertida al huso America/Bogota.
--
-- NOTA: Una orden vieja editada hoy tendrá updated_at de hoy y quedará en
-- 'pendiente'. Es un caso raro; revisar manualmente si aparece.

UPDATE taller_ingresos_tecnicos it
SET
  estado     = 'liquidado',
  fecha_pago = (i.updated_at AT TIME ZONE 'America/Bogota')::date
FROM taller_ingresos i
WHERE it.ingreso_id = i.id
  AND i.estado = 'entregado'
  AND (i.updated_at AT TIME ZONE 'America/Bogota')::date
        < (now() AT TIME ZONE 'America/Bogota')::date;

-- ── 3. RPC: liquidar_comisiones_tecnico ─────────────────────────────────────
-- Registra el gasto de Nómina e impone las comisiones como 'liquidadas'
-- de forma atómica. Soporta reintentos idempotentes por lote_id.
--
-- Retorna: el UUID del gasto creado (o el existente si es reintento).

CREATE OR REPLACE FUNCTION liquidar_comisiones_tecnico(
  p_empresa_id  uuid,
  p_tecnico_id  uuid,
  p_filas_ids   uuid[],
  p_fecha       date,
  p_notas       text,
  p_categoria_id uuid,
  p_lote_id     uuid
) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
  v_gasto     uuid;
  v_total     numeric;
  v_n         int;
  v_esperadas int;
  v_nombre    text;
BEGIN
  -- 1. IDEMPOTENCIA: si el mismo lote ya fue procesado, devolver el gasto
  SELECT id INTO v_gasto
    FROM taller_gastos
   WHERE empresa_id = p_empresa_id
     AND lote_id    = p_lote_id
     AND lote_orden = 1;
  IF v_gasto IS NOT NULL THEN
    RETURN v_gasto;
  END IF;

  -- 2. Cantidad de IDs únicos esperados
  SELECT count(DISTINCT x) INTO v_esperadas
    FROM unnest(p_filas_ids) x;

  -- 3. BLOQUEO PESIMISTA: evita doble liquidación concurrente
  PERFORM 1
    FROM taller_ingresos_tecnicos
   WHERE id = ANY(p_filas_ids)
   FOR UPDATE;

  -- 4. VALIDACIÓN ESTRICTA:
  --    - Pertenencia al taller (join con taller_ingresos.empresa_id)
  --    - Orden en estado 'entregado'
  --    - Técnico correcto (evita mezcla de técnicos)
  --    - Comisión en estado 'pendiente' (evita pago doble)
  SELECT count(*), coalesce(sum(it.monto_comision), 0)
    INTO v_n, v_total
    FROM taller_ingresos_tecnicos it
    JOIN taller_ingresos i ON i.id = it.ingreso_id
   WHERE it.id          = ANY(p_filas_ids)
     AND i.empresa_id   = p_empresa_id
     AND i.estado       = 'entregado'
     AND it.tecnico_id  = p_tecnico_id
     AND it.estado      = 'pendiente';

  IF v_n <> v_esperadas THEN
    RAISE EXCEPTION 'FILAS_INVALIDAS';
  END IF;

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'MONTO_CERO';
  END IF;

  -- 5. Nombre del técnico para la descripción del gasto
  SELECT nombre INTO v_nombre
    FROM taller_tecnicos
   WHERE id = p_tecnico_id;

  -- 6. INSERTAR GASTO DE NÓMINA (atómico con el update de abajo)
  INSERT INTO taller_gastos (
    empresa_id, fecha, categoria_id, descripcion,
    monto, proveedor, tipo, notas, lote_id, lote_orden
  ) VALUES (
    p_empresa_id,
    p_fecha,
    p_categoria_id,
    format('Liquidación comisiones - %s (%s servicios)', v_nombre, v_n),
    v_total,
    v_nombre,
    'unico',
    p_notas,
    p_lote_id,
    1
  )
  RETURNING id INTO v_gasto;

  -- 7. MARCAR COMISIONES COMO LIQUIDADAS
  --    fecha_pago es DATE igual que taller_gastos.fecha → sin desfase de TZ
  UPDATE taller_ingresos_tecnicos
     SET estado     = 'liquidado',
         gasto_id   = v_gasto,
         fecha_pago = p_fecha
   WHERE id = ANY(p_filas_ids);

  RETURN v_gasto;
END $$;

-- ── 4. RECARGAR CACHÉ DE POSTGREST ───────────────────────────────────────────
-- Fuerza a PostgREST a redescubrir el nuevo esquema de inmediato.
-- Evita el error "Could not find the function liquidar_comisiones_tecnico"
-- en el primer intento de liquidar tras ejecutar esta migración.
NOTIFY pgrst, 'reload schema';
