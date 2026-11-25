-- ============================================================
-- Migration: Liquidador de Técnicos
-- Ejecutar en el SQL Editor de Supabase Dashboard
-- ============================================================

-- Crear la tabla pivote si NO existe aún
CREATE TABLE IF NOT EXISTS taller_ingresos_tecnicos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ingreso_id    UUID NOT NULL REFERENCES taller_ingresos(id) ON DELETE CASCADE,
  tecnico_id    UUID NOT NULL REFERENCES taller_tecnicos(id) ON DELETE CASCADE,
  monto_comision NUMERIC DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Si la tabla YA existía pero le falta el id o monto_comision, ejecutar:
ALTER TABLE taller_ingresos_tecnicos
  ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();

ALTER TABLE taller_ingresos_tecnicos
  ADD COLUMN IF NOT EXISTS monto_comision NUMERIC DEFAULT 0;

-- Verificar resultado
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'taller_ingresos_tecnicos'
ORDER BY ordinal_position;
