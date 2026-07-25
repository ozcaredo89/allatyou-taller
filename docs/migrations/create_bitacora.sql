-- ============================================================
-- MIGRACIÓN: Bitácora de Eventos por Ingreso (Visita)
-- Archivo: docs/migrations/create_bitacora.sql
-- Ejecutar completo en Supabase SQL Editor
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. TABLA: taller_ingresos_bitacora
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS taller_ingresos_bitacora (
    id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id  UUID         NOT NULL REFERENCES taller_empresas(id) ON DELETE CASCADE,
    ingreso_id  UUID         NOT NULL REFERENCES taller_ingresos(id) ON DELETE CASCADE,
    usuario_id  UUID         REFERENCES auth.users(id) ON DELETE SET NULL,

    tipo_evento VARCHAR(50)  NOT NULL
                CHECK (tipo_evento IN (
                    'creacion',
                    'cambio_estado',
                    'asignacion_tecnicos',
                    'diagnostico',
                    'cotizacion',
                    'aprobacion',
                    'nota',
                    'entrega',
                    'cancelacion',
                    'rediagnostico'
                )),

    titulo      VARCHAR(255) NOT NULL,
    descripcion TEXT,
    metadata    JSONB        DEFAULT '{}',

    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- 2. ÍNDICES
-- ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_bitacora_ingreso_fecha
    ON taller_ingresos_bitacora(ingreso_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bitacora_empresa
    ON taller_ingresos_bitacora(empresa_id);

-- ─────────────────────────────────────────────────────────────
-- 3. RLS
-- ─────────────────────────────────────────────────────────────
ALTER TABLE taller_ingresos_bitacora ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bitacora_aislamiento"
    ON taller_ingresos_bitacora
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────
-- 4. TRIGGER: Registra automáticamente cada cambio de estado
--    en taller_ingresos. Así el backend no puede "olvidarse"
--    de registrarlo.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_bitacora_cambio_estado()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_titulo      TEXT;
    v_descripcion TEXT;
    v_tipo        TEXT;
BEGIN
    -- Solo actuar si el estado realmente cambió
    IF OLD.estado = NEW.estado THEN
        RETURN NEW;
    END IF;

    -- Determinar tipo y título según el nuevo estado
    CASE NEW.estado
        WHEN 'diagnostico' THEN
            v_tipo        := 'cambio_estado';
            v_titulo      := 'Vehículo en Diagnóstico';
            v_descripcion := 'Se inició el proceso de diagnóstico mecánico.';
        WHEN 'cotizacion' THEN
            v_tipo        := 'cotizacion';
            v_titulo      := 'Cotización Generada';
            v_descripcion := 'Se generó la orden de servicio con el presupuesto.';
        WHEN 'esperando_aprobacion' THEN
            v_tipo        := 'cambio_estado';
            v_titulo      := 'Esperando Aprobación del Cliente';
            v_descripcion := 'La cotización fue enviada al cliente y se espera su aprobación.';
        WHEN 'en_reparacion' THEN
            v_tipo        := 'cambio_estado';
            v_titulo      := 'Reparación Iniciada';
            v_descripcion := 'El vehículo entró formalmente a reparación.';
        WHEN 'entregado' THEN
            v_tipo        := 'entrega';
            v_titulo      := 'Vehículo Entregado ✅';
            v_descripcion := 'El vehículo fue entregado satisfactoriamente al cliente.';
        WHEN 'cancelado' THEN
            v_tipo        := 'cancelacion';
            v_titulo      := 'Orden Cancelada';
            v_descripcion := 'La orden de servicio fue cancelada.';
        ELSE
            v_tipo        := 'cambio_estado';
            v_titulo      := 'Cambio de Estado';
            v_descripcion := format('Estado: %s → %s', OLD.estado, NEW.estado);
    END CASE;

    INSERT INTO taller_ingresos_bitacora
        (empresa_id, ingreso_id, tipo_evento, titulo, descripcion, metadata)
    VALUES (
        NEW.empresa_id,
        NEW.id,
        v_tipo,
        v_titulo,
        v_descripcion,
        CASE 
            WHEN NEW.estado = 'cotizacion' THEN
                jsonb_build_object(
                    'estado_anterior', OLD.estado,
                    'estado_nuevo',    NEW.estado,
                    'items_factura',   NEW.items_factura
                )
            ELSE
                jsonb_build_object(
                    'estado_anterior', OLD.estado,
                    'estado_nuevo',    NEW.estado
                )
        END
    );

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bitacora_cambio_estado ON taller_ingresos;

CREATE TRIGGER trg_bitacora_cambio_estado
    AFTER UPDATE OF estado ON taller_ingresos
    FOR EACH ROW
    EXECUTE FUNCTION fn_bitacora_cambio_estado();


-- ─────────────────────────────────────────────────────────────
-- 5. SCRIPT RETROACTIVO (Seed): Pobla la bitácora con datos
--    existentes. IDEMPOTENTE: No duplica si ya existen eventos.
-- ─────────────────────────────────────────────────────────────

-- 5a. Evento de CREACIÓN para todos los ingresos existentes
INSERT INTO taller_ingresos_bitacora
    (empresa_id, ingreso_id, tipo_evento, titulo, descripcion, metadata, created_at)
SELECT
    i.empresa_id,
    i.id,
    'creacion',
    'Vehículo Recibido en Taller',
    format('Motivo de visita: %s', COALESCE(i.motivo_visita, 'No especificado')),
    jsonb_build_object(
        'kilometraje',    i.kilometraje,
        'nivel_gasolina', i.nivel_gasolina,
        'motivo_visita',  i.motivo_visita
    ),
    i.fecha_ingreso
FROM taller_ingresos i
WHERE NOT EXISTS (
    SELECT 1 FROM taller_ingresos_bitacora b
    WHERE b.ingreso_id = i.id AND b.tipo_evento = 'creacion'
);

-- 5b. Evento de DIAGNÓSTICO para ingresos que ya lo tienen
INSERT INTO taller_ingresos_bitacora
    (empresa_id, ingreso_id, tipo_evento, titulo, descripcion, metadata, created_at)
SELECT
    i.empresa_id,
    i.id,
    'diagnostico',
    'Diagnóstico Mecánico Registrado',
    'Se completó el diagnóstico del vehículo.',
    i.diagnostico_mecanico,
    i.fecha_ingreso + INTERVAL '30 minutes'
FROM taller_ingresos i
WHERE
    i.diagnostico_mecanico IS NOT NULL
    AND i.diagnostico_mecanico != '{}'::jsonb
    AND NOT EXISTS (
        SELECT 1 FROM taller_ingresos_bitacora b
        WHERE b.ingreso_id = i.id AND b.tipo_evento = 'diagnostico'
    );

-- 5c. Evento de COTIZACIÓN para ingresos que tienen ítems
INSERT INTO taller_ingresos_bitacora
    (empresa_id, ingreso_id, tipo_evento, titulo, descripcion, metadata, created_at)
SELECT
    i.empresa_id,
    i.id,
    'cotizacion',
    'Orden de Servicio Generada',
    format('Se registraron %s ítems de servicio en la orden.',
        jsonb_array_length(COALESCE(i.items_factura, '[]'::jsonb))
    ),
    jsonb_build_object('items_factura', i.items_factura),
    i.fecha_ingreso + INTERVAL '60 minutes'
FROM taller_ingresos i
WHERE
    i.items_factura IS NOT NULL
    AND jsonb_array_length(i.items_factura) > 0
    AND NOT EXISTS (
        SELECT 1 FROM taller_ingresos_bitacora b
        WHERE b.ingreso_id = i.id AND b.tipo_evento = 'cotizacion'
    );

-- 5d. Evento de ENTREGA para ingresos ya entregados
INSERT INTO taller_ingresos_bitacora
    (empresa_id, ingreso_id, tipo_evento, titulo, descripcion, metadata, created_at)
SELECT
    i.empresa_id,
    i.id,
    'entrega',
    'Vehículo Entregado ✅',
    'El vehículo fue entregado satisfactoriamente al cliente.',
    '{}'::jsonb,
    i.updated_at
FROM taller_ingresos i
WHERE
    i.estado = 'entregado'
    AND NOT EXISTS (
        SELECT 1 FROM taller_ingresos_bitacora b
        WHERE b.ingreso_id = i.id AND b.tipo_evento = 'entrega'
    );

-- 5e. Evento de CANCELACIÓN para ingresos cancelados
INSERT INTO taller_ingresos_bitacora
    (empresa_id, ingreso_id, tipo_evento, titulo, descripcion, metadata, created_at)
SELECT
    i.empresa_id,
    i.id,
    'cancelacion',
    'Orden Cancelada',
    COALESCE(i.motivo_cancelacion, 'Sin motivo registrado.'),
    '{}'::jsonb,
    i.updated_at
FROM taller_ingresos i
WHERE
    i.estado = 'cancelado'
    AND NOT EXISTS (
        SELECT 1 FROM taller_ingresos_bitacora b
        WHERE b.ingreso_id = i.id AND b.tipo_evento = 'cancelacion'
    );
