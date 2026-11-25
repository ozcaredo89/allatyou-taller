-- ============================================================
-- MIGRACIÓN: Vinculación de Gastos con Órdenes e Ítems de Repuesto (Plan v3)
-- ============================================================

-- 1. Categoría 'Repuestos' para empresas que no la tengan (idempotente)
INSERT INTO taller_categorias_gastos (empresa_id, nombre, color, icono, es_default)
SELECT e.id, 'Repuestos', '#3b82f6', 'package', TRUE
FROM taller_empresas e
WHERE NOT EXISTS (
  SELECT 1 FROM taller_categorias_gastos c
  WHERE c.empresa_id = e.id AND LOWER(c.nombre) = 'repuestos'
);

-- 2. Actualizar función de inicialización para nuevos talleres
CREATE OR REPLACE FUNCTION inicializar_categorias_gastos(p_empresa_id UUID)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO taller_categorias_gastos
        (empresa_id, nombre, color, icono, es_default)
    VALUES
        (p_empresa_id, 'Nómina',       '#8b5cf6', 'users',           TRUE),
        (p_empresa_id, 'Arriendo',     '#f59e0b', 'home',            TRUE),
        (p_empresa_id, 'Repuestos',    '#3b82f6', 'package',         TRUE),
        (p_empresa_id, 'Proveedores',  '#64748b', 'truck',           TRUE),
        (p_empresa_id, 'Servicios',    '#06b6d4', 'zap',             TRUE),
        (p_empresa_id, 'Herramientas', '#10b981', 'wrench',          TRUE),
        (p_empresa_id, 'Marketing',    '#ec4899', 'megaphone',       TRUE),
        (p_empresa_id, 'Impuestos',    '#ef4444', 'landmark',        TRUE),
        (p_empresa_id, 'Otros',        '#6b7280', 'more-horizontal', TRUE)
    ON CONFLICT (empresa_id, nombre) DO NOTHING;
END;
$$;

-- 3. Vínculo: orden + ítem específico (ambos opcionales)
ALTER TABLE taller_gastos
  ADD COLUMN IF NOT EXISTS ingreso_id UUID REFERENCES taller_ingresos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS item_id    TEXT;

-- 4. Consultas por tenant + orden
CREATE INDEX IF NOT EXISTS idx_gastos_empresa_ingreso
  ON taller_gastos(empresa_id, ingreso_id);
