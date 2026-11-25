import fs from 'fs';
import path from 'path';
import { seguimientoDbSiConfigurada } from '../config/seguimientoDb';

/** backend/migrations: Railway construye solo backend/, así que deben vivir aquí. */
export function resolveMigrationsDir(): string | null {
  const possiblePaths = [
    path.resolve(__dirname, '../../migrations'), // dist/lib o src/lib → backend/migrations
    path.resolve(process.cwd(), 'migrations'),
    path.resolve(process.cwd(), 'backend/migrations')
  ];
  return possiblePaths.find(p => fs.existsSync(p) && fs.statSync(p).isDirectory()) ?? null;
}

export function listarMigraciones(dir: string): string[] {
  return fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
}

/** En Railway (o NODE_ENV=production) una migración faltante bloquea el healthcheck. */
export const esProduccion = Boolean(process.env.RAILWAY_ENVIRONMENT_NAME) || process.env.NODE_ENV === 'production';

export interface EstadoMigraciones {
  ok: boolean;
  pendientes: string[];
  error?: string;
}

/**
 * Compara backend/migrations con taller_schema_migrations.
 * Fuera de producción, sin DATABASE_URL se considera ok (CI, local).
 */
export async function verificarMigraciones(): Promise<EstadoMigraciones> {
  const dir = resolveMigrationsDir();
  if (!dir) return { ok: false, pendientes: [], error: 'No se encontró backend/migrations' };

  const pool = seguimientoDbSiConfigurada();
  if (!pool) {
    return esProduccion
      ? { ok: false, pendientes: [], error: 'DATABASE_URL no está configurada' }
      : { ok: true, pendientes: [] };
  }

  try {
    const { rows } = await pool.query<{ name: string }>('SELECT name FROM taller_schema_migrations');
    const aplicadas = new Set(rows.map(r => r.name));
    const pendientes = listarMigraciones(dir).filter(f => !aplicadas.has(f));
    return { ok: pendientes.length === 0, pendientes };
  } catch (err: any) {
    return { ok: false, pendientes: [], error: err.message };
  }
}
