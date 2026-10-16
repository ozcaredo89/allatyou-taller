-- ==============================================================================
-- MIGRATION: create_api_keys
-- FECHA: 2026-10-16
-- PROPÓSITO: API keys por empresa para integraciones máquina a máquina
--            (ej. consulta de historial de vehículos desde otra aplicación).
--
-- SEGURIDAD:
--   - Nunca se guarda la key en claro: solo su hash SHA-256 (la key tiene 256 bits
--     de entropía, por lo que SHA-256 es suficiente y permite búsqueda indexada).
--   - key_prefix permite identificar la key en el panel sin exponerla.
--   - scopes limita qué endpoints puede consumir cada key (mínimo privilegio).
--   - Igual que taller_dispositivos_autorizados: sin RLS, la seguridad la maneja
--     el backend filtrando por empresa_id.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS taller_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES taller_empresas(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,                 -- Ej: "Integración AllAtYou Renting"
  key_prefix TEXT NOT NULL,             -- Primeros caracteres visibles, ej: "tp_live_AbCd"
  key_hash TEXT NOT NULL UNIQUE,        -- SHA-256 hex de la key completa
  scopes TEXT[] NOT NULL DEFAULT ARRAY['historial_vehiculos:read'],
  activa BOOLEAN NOT NULL DEFAULT true,
  creada_por TEXT,                      -- Email del usuario que la creó
  ultimo_uso TIMESTAMPTZ,
  revocada_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_empresa
  ON taller_api_keys(empresa_id);

ALTER TABLE taller_api_keys DISABLE ROW LEVEL SECURITY;

GRANT ALL ON taller_api_keys TO anon;
GRANT ALL ON taller_api_keys TO authenticated;
