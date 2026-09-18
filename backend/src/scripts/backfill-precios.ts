import dotenv from 'dotenv';
dotenv.config();

import { supabase } from '../config/supabase';
import { sincronizarPreciosOrdenEntregada } from '../services/catalog.service';

async function runBackfill() {
  console.log('=====================================================');
  console.log('👀 INICIANDO BACKFILL DE LA MATRIZ DE PRECIOS');
  console.log('=====================================================\n');

  // 1. Limpieza idempotente previa
  console.log('1. Limpiando datos previos en tablas de matriz...');
  const { error: errMatriz } = await supabase
    .from('taller_matriz_precios')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');

  const { error: errItems } = await supabase
    .from('taller_precios_items_entregados')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');

  if (errMatriz || errItems) {
    console.warn('⚠️ Nota en limpieza inicial:', errMatriz?.message || errItems?.message);
  } else {
    console.log('   Tablas vaciadas correctamente.');
  }

  // 2. Consultar órdenes históricas entregadas con vehiculo
  console.log('\n2. Consultando órdenes en estado "entregado"...');
  const { data: ordenes, error: errOrdenes } = await supabase
    .from('taller_ingresos')
    .select('id, empresa_id, items_factura, updated_at, fecha_ingreso, taller_vehiculos(marca, linea, modelo_anio, placa)')
    .eq('estado', 'entregado')
    .not('items_factura', 'is', null);

  if (errOrdenes || !ordenes) {
    console.error('❌ Error consultando órdenes:', errOrdenes?.message);
    process.exit(1);
  }

  console.log(`   Se encontraron ${ordenes.length} órdenes entregadas para procesar.\n`);

  // 3. Procesar secuencialmente cada órden
  let exitosas = 0;
  let omitidas = 0;

  for (let i = 0; i < ordenes.length; i++) {
    const orden = ordenes[i];
    const vehiculo = (orden as any).taller_vehiculos;
    const items = orden.items_factura;

    if (!vehiculo?.marca || !vehiculo?.linea || !Array.isArray(items) || items.length === 0) {
      omitidas++;
      continue;
    }

    const fechaReal = orden.updated_at || orden.fecha_ingreso || new Date().toISOString();

    await sincronizarPreciosOrdenEntregada(
      orden.empresa_id,
      orden.id,
      vehiculo,
      items,
      fechaReal
    );
    exitosas++;

    if (exitosas % 25 === 0 || i === ordenes.length - 1) {
      console.log(`   Progreso: ${i + 1}/${ordenes.length} órdenes procesadas (${exitosas} sincronizadas, ${omitidas} omitidas)...`);
    }
  }

  // 4. Verificación final de registros generados
  console.log('\n3. Verificando resultados en base de datos...');
  const { count: totalGranular } = await supabase
    .from('taller_precios_items_entregados')
    .select('*', { count: 'exact', head: true });

  const { count: totalMatriz } = await supabase
    .from('taller_matriz_precios')
    .select('*', { count: 'exact', head: true });

  console.log('\n=====================================================');
  console.log('✅ BACKFILL FINALIZADO EXITOSAMENTE');
  console.log('====================================================');
  console.log(`• Órdenes sincronizadas con éxito: ${exitosas}`);
  console.log(`• Órdenes omitidas (sin vehiculo/ítems): ${omitidas}`);
  console.log(`• Total ítems granulares registrados: ${totalGranular ?? 0}`);
  console.log(`• Total buckets consolidados en la matriz: ${totalMatriz ?? 0}`);
  console.log('====================================================\n');
}

runBackfill().catch(err => {
  console.error('❌ Error fatal en ejecución de backfill:', err);
  process.exit(1);
});
