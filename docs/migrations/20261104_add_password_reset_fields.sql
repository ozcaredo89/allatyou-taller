-- Migración: Campos para Recuperación y Creación de Contraseña de Usuarios
-- Fecha: 2026-11-04
-- Descripción: Agrega soporte para tokens/códigos temporales de restablecimiento de contraseña en taller_empresas_correos.

ALTER TABLE taller_empresas_correos 
  ADD COLUMN IF NOT EXISTS reset_password_token VARCHAR(100) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS reset_password_expires_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_taller_empresas_correos_reset 
  ON taller_empresas_correos(empresa_id, email, reset_password_token) 
  WHERE reset_password_token IS NOT NULL;
