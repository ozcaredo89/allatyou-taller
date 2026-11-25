-- Columnas para agrupacion e idempotencia atomica (sin default enganoso en orden)
ALTER TABLE taller_gastos
  ADD COLUMN IF NOT EXISTS lote_id    UUID,
  ADD COLUMN IF NOT EXISTS lote_orden SMALLINT;

-- Indice unico compuesto: garantiza idempotencia y previene carreras en reintentos
CREATE UNIQUE INDEX IF NOT EXISTS idx_gastos_empresa_lote_orden
  ON taller_gastos(empresa_id, lote_id, lote_orden);

-- Indice para consultas y agrupaciones por lote
CREATE INDEX IF NOT EXISTS idx_gastos_empresa_lote
  ON taller_gastos(empresa_id, lote_id);