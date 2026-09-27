-- ============================================================
-- Migration: CRM Retención v2
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- 1. Columnas en taller_empresas
ALTER TABLE taller_empresas
  ADD COLUMN IF NOT EXISTS google_review_url TEXT,
  ADD COLUMN IF NOT EXISTS config_crm_intervalos JSONB DEFAULT '{
    "aceite": { "meses": 6, "km": 5000 },
    "frenos": { "meses": 12, "km": 20000 },
    "aire": { "meses": 12, "km": 10000 },
    "general": { "meses": 6, "km": 10000 }
  }'::jsonb;

-- 2. Columnas en taller_clientes
ALTER TABLE taller_clientes
  ADD COLUMN IF NOT EXISTS acepta_whatsapp BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS ultima_resena_solicitada_at TIMESTAMPTZ;

-- 3. Columnas en taller_ingresos
ALTER TABLE taller_ingresos
  ADD COLUMN IF NOT EXISTS resena_estado VARCHAR(20) DEFAULT 'pendiente'
    CHECK (resena_estado IN ('pendiente', 'intentado', 'confirmado')),
  ADD COLUMN IF NOT EXISTS resena_solicitada_at TIMESTAMPTZ;

-- 4. Vista en tiempo real (reemplaza la vista anterior)
DROP VIEW IF EXISTS taller_mv_proximos_mantenimientos CASCADE;


CREATE OR REPLACE VIEW taller_mv_proximos_mantenimientos AS
WITH vehiculos_activos AS (
  -- Excluir vehículos que ya tienen una orden activa en el taller
  SELECT DISTINCT vehiculo_id
  FROM taller_ingresos
  WHERE estado IN ('recepcion', 'diagnostico', 'cotizacion', 'esperando_aprobacion', 'en_reparacion')
),
servicios_crm AS (
  SELECT
    v.id AS vehiculo_id,
    v.placa,
    v.marca,
    v.linea,
    v.cliente_id,
    c.nombre_completo AS cliente_nombre,
    c.telefono AS cliente_telefono,
    c.acepta_whatsapp,
    i.id AS ingreso_id,
    i.fecha_ingreso,
    COALESCE(
      NULLIF(regexp_replace(i.kilometraje::text, '[^0-9]', '', 'g'), '')::numeric,
      0
    ) AS kilometraje,
    COALESCE(
      NULLIF(item->>'categoria_crm', ''),
      CASE
        WHEN lower(item->>'descripcion') ~ '(aceite|lubricante|cambio de aceite|filtro de aceite)' THEN 'aceite'
        WHEN lower(item->>'descripcion') ~ '(freno|pastilla|disco|liquido de frenos|liq. frenos)' THEN 'frenos'
        WHEN lower(item->>'descripcion') ~ '(aire acondicionado|filtro de cabina|a/c|aire|ac )' THEN 'aire'
        ELSE 'general'
      END
    ) AS categoria,
    i.empresa_id
  FROM taller_ingresos i
  JOIN taller_vehiculos v ON v.id = i.vehiculo_id
  LEFT JOIN taller_clientes c ON c.id = v.cliente_id
  CROSS JOIN jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(i.items_factura) = 'array' THEN i.items_factura
      ELSE '[]'::jsonb
    END
  ) AS item
  WHERE i.estado = 'entregado'
    AND c.acepta_whatsapp = true
    AND v.id NOT IN (SELECT vehiculo_id FROM vehiculos_activos)
),
ultimos_servicios AS (
  SELECT
    empresa_id,
    vehiculo_id,
    placa,
    marca,
    linea,
    cliente_id,
    cliente_nombre,
    cliente_telefono,
    acepta_whatsapp,
    categoria,
    MAX(fecha_ingreso) AS ultima_fecha,
    MAX(kilometraje) AS ultimo_kilometraje
  FROM servicios_crm
  GROUP BY empresa_id, vehiculo_id, placa, marca, linea, cliente_id, cliente_nombre, cliente_telefono, acepta_whatsapp, categoria
)
SELECT
  empresa_id,
  vehiculo_id,
  placa,
  marca,
  linea,
  cliente_id,
  cliente_nombre,
  cliente_telefono,
  acepta_whatsapp,
  categoria,
  ultima_fecha,
  ultimo_kilometraje,
  CASE categoria
    WHEN 'aceite' THEN ultima_fecha + INTERVAL '6 months'
    WHEN 'frenos' THEN ultima_fecha + INTERVAL '12 months'
    WHEN 'aire'   THEN ultima_fecha + INTERVAL '12 months'
    ELSE ultima_fecha + INTERVAL '6 months'
  END AS fecha_sugerida,
  CASE categoria
    WHEN 'aceite' THEN ultimo_kilometraje + 5000
    WHEN 'frenos' THEN ultimo_kilometraje + 20000
    ELSE ultimo_kilometraje + 10000
  END AS kilometraje_sugerido
FROM ultimos_servicios;

GRANT SELECT ON taller_mv_proximos_mantenimientos TO anon, authenticated, service_role;

-- 5. Vista para reseñas (órdenes entregadas con control por cliente, pendientes de reseña)
-- Se consulta desde el backend directamente, no necesita vista SQL.
