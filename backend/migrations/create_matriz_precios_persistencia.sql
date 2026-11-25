-- ==============================================================================
-- MIGRATION: create_matriz_precios_persistencia
-- FECHA: 2026-09-17
-- PROPÓSITO: Tablas y RPC para persistencia incremental de la Matriz de Precios
-- ==============================================================================

-- 1. Tabla granular de ítems entregados (base para auditoría y recálculo)
CREATE TABLE IF NOT EXISTS taller_precios_items_entregados (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES taller_empresas(id) ON DELETE CASCADE,
  ingreso_id UUID NOT NULL REFERENCES taller_ingresos(id) ON DELETE CASCADE,
  marca VARCHAR(100) NOT NULL,
  linea VARCHAR(100) NOT NULL,
  modelo_anio INTEGER,
  placa_enmascarada VARCHAR(20),
  tipo VARCHAR(20) NOT NULL, -- 'repuesto' | 'mano_obra'
  item_key VARCHAR(200) NOT NULL, -- 'repuesto::pastillas de freno delanteras'
  nombre_servicio VARCHAR(200) NOT NULL,
  categoria VARCHAR(100) NOT NULL,
  precio_unitario NUMERIC(12, 2) NOT NULL,
  fecha_entrega TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice optimizado para index-only scan en la ventana de 15 muestras recientes
CREATE INDEX IF NOT EXISTS idx_precios_items_lookup_fecha
  ON taller_precios_items_entregados (empresa_id, marca, linea, item_key, fecha_entrega DESC);

CREATE INDEX IF NOT EXISTS idx_precios_items_ingreso
  ON taller_precios_items_entregados (ingreso_id);

-- 2. Tabla de matriz precomputada (lectura instantánea < 2ms para la landing)
CREATE TABLE IF NOT EXISTS taller_matriz_precios (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES taller_empresas(id) ON DELETE CASCADE,
  marca VARCHAR(100) NOT NULL,
  linea VARCHAR(100) NOT NULL,
  tipo VARCHAR(20) NOT NULL,
  item_key VARCHAR(200) NOT NULL,
  nombre_servicio VARCHAR(200) NOT NULL,
  categoria VARCHAR(100) NOT NULL,
  precio_min NUMERIC(12, 2) NOT NULL,
  precio_max NUMERIC(12, 2) NOT NULL,
  precio_promedio NUMERIC(12, 2) NOT NULL,
  ocurrencias INTEGER NOT NULL DEFAULT 1,
  total_historico INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(empresa_id, marca, linea, item_key)
);

CREATE INDEX IF NOT EXISTS idx_matriz_vehiculo
  ON taller_matriz_precios (empresa_id, marca, linea);

CREATE INDEX IF NOT EXISTS idx_matriz_ocurrencias
  ON taller_matriz_precios (empresa_id, ocurrencias);

-- Desactivar RLS (el backend Node.js usa ANON_KEY con aislamiento por empresa_id a nivel de aplicación)
ALTER TABLE taller_precios_items_entregados DISABLE ROW LEVEL SECURITY;
ALTER TABLE taller_matriz_precios DISABLE ROW LEVEL SECURITY;

GRANT ALL ON taller_precios_items_entregados TO anon, authenticated;
GRANT ALL ON taller_matriz_precios TO anon, authenticated;

-- 3. Función RPC atómica para recalcular un bucket específico en la matriz
CREATE OR REPLACE FUNCTION recalcular_bucket_matriz(
  p_empresa_id UUID,
  p_marca VARCHAR,
  p_linea VARCHAR,
  p_item_key VARCHAR
) RETURNS VOID AS $$
DECLARE
  v_total INTEGER;
BEGIN
  -- 1. Total histórico acumulado
  SELECT COUNT(*)::INTEGER INTO v_total
  FROM taller_precios_items_entregados
  WHERE empresa_id = p_empresa_id
    AND marca = p_marca
    AND linea = p_linea
    AND item_key = p_item_key;

  -- 2. Si no quedan filas (orden cancelada o ítems desasociados), limpiar de matriz
  IF v_total = 0 THEN
    DELETE FROM taller_matriz_precios
    WHERE empresa_id = p_empresa_id
      AND marca = p_marca
      AND linea = p_linea
      AND item_key = p_item_key;
    RETURN;
  END IF;

  -- 3. Calcular agregaciones sobre la ventana fija de las últimas 15 muestras
  WITH ultimas_muestras AS (
    SELECT precio_unitario, nombre_servicio, categoria, tipo, fecha_entrega
    FROM taller_precios_items_entregados
    WHERE empresa_id = p_empresa_id
      AND marca = p_marca
      AND linea = p_linea
      AND item_key = p_item_key
    ORDER BY fecha_entrega DESC
    LIMIT 15
  ),
  stats AS (
    SELECT
      MIN(precio_unitario) AS precio_min,
      MAX(precio_unitario) AS precio_max,
      ROUND(AVG(precio_unitario)) AS precio_promedio,
      COUNT(*)::INTEGER AS ocurrencias
    FROM ultimas_muestras
  ),
  metadata_reciente AS (
    SELECT nombre_servicio, categoria, tipo
    FROM ultimas_muestras
    ORDER BY fecha_entrega DESC
    LIMIT 1
  )
  INSERT INTO taller_matriz_precios (
    empresa_id, marca, linea, tipo, item_key,
    nombre_servicio, categoria, precio_min, precio_max,
    precio_promedio, ocurrencias, total_historico, updated_at
  )
  SELECT
    p_empresa_id, p_marca, p_linea, m.tipo, p_item_key,
    m.nombre_servicio, m.categoria, s.precio_min, s.precio_max,
    s.precio_promedio, s.ocurrencias, v_total, NOW()
  FROM stats s
  CROSS JOIN metadata_reciente m
  ON CONFLICT (empresa_id, marca, linea, item_key) DO UPDATE SET
    tipo = EXCLUDED.tipo,
    nombre_servicio = EXCLUDED.nombre_servicio,
    categoria = EXCLUDED.categoria,
    precio_min = EXCLUDED.precio_min,
    precio_max = EXCLUDED.precio_max,
    precio_promedio = EXCLUDED.precio_promedio,
    ocurrencias = EXCLUDED.ocurrencias,
    total_historico = EXCLUDED.total_historico,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;
