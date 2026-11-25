ALTER TABLE taller_ingresos
  ADD COLUMN IF NOT EXISTS kilometraje_entrega numeric CHECK (kilometraje_entrega > 0);
