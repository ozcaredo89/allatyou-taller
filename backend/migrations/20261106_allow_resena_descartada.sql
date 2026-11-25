-- ============================================================
-- Migration: Permitir estado 'descartado' en resena_estado
-- Ejecutar en Supabase SQL Editor
-- ============================================================

DO $$
BEGIN
  -- Eliminar la restricción check previa si existe
  ALTER TABLE taller_ingresos 
    DROP CONSTRAINT IF EXISTS taller_ingresos_resena_estado_check;

  -- Recrear la restricción incluyendo 'descartado'
  ALTER TABLE taller_ingresos 
    ADD CONSTRAINT taller_ingresos_resena_estado_check 
    CHECK (resena_estado IN ('pendiente', 'intentado', 'confirmado', 'descartado'));
END $$;
