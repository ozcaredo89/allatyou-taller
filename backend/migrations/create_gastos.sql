-- ============================================================
-- MIGRACIÓN: Módulo de Gastos — Versión Definitiva
-- Estrategia: Crear todas las tablas SIN FKs cruzadas,
-- luego agregar las FKs con ALTER TABLE al final.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. CATEGORÍAS (sin dependencias)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS taller_categorias_gastos (
    id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id  UUID        NOT NULL REFERENCES taller_empresas(id) ON DELETE CASCADE,
    nombre      VARCHAR(100) NOT NULL,
    color       VARCHAR(20)  DEFAULT '#6366f1',
    icono       VARCHAR(50)  DEFAULT 'tag',
    es_default  BOOLEAN      DEFAULT FALSE,
    activa      BOOLEAN      DEFAULT TRUE,
    created_at  TIMESTAMPTZ  DEFAULT NOW(),
    UNIQUE (empresa_id, nombre)
);

CREATE INDEX IF NOT EXISTS idx_cat_gastos_empresa
    ON taller_categorias_gastos(empresa_id);

ALTER TABLE taller_categorias_gastos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cat_gastos_aislamiento" ON taller_categorias_gastos
    FOR ALL USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────
-- 2. PLANTILLAS RECURRENTES (sin FK a taller_gastos)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS taller_gastos_recurrentes (
    id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id      UUID         NOT NULL REFERENCES taller_empresas(id) ON DELETE CASCADE,
    nombre          VARCHAR(255) NOT NULL,
    categoria_id    UUID,        -- FK se agrega luego con ALTER TABLE
    monto_estimado  NUMERIC(14,2) NOT NULL CHECK (monto_estimado > 0),
    frecuencia      VARCHAR(20)  NOT NULL
                    CHECK (frecuencia IN ('diario','semanal','quincenal','mensual','anual')),
    dia_del_mes     SMALLINT     CHECK (dia_del_mes BETWEEN 1 AND 31),
    dia_semana      SMALLINT     CHECK (dia_semana BETWEEN 0 AND 6),
    activa          BOOLEAN      DEFAULT TRUE,
    fecha_inicio    DATE         NOT NULL DEFAULT CURRENT_DATE,
    fecha_fin       DATE,
    ultimo_registro DATE,
    notas           TEXT,
    created_at      TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gastos_rec_empresa
    ON taller_gastos_recurrentes(empresa_id);
CREATE INDEX IF NOT EXISTS idx_gastos_rec_activa
    ON taller_gastos_recurrentes(empresa_id, activa);

ALTER TABLE taller_gastos_recurrentes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gastos_rec_aislamiento" ON taller_gastos_recurrentes
    FOR ALL USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────
-- 3. GASTOS EJECUTADOS (sin FKs cruzadas)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS taller_gastos (
    id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id      UUID         NOT NULL REFERENCES taller_empresas(id) ON DELETE CASCADE,
    fecha           DATE         NOT NULL DEFAULT CURRENT_DATE,
    categoria_id    UUID,        -- FK se agrega luego con ALTER TABLE
    descripcion     TEXT         NOT NULL,
    monto           NUMERIC(14,2) NOT NULL CHECK (monto > 0),
    proveedor       VARCHAR(255),
    comprobante_url TEXT,
    tipo            VARCHAR(20)  DEFAULT 'unico'
                    CHECK (tipo IN ('unico','recurrente')),
    plantilla_id    UUID,        -- FK se agrega luego con ALTER TABLE
    notas           TEXT,
    created_at      TIMESTAMPTZ  DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gastos_empresa
    ON taller_gastos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_gastos_empresa_fecha
    ON taller_gastos(empresa_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_gastos_empresa_categoria
    ON taller_gastos(empresa_id, categoria_id);
CREATE INDEX IF NOT EXISTS idx_gastos_plantilla
    ON taller_gastos(plantilla_id);

ALTER TABLE taller_gastos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gastos_aislamiento" ON taller_gastos
    FOR ALL USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────
-- 4. AGREGAR FKs CRUZADAS (ahora que todas las tablas existen)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE taller_gastos_recurrentes
    ADD CONSTRAINT fk_rec_categoria
    FOREIGN KEY (categoria_id)
    REFERENCES taller_categorias_gastos(id)
    ON DELETE SET NULL;

ALTER TABLE taller_gastos
    ADD CONSTRAINT fk_gastos_categoria
    FOREIGN KEY (categoria_id)
    REFERENCES taller_categorias_gastos(id)
    ON DELETE SET NULL;

ALTER TABLE taller_gastos
    ADD CONSTRAINT fk_gastos_plantilla
    FOREIGN KEY (plantilla_id)
    REFERENCES taller_gastos_recurrentes(id)
    ON DELETE SET NULL;

-- ─────────────────────────────────────────────────────────────
-- 5. FUNCIÓN: Categorías por defecto por empresa
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION inicializar_categorias_gastos(p_empresa_id UUID)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO taller_categorias_gastos
        (empresa_id, nombre, color, icono, es_default)
    VALUES
        (p_empresa_id, 'Nómina',       '#8b5cf6', 'users',           TRUE),
        (p_empresa_id, 'Arriendo',     '#f59e0b', 'home',            TRUE),
        (p_empresa_id, 'Proveedores',  '#3b82f6', 'truck',           TRUE),
        (p_empresa_id, 'Servicios',    '#06b6d4', 'zap',             TRUE),
        (p_empresa_id, 'Herramientas', '#10b981', 'wrench',          TRUE),
        (p_empresa_id, 'Marketing',    '#ec4899', 'megaphone',       TRUE),
        (p_empresa_id, 'Impuestos',    '#ef4444', 'landmark',        TRUE),
        (p_empresa_id, 'Otros',        '#6b7280', 'more-horizontal', TRUE)
    ON CONFLICT (empresa_id, nombre) DO NOTHING;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- 6. INICIALIZAR categorías para tu empresa existente
--    Corre esta línea SEPARADA después del bloque anterior:
-- ─────────────────────────────────────────────────────────────
-- SELECT inicializar_categorias_gastos('PEGA-AQUI-TU-EMPRESA-UUID');
