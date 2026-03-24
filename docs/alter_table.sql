-- Script SQL para actualizar la tabla taller_ingresos con las nuevas columnas de Fase 2
-- Ejecuta esto directamente en la consola SQL de Supabase

ALTER TABLE taller_ingresos 
ADD COLUMN diagnostico_mecanico JSONB DEFAULT '{}'::jsonb;

ALTER TABLE taller_ingresos 
ADD COLUMN fotos_evidencia JSONB DEFAULT '[]'::jsonb;
