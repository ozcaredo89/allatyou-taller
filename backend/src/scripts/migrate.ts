import fs from 'fs';
import path from 'path';
import { Client } from 'pg';
import dotenv from 'dotenv';

// Intentar cargar .env desde distintas ubicaciones posibles (local y producción)
const possibleEnvPaths = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), 'backend/.env'),
  path.resolve(__dirname, '../../.env'),
  path.resolve(__dirname, '../../../.env')
];

for (const p of possibleEnvPaths) {
  if (fs.existsSync(p)) {
    dotenv.config({ path: p });
    break;
  }
}

const databaseUrl = process.env.DATABASE_URL;

function resolveMigrationsDir(): string | null {
  const possiblePaths = [
    path.resolve(process.cwd(), 'docs/migrations'),
    path.resolve(process.cwd(), '../docs/migrations'),
    path.resolve(__dirname, '../../../docs/migrations'),
    path.resolve(__dirname, '../../docs/migrations')
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
      return p;
    }
  }
  return null;
}

export async function runMigrations(targetFileArg?: string): Promise<void> {
  if (!databaseUrl) {
    console.warn('⚠️  [db:migrate] DATABASE_URL no está configurada.');
    console.warn('   Si deseas habilitar migraciones automáticas en Railway, agrega DATABASE_URL en sus variables de entorno.');
    return;
  }

  const client = new Client({
    connectionString: databaseUrl,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    console.log('🔌 [db:migrate] Conectando a Postgres para verificar migraciones...');
    await client.connect();

    // Tabla de control de migraciones
    await client.query(`
      CREATE TABLE IF NOT EXISTS taller_schema_migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    const migrationsDir = resolveMigrationsDir();

    if (targetFileArg) {
      const filePath = path.isAbsolute(targetFileArg)
        ? targetFileArg
        : path.resolve(process.cwd(), targetFileArg);

      if (!fs.existsSync(filePath)) {
        throw new Error(`El archivo de migración no existe: ${filePath}`);
      }

      const fileName = path.basename(filePath);
      console.log(`📄 [db:migrate] Aplicando migración específica: ${fileName}...`);
      const sql = fs.readFileSync(filePath, 'utf-8');

      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        `INSERT INTO taller_schema_migrations (name) 
         VALUES ($1) 
         ON CONFLICT (name) DO UPDATE SET executed_at = NOW()`,
        [fileName]
      );
      await client.query('COMMIT');

      console.log(`✨ [db:migrate] ${fileName} aplicada correctamente.`);
    } else {
      if (!migrationsDir) {
        console.warn('⚠️  [db:migrate] No se encontró el directorio docs/migrations/. Saltando.');
        return;
      }

      const { rows } = await client.query('SELECT name FROM taller_schema_migrations');
      const executedNames = new Set(rows.map((r: { name: string }) => r.name));

      const files = fs
        .readdirSync(migrationsDir)
        .filter(f => f.endsWith('.sql'))
        .sort();

      const pending = files.filter(f => !executedNames.has(f));

      if (pending.length === 0) {
        console.log('✅ [db:migrate] Base de datos al día. Sin migraciones pendientes.');
        return;
      }

      console.log(`📋 [db:migrate] ${pending.length} migración(es) pendiente(s) por aplicar:`);
      for (const file of pending) {
        const fullPath = path.join(migrationsDir, file);
        console.log(`   ⏳ Aplicando: ${file}...`);
        const sql = fs.readFileSync(fullPath, 'utf-8');

        await client.query('BEGIN');
        await client.query(sql);
        await client.query(
          'INSERT INTO taller_schema_migrations (name) VALUES ($1)',
          [file]
        );
        await client.query('COMMIT');
        console.log(`   ✅ ${file} aplicada.`);
      }

      console.log('🚀 [db:migrate] Todas las migraciones fueron ejecutadas con éxito.');
    }
  } catch (err: any) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Ignorar error de rollback
    }
    console.error('❌ [db:migrate] Error ejecutando migraciones:', err.message || err);
    throw err;
  } finally {
    await client.end().catch(() => {});
  }
}

// Ejecutar si se llama directamente desde CLI
if (require.main === module) {
  runMigrations(process.argv[2])
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
