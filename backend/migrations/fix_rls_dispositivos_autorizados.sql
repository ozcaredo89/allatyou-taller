-- ==============================================================================
-- MIGRATION FIX: fix_rls_dispositivos_autorizados
-- FECHA: 2026-06-30
-- PROPÓSITO: Corrige las políticas RLS de la tabla taller_dispositivos_autorizados.
--
-- PROBLEMA: La política anterior usaba auth.uid() que es de Supabase Auth nativo.
-- Nuestro backend usa su propio sistema JWT con service_role implícito via ANON_KEY,
-- pero la tabla tiene RLS activado que bloquea los inserts desde el backend Node.js.
--
-- SOLUCIÓN: Desactivar RLS en esta tabla. La seguridad se garantiza en el backend
-- mediante el middleware requireAuth + filtrado por empresa_id en cada query.
-- ==============================================================================

-- 1. Desactivar RLS (la seguridad la maneja el backend Node.js con requireAuth)
ALTER TABLE taller_dispositivos_autorizados DISABLE ROW LEVEL SECURITY;

-- 2. Eliminar las políticas incorrectas que usaban auth.uid()
DROP POLICY IF EXISTS "Permitir lectura a la propia empresa" ON taller_dispositivos_autorizados;

-- 3. (Opcional pero recomendado para Supabase) Otorgar permisos al rol anon
--    que es el que usa nuestro cliente createClient con ANON_KEY
GRANT ALL ON taller_dispositivos_autorizados TO anon;
GRANT ALL ON taller_dispositivos_autorizados TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;
