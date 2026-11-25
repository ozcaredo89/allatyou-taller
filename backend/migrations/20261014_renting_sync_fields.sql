-- Migración: Campos de Trazabilidad e Idempotencia para Sincronización con Renting Hub
-- Fecha: 2026-10-14

ALTER TABLE taller_ingresos 
  ADD COLUMN IF NOT EXISTS renting_sync_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS renting_expense_ids JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS renting_sync_error TEXT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_taller_ingresos_renting_sync 
  ON taller_ingresos(renting_sync_at) 
  WHERE renting_sync_at IS NOT NULL;
