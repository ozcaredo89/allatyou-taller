-- ============================================================
-- Migración: Módulo de Asistente Virtual Público con IA
-- Versión: 2.1
-- Fecha: 2026-08-15
-- Zona Horaria de referencia: America/Bogota
-- Nomenclatura de tablas: prefijo taller_ (consistente con el resto del schema)
-- ============================================================

-- 1. Tabla de consumo diario de IA por empresa y proveedor
--    Zona horaria: Todos los campos "fecha" usan America/Bogota
CREATE TABLE IF NOT EXISTS taller_ai_uso_diario (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_slug TEXT NOT NULL,
    proveedor TEXT NOT NULL DEFAULT 'gemini', -- 'gemini' | 'openai'
    fecha DATE NOT NULL DEFAULT ((CURRENT_TIMESTAMP AT TIME ZONE 'America/Bogota')::date),
    tokens_input INTEGER DEFAULT 0,
    tokens_output INTEGER DEFAULT 0,
    costo_estimado_usd NUMERIC(10, 4) DEFAULT 0,
    requests_count INTEGER DEFAULT 0,
    UNIQUE (empresa_slug, fecha, proveedor)
);

CREATE INDEX IF NOT EXISTS idx_taller_ai_uso_diario_lookup
    ON taller_ai_uso_diario (empresa_slug, fecha, proveedor);

-- 2. Tabla de consumo global diario por proveedor
--    Incluye flags de deduplicación de alertas por correo
CREATE TABLE IF NOT EXISTS taller_ai_uso_global (
    fecha DATE NOT NULL DEFAULT ((CURRENT_TIMESTAMP AT TIME ZONE 'America/Bogota')::date),
    proveedor TEXT NOT NULL DEFAULT 'gemini',
    costo_estimado_usd NUMERIC(10, 4) DEFAULT 0,
    bloqueado BOOLEAN DEFAULT false,
    alerta_70_enviada BOOLEAN DEFAULT false,   -- true = el correo del 70% ya se envió hoy
    alerta_100_enviada BOOLEAN DEFAULT false,  -- true = el correo del 100% ya se envió hoy
    PRIMARY KEY (fecha, proveedor)
);

-- 3. Tabla de Leads capturados por el Asistente Virtual IA
--    Cumplimiento: Ley 1581 de 2012 (Habeas Data - Colombia)
CREATE TABLE IF NOT EXISTS taller_leads_ia (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES taller_empresas(id) ON DELETE CASCADE,
    nombre VARCHAR(255),
    telefono VARCHAR(50) NOT NULL,
    vehiculo_marca VARCHAR(100),
    vehiculo_linea VARCHAR(100),
    vehiculo_modelo VARCHAR(20),
    motivo_consulta TEXT,
    cotizacion_estimada TEXT,
    -- Cumplimiento Ley 1581: Consentimiento explícito del titular de los datos
    acepta_terminos BOOLEAN NOT NULL DEFAULT true,
    origen_url TEXT,
    estado VARCHAR(50) DEFAULT 'nuevo', -- 'nuevo', 'contactado', 'agendado', 'descartado'
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_taller_leads_ia_empresa
    ON taller_leads_ia (empresa_id, created_at DESC);

-- 4. Log de auditoría de conversaciones (anonimizado)
CREATE TABLE IF NOT EXISTS taller_ai_conversaciones_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_slug TEXT NOT NULL,
    proveedor TEXT NOT NULL,
    ip_hash TEXT,      -- Hash SHA-256 de la IP, nunca la IP real
    tokens_in INTEGER,
    tokens_out INTEGER,
    costo_usd NUMERIC(10, 4),
    fue_bloqueado BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_taller_ai_conversaciones_log_empresa
    ON taller_ai_conversaciones_log (empresa_slug, created_at DESC);

-- Índice para la query de rate limit por IP (ip_hash + ventana de tiempo)
CREATE INDEX IF NOT EXISTS idx_taller_ai_conversaciones_log_ip
    ON taller_ai_conversaciones_log (ip_hash, created_at DESC);

-- 5. Agregar columna de configuración de IA a taller_empresas
--    presupuesto_diario_usd: tope por empresa en USD por día
--    modo_precios: 'rangos' (±10-15% protección anti-scraping) | 'exacto'
ALTER TABLE taller_empresas
ADD COLUMN IF NOT EXISTS config_ai JSONB DEFAULT '{
    "activo": true,
    "modo_precios": "rangos",
    "presupuesto_diario_usd": 0.50,
    "telefono_leads": null,
    "email_notificaciones": null
}'::jsonb;

-- 6. Función RPC atómica para acumular costo en zona horaria America/Bogota
--    Devuelve JSONB con el estado global actualizado para que el servicio
--    pueda decidir si enviar alertas, sin hacer un SELECT posterior.
--    IMPORTANTE: Se usa RETURNING en la cláusula ON CONFLICT para leer
--    el valor ya actualizado en una sola operación (sin race condition).
CREATE OR REPLACE FUNCTION acumular_costo_diario(
    p_proveedor TEXT,
    p_empresa_slug TEXT,
    p_costo NUMERIC,
    p_tokens_in INT,
    p_tokens_out INT
) RETURNS JSONB AS $$
DECLARE
    v_fecha DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'America/Bogota')::date;
    v_nuevo_global_usd NUMERIC(10, 4);
    v_alerta_70 BOOLEAN;
    v_alerta_100 BOOLEAN;
    v_bloqueado BOOLEAN;
BEGIN
    -- Acumular en registro de la empresa específica
    INSERT INTO taller_ai_uso_diario (
        empresa_slug, proveedor, fecha,
        costo_estimado_usd, tokens_input, tokens_output, requests_count
    )
    VALUES (p_empresa_slug, p_proveedor, v_fecha, p_costo, p_tokens_in, p_tokens_out, 1)
    ON CONFLICT (empresa_slug, fecha, proveedor)
    DO UPDATE SET
        costo_estimado_usd = taller_ai_uso_diario.costo_estimado_usd + p_costo,
        tokens_input       = taller_ai_uso_diario.tokens_input + p_tokens_in,
        tokens_output      = taller_ai_uso_diario.tokens_output + p_tokens_out,
        requests_count     = taller_ai_uso_diario.requests_count + 1;

    -- Acumular en registro global y leer estado post-actualización
    INSERT INTO taller_ai_uso_global (fecha, proveedor, costo_estimado_usd, bloqueado, alerta_70_enviada, alerta_100_enviada)
    VALUES (v_fecha, p_proveedor, p_costo, false, false, false)
    ON CONFLICT (fecha, proveedor)
    DO UPDATE SET
        costo_estimado_usd = taller_ai_uso_global.costo_estimado_usd + p_costo
    RETURNING costo_estimado_usd, alerta_70_enviada, alerta_100_enviada, bloqueado
    INTO v_nuevo_global_usd, v_alerta_70, v_alerta_100, v_bloqueado;

    RETURN jsonb_build_object(
        'fecha',              v_fecha,
        'costo_global_usd',   v_nuevo_global_usd,
        'alerta_70_enviada',  v_alerta_70,
        'alerta_100_enviada', v_alerta_100,
        'bloqueado',          v_bloqueado
    );
END;
$$ LANGUAGE plpgsql;

-- 7. Función para marcar una alerta como enviada (deduplicación)
CREATE OR REPLACE FUNCTION marcar_alerta_enviada(
    p_proveedor TEXT,
    p_nivel TEXT  -- '70' | '100'
) RETURNS VOID AS $$
DECLARE
    v_fecha DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'America/Bogota')::date;
BEGIN
    IF p_nivel = '70' THEN
        UPDATE taller_ai_uso_global
        SET alerta_70_enviada = true
        WHERE fecha = v_fecha AND proveedor = p_proveedor;
    ELSIF p_nivel = '100' THEN
        UPDATE taller_ai_uso_global
        SET alerta_100_enviada = true, bloqueado = true
        WHERE fecha = v_fecha AND proveedor = p_proveedor;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- INSTRUCCIONES DE APLICACIÓN:
-- 1. Ejecutar este script en Supabase SQL Editor.
-- 2. Verificar que las funciones acumular_costo_diario y
--    marcar_alerta_enviada aparecen en Database > Functions.
-- 3. Verificar que las 4 tablas nuevas están en el schema public:
--    taller_ai_uso_diario, taller_ai_uso_global,
--    taller_leads_ia, taller_ai_conversaciones_log
-- 4. El reset diario es AUTOMÁTICO: cada nuevo día genera una
--    nueva fila (INSERT) en taller_ai_uso_diario y taller_ai_uso_global.
--    No se requiere cron para reset.
-- ============================================================
