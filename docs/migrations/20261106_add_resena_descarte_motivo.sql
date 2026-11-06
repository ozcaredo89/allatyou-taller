-- ============================================================
-- Migration: Agregar resena_descarte_motivo en taller_ingresos
-- Permite guardar la nota o razón por la cual se descarta un card
-- de solicitud de reseña de Google (ej: no tiene WhatsApp, número fijo, etc.)
-- ============================================================

ALTER TABLE taller_ingresos 
  ADD COLUMN IF NOT EXISTS resena_descarte_motivo TEXT;
