-- Migración: Índice compuesto para optimización del Centinela del Dashboard
-- Fecha: 2026-10-29
-- Propósito: Optimizar la consulta del centinela:
--   SELECT created_at FROM taller_ingresos_bitacora WHERE empresa_id = $1 ORDER BY created_at DESC LIMIT 1
-- Evita un Sort / Seq Scan completo de la bitácora cuando el taller acumule miles de registros.

CREATE INDEX IF NOT EXISTS idx_bitacora_empresa_fecha 
  ON taller_ingresos_bitacora(empresa_id, created_at DESC);
