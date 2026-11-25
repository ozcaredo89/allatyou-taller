-- ============================================================
-- Migration: CRM de Retención (Materialized View)
-- Ejecutar en el SQL Editor de Supabase Dashboard
-- ============================================================

-- 1. Crear la Vista Materializada
CREATE MATERIALIZED VIEW taller_mv_proximos_mantenimientos AS
WITH servicios_crm AS (
  -- Extraemos cada ítem facturado y lo cruzamos con el vehículo y cliente
  SELECT
    v.id AS vehiculo_id,
    v.placa,
    v.marca,
    v.linea,
    v.cliente_id,
    c.nombre_completo AS cliente_nombre,
    c.telefono AS cliente_telefono,
    i.id AS ingreso_id,
    i.fecha_ingreso,
    CAST(i.kilometraje AS NUMERIC) AS kilometraje, -- asegurar tipo numérico
    item->>'categoria_crm' AS categoria,
    i.empresa_id
  FROM taller_ingresos i
  JOIN taller_vehiculos v ON v.id = i.vehiculo_id
  LEFT JOIN taller_clientes c ON c.id = v.cliente_id
  -- jsonb_array_elements expande el array a filas individuales para facilitar la consulta
  CROSS JOIN jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(i.items_factura) = 'array' THEN i.items_factura
      ELSE '[]'::jsonb
    END
  ) AS item
  WHERE i.estado = 'entregado'
    AND item->>'categoria_crm' IS NOT NULL
),
ultimos_servicios AS (
  -- Nos quedamos solo con el MÁS RECIENTE por vehículo y categoría
  SELECT
    empresa_id,
    vehiculo_id,
    placa,
    marca,
    linea,
    cliente_id,
    cliente_nombre,
    cliente_telefono,
    categoria,
    MAX(fecha_ingreso) AS ultima_fecha,
    MAX(kilometraje) AS ultimo_kilometraje
  FROM servicios_crm
  GROUP BY empresa_id, vehiculo_id, placa, marca, linea, cliente_id, cliente_nombre, cliente_telefono, categoria
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
  categoria,
  ultima_fecha,
  ultimo_kilometraje,
  -- Cálculo de Fecha Sugerida
  CASE categoria
    WHEN 'aceite' THEN ultima_fecha + INTERVAL '6 months'
    WHEN 'frenos' THEN ultima_fecha + INTERVAL '12 months'
    WHEN 'aire'   THEN ultima_fecha + INTERVAL '12 months'
    ELSE ultima_fecha + INTERVAL '6 months'
  END AS fecha_sugerida,

  -- Cálculo de Kilometraje Sugerido
  CASE categoria
    WHEN 'aceite' THEN ultimo_kilometraje + 5000
    WHEN 'frenos' THEN ultimo_kilometraje + 20000
    ELSE ultimo_kilometraje + 10000
  END AS kilometraje_sugerido

FROM ultimos_servicios;

-- 2. Crear Índice Único para poder hacer REFRESH MATERIALIZED VIEW CONCURRENTLY (Opcional pero recomendado)
CREATE UNIQUE INDEX idx_taller_mv_proximos_mantenimientos_veh_cat
ON taller_mv_proximos_mantenimientos(vehiculo_id, categoria);

-- 3. Configurar pg_cron para actualizar a las 3:00 AM (Solo funciona si tienes pg_cron habilitado)
-- Si recibes error en esta línea, puedes ignorarla y actualizar mediante Edge Functions o manualmente
/*
SELECT cron.schedule(
  'refresh-crm-view',
  '0 3 * * *',
  $$ REFRESH MATERIALIZED VIEW CONCURRENTLY taller_mv_proximos_mantenimientos $$
);
*/

-- 4. Asignar Permisos (Ajustar a la política de seguridad RLS deseada)
GRANT SELECT ON taller_mv_proximos_mantenimientos TO authenticated;
GRANT SELECT ON taller_mv_proximos_mantenimientos TO service_role;
