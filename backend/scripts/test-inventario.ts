import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { Client } from 'pg';
import type { Request, Response } from 'express';

async function main() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('Define TEST_DATABASE_URL para un PostgreSQL desechable.');
  const destino = new URL(url);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(destino.hostname) ||
      !/^\/[a-z0-9_]+_test$/.test(destino.pathname)) {
    throw new Error('TEST_DATABASE_URL debe apuntar a localhost y a una base con sufijo _test.');
  }

  const db = new Client({ connectionString: url });
  await db.connect();
  try {
    await db.query('BEGIN');
    const { rows: [estado] } = await db.query(
      "SELECT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'taller_%') AS ocupada"
    );
    if (estado.ocupada) throw new Error('Usa una base desechable vacía.');
    // El esquema inicial de Supabase no está versionado por completo.
    await db.query(`
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE TABLE auth.users (id uuid PRIMARY KEY);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
      DO $$ BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
      END $$;
      CREATE TABLE taller_empresas (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug text, nombre text);
      CREATE TABLE taller_empresas_correos (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid, email text);
      CREATE TABLE taller_tecnicos (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid, nombre text);
      CREATE TABLE taller_clientes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid, nombre_completo text, telefono text);
      CREATE TABLE taller_vehiculos (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid, cliente_id uuid, placa text, marca text, linea text);
      CREATE TABLE taller_ingresos (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid, vehiculo_id uuid, estado text,
        items_factura jsonb, diagnostico_mecanico jsonb, motivo_visita text, motivo_cancelacion text,
        kilometraje int, nivel_gasolina text, resena_estado text, estado_desde timestamptz,
        fecha_ingreso timestamptz DEFAULT now(), updated_at timestamptz
      );
    `);
    const dir = path.join(__dirname, '../migrations');
    // Las dos creaciones históricas preceden a sus ALTER y FK. Railway las tiene en el baseline.
    const primero = ['create_bitacora.sql', 'create_gastos.sql'];
    const archivos = (await readdir(dir)).filter(f => f.endsWith('.sql')).sort();
    for (const archivo of [...primero, ...archivos.filter(f => !primero.includes(f))]) {
      try {
        // El baseline reemplazó la vista materializada antes de instalar CRM v2.
        if (archivo === 'crm_retention_v2.sql') await db.query('DROP MATERIALIZED VIEW IF EXISTS taller_mv_proximos_mantenimientos');
        await db.query(await readFile(path.join(dir, archivo), 'utf8'));
      } catch (error) {
        throw new Error(`Falló ${archivo}: ${(error as Error).message}`);
      }
    }

    process.env.DATABASE_URL = url;
    const { seguimientoDb } = await import('../src/config/seguimientoDb');
    const pool = seguimientoDb();
    // Ejecutar el código de producción en la misma sesión y transacción del fixture.
    pool.query = db.query.bind(db) as typeof pool.query;
    const { sugerirAceite, resumirAceites } = await import('../src/services/aceites.service');
    const { guardarItem } = await import('../src/controllers/inventario.controller');
    const uno = async (sql: string, valores: unknown[] = []) => (await db.query(sql, valores)).rows[0];
    const { id: empresa } = await uno('INSERT INTO taller_empresas DEFAULT VALUES RETURNING id');
    const { id: otra } = await uno('INSERT INTO taller_empresas DEFAULT VALUES RETURNING id');
    const { id: vehiculo } = await uno('INSERT INTO taller_vehiculos (empresa_id) VALUES ($1) RETURNING id', [empresa]);
    const crear = async (codigo: string, viscosidad = '5W-30') => (await uno(
      `INSERT INTO taller_inventario_items (empresa_id,codigo,nombre,unidad,es_granel,capacidad_envase,tipo_producto,viscosidad)
       VALUES($1,$2,$2,'litro',true,208.198,'aceite',$3) RETURNING id`, [empresa,codigo,viscosidad])).id;
    const item = await crear('Caneca');
    const pendiente = await crear('Pendiente', '20W-50');
    const abierto = await crear('Abierto', '80W-90');
    const mov = (producto: string, tipo: string, datos: object) => uno(
      'SELECT * FROM registrar_movimiento_inventario($1,$2,$3,$4,$5)',
      [empresa,producto,tipo,JSON.stringify(datos),'pruebas@example.com']
    );
    const stock = async (producto: string) => Number((await uno('SELECT stock_actual FROM taller_inventario_items WHERE empresa_id=$1 AND id=$2',[empresa,producto])).stock_actual);
    const orden = async (producto: string) => (await uno(
      "INSERT INTO taller_ingresos (empresa_id,vehiculo_id,estado,items_factura) VALUES ($1,$2,'en_reparacion',$3) RETURNING id",
      [empresa,vehiculo,JSON.stringify([{id:'aceite',tipo:'repuesto',inventario_item_id:producto,cantidad:3.785,
        unidad_captura:'cuarto',cantidad_captura:4,precio_unitario:26000,total:98420.72}])]
    )).id;
    const entregar = (id: string, previo = 'en_reparacion') => uno(
      "SELECT actualizar_orden_inventario_operativo($1,$2,'{\"estado\":\"entregado\"}',$3,$4,NULL) AS faltantes",
      [empresa,id,'pruebas@example.com',previo]);
    const medir = (producto: string, medido: number, saldo: number, porDescontar: number, usado: number) =>
      mov(producto,'AJUSTE',{stock_medido:medido,stock_esperado:saldo,por_descontar_esperado:porDescontar,litros_despachados_sin_descontar:usado});

    const compra = await mov(item,'ENTRADA',{presentacion:'tambor',cantidad_presentacion:1,costo_presentacion:2081980,registrar_gasto:true});
    assert.equal(await stock(item),208.198);
    assert.equal(Math.round(await stock(item)/0.946353),220);
    assert.equal(Number(compra.costo_unitario),10000);
    assert.equal(Number((await uno('SELECT monto FROM taller_gastos WHERE empresa_id=$1 AND id=$2',[empresa,compra.gasto_id])).monto),2081980);

    const entregada = await orden(item);
    assert.deepEqual((await entregar(entregada)).faltantes,[]);
    assert.equal(await stock(item),204.413);

    const sinStock = await orden(pendiente);
    assert.deepEqual((await entregar(sinStock)).faltantes,['Pendiente']);
    await db.query('SAVEPOINT compra_pendiente');
    await assert.rejects(medir(pendiente,0,0,3.785,0),{code:'22023'});
    await db.query('ROLLBACK TO SAVEPOINT compra_pendiente');
    assert.equal(Number((await medir(pendiente,0,0,3.785,3.785)).cantidad),3.785);
    assert.deepEqual((await entregar(sinStock,'entregado')).faltantes,[]);
    assert.equal(await stock(pendiente),0);

    await mov(abierto,'ENTRADA',{cantidad:10,costo_unitario:10});
    await orden(abierto);
    assert.equal(Number((await medir(abierto,5.215,10,3.785,3.785)).cantidad),-1);

    const { id: galon } = await uno("INSERT INTO taller_inventario_items(empresa_id,codigo,nombre,unidad) VALUES($1,'GAL','Galón','galón') RETURNING id",[empresa]);
    await mov(galon,'ENTRADA',{cantidad:10,costo_unitario:10});
    let status = 200;
    const res = { status(code: number) { status=code; return this; }, json() {} } as unknown as Response;
    await guardarItem({ empresa_id:empresa, params:{id:galon}, body:{codigo:'GAL',nombre:'Galón',unidad:'litro',
      es_granel:true,capacidad_envase:208.198,tipo_producto:'aceite',precio_venta:100,stock_minimo:0} } as unknown as Request,res);
    assert.equal(status,409);
    assert.equal(await stock(galon),10);

    const nueva = await orden(item);
    await entregar(nueva);
    await db.query("UPDATE taller_ingresos_bitacora SET created_at='2026-10-12T16:00:00Z' WHERE empresa_id=$1 AND tipo_evento='entrega'",[empresa]);
    await db.query("UPDATE taller_ingresos_bitacora SET created_at='2026-11-26T16:00:00Z' WHERE empresa_id=$1 AND ingreso_id=$2 AND tipo_evento='entrega'",[empresa,nueva]);
    const sugerencia = await sugerirAceite(empresa,vehiculo);
    assert.equal(sugerencia.fecha,'2026-11-26');
    assert.equal(Number(sugerencia.cantidad_captura),4);
    assert.equal(sugerencia.producto.id,item);
    assert.equal(await sugerirAceite(otra,vehiculo),null);
    await db.query('UPDATE taller_inventario_items SET activo=false WHERE empresa_id=$1 AND id=$2',[empresa,item]);
    const sustituto = await crear('Alternativa');
    await mov(sustituto,'ENTRADA',{cantidad:10,costo_unitario:10});
    assert.equal((await sugerirAceite(empresa,vehiculo)).producto.id,sustituto);
    const resumen = await resumirAceites(empresa,'2026-11-26','2026-11-26');
    assert.equal(resumen.viscosidades.find((v: { viscosidad:string }) => v.viscosidad==='5W-30').ordenes,4);
    assert.equal(resumen.ordenes_con_costo,1);
    await pool.end();
    console.log(`Inventario verificado sobre ${archivos.length} migraciones.`);
  } finally {
    await db.query('ROLLBACK').catch(() => {});
    await db.end();
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
