-- ==============================================================================
-- MIGRATION: create_dispositivos_autorizados
-- FECHA: 2026-06-30
-- PROPÓSITO: Crea la tabla para gestionar las sesiones persistentes (Device Linking)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS taller_dispositivos_autorizados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES taller_empresas(id) ON DELETE CASCADE,
  usuario_email TEXT NOT NULL,
  device_name TEXT, -- Ej: "Chrome en Windows"
  fingerprint_hash TEXT NOT NULL, -- Hash de (User-Agent + SALT)
  is_active BOOLEAN DEFAULT true,
  last_used_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL, -- 24 horas desde la creación
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Índices para búsqueda rápida en el middleware y en la vista de configuración
CREATE INDEX IF NOT EXISTS idx_dispositivos_empresa_email 
  ON taller_dispositivos_autorizados(empresa_id, usuario_email);

CREATE INDEX IF NOT EXISTS idx_dispositivos_activos 
  ON taller_dispositivos_autorizados(is_active) WHERE is_active = true;

-- Habilitar RLS (Row Level Security)
ALTER TABLE taller_dispositivos_autorizados ENABLE ROW LEVEL SECURITY;

-- Políticas de Seguridad
-- 1. Un usuario (taller) solo puede ver los dispositivos de su propia empresa
CREATE POLICY "Permitir lectura a la propia empresa" 
  ON taller_dispositivos_autorizados FOR SELECT 
  USING (empresa_id = auth.uid()); -- asumiendo que el JWT mapped a Supabase o manejado en backend

-- (En este proyecto, la mayoría de la lógica RLS se maneja con service_role desde el backend NodeJS
-- así que las políticas RLS estrictas pueden no ser necesarias si el frontend no accede directamente a Supabase)
