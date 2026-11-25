CREATE TABLE IF NOT EXISTS taller_ai_escaneos_diarios (
  empresa_id UUID REFERENCES taller_empresas(id) ON DELETE CASCADE,
  fecha DATE NOT NULL DEFAULT ((CURRENT_TIMESTAMP AT TIME ZONE 'America/Bogota')::date),
  scans_count INT NOT NULL DEFAULT 0,
  costo_usd NUMERIC(10, 6) NOT NULL DEFAULT 0,
  PRIMARY KEY (empresa_id, fecha)
);

CREATE TABLE IF NOT EXISTS taller_ai_escaneos_global (
  fecha DATE PRIMARY KEY DEFAULT ((CURRENT_TIMESTAMP AT TIME ZONE 'America/Bogota')::date),
  scans_count INT NOT NULL DEFAULT 0,
  costo_usd NUMERIC(10, 6) NOT NULL DEFAULT 0
);

-- Reserva atomica de cupo por taller (max 30)
CREATE OR REPLACE FUNCTION reservar_escaneo(
  p_empresa_id UUID,
  p_limite INT DEFAULT 30
) RETURNS BOOLEAN LANGUAGE plpgsql
SET search_path = public, pg_temp AS $$
DECLARE
  v_fecha DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'America/Bogota')::date;
  v_count INT;
BEGIN
  INSERT INTO taller_ai_escaneos_diarios (empresa_id, fecha, scans_count, costo_usd)
  VALUES (p_empresa_id, v_fecha, 1, 0)
  ON CONFLICT (empresa_id, fecha)
  DO UPDATE SET scans_count = taller_ai_escaneos_diarios.scans_count + 1
  WHERE taller_ai_escaneos_diarios.scans_count < p_limite
  RETURNING scans_count INTO v_count;

  RETURN FOUND;
END;
$$;

-- Acumulacion de costo de escaneo (aislado del chatbot)
CREATE OR REPLACE FUNCTION acumular_costo_escaneo(
  p_empresa_id UUID,
  p_costo NUMERIC
) RETURNS void LANGUAGE plpgsql
SET search_path = public, pg_temp AS $$
DECLARE
  v_fecha DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'America/Bogota')::date;
BEGIN
  -- Acumular en registro diario del taller
  UPDATE taller_ai_escaneos_diarios
  SET costo_usd = costo_usd + p_costo
  WHERE empresa_id = p_empresa_id AND fecha = v_fecha;

  -- Acumular en registro global del escaner
  INSERT INTO taller_ai_escaneos_global (fecha, scans_count, costo_usd)
  VALUES (v_fecha, 1, p_costo)
  ON CONFLICT (fecha)
  DO UPDATE SET
    scans_count = taller_ai_escaneos_global.scans_count + 1,
    costo_usd = taller_ai_escaneos_global.costo_usd + p_costo;
END;
$$;