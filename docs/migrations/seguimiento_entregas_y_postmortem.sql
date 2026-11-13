-- ============================================================
-- MIGRACIÓN: Seguimiento de Entregas, Check-ins (4/6/10h) y Post-Mortem
-- Archivo: docs/migrations/seguimiento_entregas_y_postmortem.sql
-- ============================================================

-- 1. Configuración de intervalo de seguimiento por taller (4h, 6h o 10h)
ALTER TABLE taller_empresas
  ADD COLUMN IF NOT EXISTS intervalo_seguimiento_horas INTEGER NOT NULL DEFAULT 6;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'taller_empresas_intervalo_seguimiento_check'
  ) THEN
    ALTER TABLE taller_empresas
      ADD CONSTRAINT taller_empresas_intervalo_seguimiento_check
      CHECK (intervalo_seguimiento_horas IN (4, 6, 10));
  END IF;
END $$;

-- 2. Campos de promesa de entrega y seguimiento en taller_ingresos
ALTER TABLE taller_ingresos
  ADD COLUMN IF NOT EXISTS fecha_entrega_estimada TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ultima_actualizacion_estado TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reprogramaciones_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS motivo_demora_actual TEXT;

-- Inicializar ultima_actualizacion_estado para órdenes activas existentes
UPDATE taller_ingresos
SET ultima_actualizacion_estado = COALESCE(estado_desde, fecha_ingreso, updated_at, NOW())
WHERE ultima_actualizacion_estado IS NULL
  AND estado IN ('recepcion', 'diagnostico', 'cotizacion', 'esperando_aprobacion', 'en_reparacion');

-- Índice para consultar órdenes activas por promesa de entrega
CREATE INDEX IF NOT EXISTS idx_ingresos_empresa_estado_entrega_est
  ON taller_ingresos(empresa_id, estado, fecha_entrega_estimada);

-- 3. Ampliar tipos de evento permitidos en bitácora
ALTER TABLE taller_ingresos_bitacora
  DROP CONSTRAINT IF EXISTS taller_ingresos_bitacora_tipo_evento_check;

ALTER TABLE taller_ingresos_bitacora
  ADD CONSTRAINT taller_ingresos_bitacora_tipo_evento_check
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
    'rediagnostico',
    'seguimiento',
    'reprogramacion'
  ));
