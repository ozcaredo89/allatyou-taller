import { Pool } from 'pg';

const pool = process.env.DATABASE_URL ? new Pool({
  connectionString: process.env.DATABASE_URL,
  // Misma política TLS que el ejecutor de migraciones.
  ssl: { rejectUnauthorized: false },
  max: 3,
  connectionTimeoutMillis: 5000
}) : undefined;

pool?.on('error', error => console.error('[seguimiento-cliente]', error.message));

export function seguimientoDb() {
  if (!pool) throw new Error('DATABASE_URL no está configurada.');
  return pool;
}
