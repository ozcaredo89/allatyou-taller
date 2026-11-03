/**
 * gastosProrrateo.test.ts
 * Tests unitarios exhaustivos para el motor de clasificación y prorrateo de gastos.
 * Ejecutar con: npx.cmd ts-node src/utils/gastosProrrateo.test.ts
 */

import {
  clasificarGastoProrrateo,
  calcularGastosPeriodoConProrrateo,
  listarDiasEnRango,
  obtenerVentanaConsultaGastos,
  GastoRaw,
} from './gastosProrrateo';

let passed = 0;
let failed = 0;

function assertEqual<T>(description: string, actual: T, expected: T): void {
  if (actual === expected) {
    console.log(`  ✅ ${description}`);
    passed++;
  } else {
    console.error(`  ❌ ${description}`);
    console.error(`     Expected: ${JSON.stringify(expected)}`);
    console.error(`     Actual:   ${JSON.stringify(actual)}`);
    failed++;
  }
}

console.log('\n📊 Suite 1: Clasificación de Gastos (Fijos vs Directos y Categorías Personalizadas)\n');

assertEqual(
  'Arriendo sin orden vinculada → Fijo mensual (30 días)',
  clasificarGastoProrrateo({
    id: '1',
    fecha: '2026-10-05',
    descripcion: 'Arriendo bodega taller',
    monto: 3000000,
    taller_categorias_gastos: { id: 'c1', nombre: 'Arriendo', color: '#f59e0b' },
  }).esFijo,
  true
);

assertEqual(
  'Repuesto vinculado a un vehículo (ingreso_id) → Directo (no fijo)',
  clasificarGastoProrrateo({
    id: '2',
    fecha: '2026-10-29',
    descripcion: 'Pastillas de freno',
    monto: 250000,
    ingreso_id: 'orden-123',
    taller_categorias_gastos: { id: 'c2', nombre: 'Proveedores', color: '#3b82f6' },
  }).esFijo,
  false
);

assertEqual(
  'Liquidación de comisiones de técnicos en categoría Nómina → Directo (no fijo)',
  clasificarGastoProrrateo({
    id: '3',
    fecha: '2026-10-30',
    descripcion: 'Liquidación comisiones - Carlos (5 servicios)',
    monto: 450000,
    taller_categorias_gastos: { id: 'c3', nombre: 'Nómina', color: '#8b5cf6' },
  }).esFijo,
  false
);

assertEqual(
  'Categoría personalizada "Gastos varios" → Directo (no fijo, "gas" no hace falso positivo)',
  clasificarGastoProrrateo({
    id: '4',
    fecha: '2026-10-20',
    descripcion: 'Compra cafetería',
    monto: 40000,
    taller_categorias_gastos: { id: 'c-var', nombre: 'Gastos varios', color: '#6b7280' },
  }).esFijo,
  false
);

assertEqual(
  'Categoría personalizada "Gasolina" → Directo (no fijo, "gas" no hace falso positivo)',
  clasificarGastoProrrateo({
    id: '5',
    fecha: '2026-10-20',
    descripcion: 'Tanqueo grúa',
    monto: 120000,
    taller_categorias_gastos: { id: 'c-gas', nombre: 'Gasolina', color: '#ef4444' },
  }).esFijo,
  false
);

assertEqual(
  'Categoría personalizada "Lavado y aseo de vehículos" → Directo (no fijo)',
  clasificarGastoProrrateo({
    id: '6',
    fecha: '2026-10-20',
    descripcion: 'Lavado exterior',
    monto: 35000,
    taller_categorias_gastos: { id: 'c-lav', nombre: 'Lavado y aseo de vehículos', color: '#06b6d4' },
  }).esFijo,
  false
);

assertEqual(
  'Gasto único de "Marketing / Publicidad" sin plantilla → Directo (no fijo)',
  clasificarGastoProrrateo({
    id: '7',
    fecha: '2026-10-20',
    descripcion: 'Campaña pauta digital Octubre',
    monto: 3000000,
    taller_categorias_gastos: { id: 'c-mkt', nombre: 'Marketing y Publicidad', color: '#ec4899' },
  }).esFijo,
  false
);

assertEqual(
  'Gasto de "Marketing" con plantilla recurrente → Fijo (prorrateado según su ciclo)',
  clasificarGastoProrrateo({
    id: '8',
    fecha: '2026-10-01',
    descripcion: 'Agencia de Marketing Mensual',
    monto: 1500000,
    tipo: 'recurrente',
    plantilla_id: 'tpl-mkt-1',
    taller_gastos_recurrentes: { id: 'tpl-mkt-1', nombre: 'Agencia Marketing', frecuencia: 'mensual' },
    taller_categorias_gastos: { id: 'c-mkt', nombre: 'Marketing y Publicidad', color: '#ec4899' },
  }).esFijo,
  true
);

console.log('\n📊 Suite 2: Casos Críticos 1 a 5 de Deduplicación y Ciclos\n');

// CASO 1: Plantilla semanal de $100k (5 pagos en los últimos 30 días), vista de 7 días -> Esperado: $100k
const pagosSemanales: GastoRaw[] = [
  '2026-10-02',
  '2026-10-09',
  '2026-10-16',
  '2026-10-23',
  '2026-10-30',
].map((fecha, idx) => ({
  id: `sem-${idx}`,
  fecha,
  descripcion: 'Vigilancia semanal',
  monto: 100000,
  tipo: 'recurrente',
  plantilla_id: 'tpl-semanal-1',
  taller_gastos_recurrentes: { id: 'tpl-semanal-1', nombre: 'Vigilancia semanal', frecuencia: 'semanal' },
  taller_categorias_gastos: { id: 'cat-serv', nombre: 'Servicios', color: '#06b6d4' },
}));

const resCaso1 = calcularGastosPeriodoConProrrateo(pagosSemanales, '2026-10-27', '2026-11-02');
assertEqual(
  'Caso 1: Plantilla semanal de $100k (con 5 pagos en el mes) en vista de 7 días = $100.000 (no $500k)',
  resCaso1.totalGastos,
  100000
);

// CASO 2: Arriendo de $3M pagado el 5 oct y el 1 nov, vista de un día (2 nov) -> Esperado: $100k
const pagosArriendoOctNov: GastoRaw[] = [
  {
    id: 'arr-oct',
    fecha: '2026-10-05',
    descripcion: 'Arriendo bodega',
    monto: 3000000,
    taller_categorias_gastos: { id: 'cat-arr', nombre: 'Arriendo', color: '#f59e0b' },
  },
  {
    id: 'arr-nov',
    fecha: '2026-11-01',
    descripcion: 'Arriendo bodega',
    monto: 3000000,
    taller_categorias_gastos: { id: 'cat-arr', nombre: 'Arriendo', color: '#f59e0b' },
  },
];

const resCaso2 = calcularGastosPeriodoConProrrateo(pagosArriendoOctNov, '2026-11-02', '2026-11-02');
assertEqual(
  'Caso 2: Arriendo de $3M pagado el 5 oct y el 1 nov, vista de 1 día (2 nov) = $100.000 (no $200k)',
  resCaso2.totalGastos,
  100000
);

// CASO 3: Plantilla mensual de $100k pagada el 1 feb y el 1 mar, vista del 1 mar -> Esperado: $3.333
const pagosFebMar: GastoRaw[] = [
  {
    id: 'tpl-feb',
    fecha: '2026-02-01',
    descripcion: 'Software contable',
    monto: 100000,
    tipo: 'recurrente',
    plantilla_id: 'tpl-mensual-sw',
    taller_gastos_recurrentes: { id: 'tpl-mensual-sw', nombre: 'Software contable', frecuencia: 'mensual' },
  },
  {
    id: 'tpl-mar',
    fecha: '2026-03-01',
    descripcion: 'Software contable',
    monto: 100000,
    tipo: 'recurrente',
    plantilla_id: 'tpl-mensual-sw',
    taller_gastos_recurrentes: { id: 'tpl-mensual-sw', nombre: 'Software contable', frecuencia: 'mensual' },
  },
];

const resCaso3 = calcularGastosPeriodoConProrrateo(pagosFebMar, '2026-03-01', '2026-03-01');
assertEqual(
  'Caso 3: Plantilla mensual de $100k pagada el 1 feb y el 1 mar, vista del 1 mar = $3.333 (no $6.666)',
  resCaso3.totalGastos,
  3333
);

// CASO 4: "Arriendo Octubre" y "Arriendo Noviembre" de $3M, vista de una semana pasada -> Esperado: $700k
const pagosArriendoNombresMes: GastoRaw[] = [
  {
    id: 'arr-oct-nom',
    fecha: '2026-10-05',
    descripcion: 'Arriendo Octubre',
    monto: 3000000,
    taller_categorias_gastos: { id: 'cat-arr', nombre: 'Arriendo', color: '#f59e0b' },
  },
  {
    id: 'arr-nov-nom',
    fecha: '2026-11-01',
    descripcion: 'Arriendo Noviembre',
    monto: 3000000,
    taller_categorias_gastos: { id: 'cat-arr', nombre: 'Arriendo', color: '#f59e0b' },
  },
];

const resCaso4 = calcularGastosPeriodoConProrrateo(pagosArriendoNombresMes, '2026-10-27', '2026-11-02');
assertEqual(
  'Caso 4: "Arriendo Octubre" y "Arriendo Noviembre" ($3M) en vista de 7 días = $700.000 (no $1,4M)',
  resCaso4.totalGastos,
  700000
);

// CASO 5: Gasto anual de $730k, vista de un mes (30 días) que no incluye el pago -> Esperado: $60k
const pagoAnual: GastoRaw[] = [
  {
    id: 'anual-1',
    fecha: '2026-02-15',
    descripcion: 'Renovación Cámara de Comercio y Póliza',
    monto: 730000, // $2.000 por día
    tipo: 'recurrente',
    plantilla_id: 'tpl-anual-1',
    taller_gastos_recurrentes: { id: 'tpl-anual-1', nombre: 'Póliza Anual', frecuencia: 'anual' },
  },
];

const resCaso5 = calcularGastosPeriodoConProrrateo(pagoAnual, '2026-10-04', '2026-11-02');
assertEqual(
  'Caso 5: Gasto anual de $730k en vista de un mes (30 días) posterior al pago = $60.000 (no $0)',
  resCaso5.totalGastos,
  60000
);

// CASO 6: Días sin arriendo (Arriendo pagado el 5 oct, vista del 4 nov antes de pagar nov) -> Esperado: $100k
const pagoSoloOctubre: GastoRaw[] = [
  {
    id: 'arr-oct-only',
    fecha: '2026-10-05',
    descripcion: 'Arriendo Octubre',
    monto: 3000000,
    taller_categorias_gastos: { id: 'cat-arr', nombre: 'Arriendo', color: '#f59e0b' },
  },
];

const resCaso6 = calcularGastosPeriodoConProrrateo(pagoSoloOctubre, '2026-11-04', '2026-11-04');
assertEqual(
  'Caso 6: Arriendo pagado el 5 oct, vista del 4 nov (mes en curso aún sin pago) = $100.000 (no $0)',
  resCaso6.totalGastos,
  100000
);
assertEqual(
  'Caso 6b: Fecha del ítem se ajusta al período consultado (2026-11-04) y conserva fecha_pago_original (2026-10-05)',
  `${resCaso6.gastosDetalle[0].fecha}|${resCaso6.gastosDetalle[0].fecha_pago_original}`,
  '2026-11-04|2026-10-05'
);

// CASO 7: Consistencia Gráfica vs KPI en vista de 15 días con plantilla semanal
const resCaso7 = calcularGastosPeriodoConProrrateo(pagosSemanales, '2026-10-19', '2026-11-02');
const sumaGraficaCaso7 = Object.keys(resCaso7.gastosPorDiaMap).reduce(
  (acc, d) => acc + resCaso7.gastosPorDiaMap[d].total,
  0
);
assertEqual(
  'Caso 7: En vista de 15 días con plantilla semanal, KPI y Gráfica son consistentes (~$214.286)',
  Math.abs(resCaso7.totalGastos - sumaGraficaCaso7) <= 15,
  true
);

// CASO 8: Ventana de consulta incluye 365 días hacia atrás para cubrir gastos anuales
const ventana = obtenerVentanaConsultaGastos('2026-10-27', '2026-11-02');
assertEqual('Ventana de consulta retrocede 365 días desde startStr (2025-10-27)', ventana.queryStart, '2025-10-27');
assertEqual('listarDiasEnRango(hoy, hoy) devuelve 1 día', listarDiasEnRango('2026-11-02', '2026-11-02').length, 1);

console.log('\n📊 Suite 3: Casos de Fallas Reportadas (Monto Cambiante, Pagos Múltiples y Categorías Restauradas)\n');

// FALLA 1: Arriendo sube de $3M a $3,3M en período consultado -> KPI y Gráfica deben coincidir
const arriendoCambioMonto: GastoRaw[] = [
  {
    id: 'arr-sep',
    fecha: '2026-09-05',
    descripcion: 'Arriendo Septiembre',
    monto: 3000000,
    taller_categorias_gastos: { id: 'c-arr', nombre: 'Arriendo', color: '#f59e0b' },
  },
  {
    id: 'arr-oct-sube',
    fecha: '2026-10-05',
    descripcion: 'Arriendo Octubre con incremento',
    monto: 3300000,
    taller_categorias_gastos: { id: 'c-arr', nombre: 'Arriendo', color: '#f59e0b' },
  },
];

// Consulta del 1 oct al 31 oct (31 días).
// Del 1 al 4 oct toma el pago previo ($3M -> $100k/día = $400k).
// Del 5 al 31 oct toma el nuevo pago ($3,3M -> $110k/día = $2.970k).
// Suma total esperada = $3.370k. Tanto el KPI como la Gráfica deben ser idénticos.
const resFalla1 = calcularGastosPeriodoConProrrateo(arriendoCambioMonto, '2026-10-01', '2026-10-31');
const sumaGraficaFalla1 = Object.keys(resFalla1.gastosPorDiaMap).reduce(
  (acc, d) => acc + resFalla1.gastosPorDiaMap[d].total,
  0
);
assertEqual(
  'Falla 1: Si el monto cambia entre pagos, el KPI coincide exactamente con la gráfica diaria',
  Math.abs(resFalla1.totalGastos - sumaGraficaFalla1) <= 1,
  true
);

// FALLA 2: Dos o más pagos (abonos) del mismo gasto fijo en el mismo mes se suman
const abonosArriendoOctubre: GastoRaw[] = [
  {
    id: 'arr-abono-1',
    fecha: '2026-10-05',
    descripcion: 'Abono 1 Arriendo',
    monto: 1500000,
    taller_categorias_gastos: { id: 'c-arr', nombre: 'Arriendo', color: '#f59e0b' },
  },
  {
    id: 'arr-abono-2',
    fecha: '2026-10-20',
    descripcion: 'Abono 2 Arriendo',
    monto: 1500000,
    taller_categorias_gastos: { id: 'c-arr', nombre: 'Arriendo', color: '#f59e0b' },
  },
];
const resFalla2 = calcularGastosPeriodoConProrrateo(abonosArriendoOctubre, '2026-10-01', '2026-10-30');
assertEqual(
  'Falla 2: Dos abonos de $1,5M en el mismo mes se suman y reportan el total ($3M)',
  resFalla2.totalGastos,
  3000000
);

// FALLA 3: Categorías "Agua", "Luz", "Teléfono", "Aseo", "Gas", "Fijos" se clasifican como fijas
const categoriasFijasProbar = [
  'Agua',
  'Luz',
  'Teléfono',
  'Aseo',
  'Gas',
  'Fijos',
  'Gastos fijos',
];

for (const catNombre of categoriasFijasProbar) {
  const gTest: GastoRaw = {
    id: `test-${catNombre}`,
    fecha: '2026-10-15',
    descripcion: `Pago mensual de ${catNombre}`,
    monto: 200000,
    taller_categorias_gastos: { id: `c-${catNombre}`, nombre: catNombre, color: '#3b82f6' },
  };
  assertEqual(
    `Falla 3: Categoría "${catNombre}" se clasifica como fija`,
    clasificarGastoProrrateo(gTest).esFijo,
    true
  );
}

// Categorías "Gastos varios", "Gastos", "Gasolina", "Lavado y aseo de vehículos" deben seguir siendo directas
const categoriasDirectasProbar = [
  'Gastos varios',
  'Gastos',
  'Gasolina',
  'Lavado y aseo de vehículos',
];

for (const catNombre of categoriasDirectasProbar) {
  const gTest: GastoRaw = {
    id: `test-dir-${catNombre}`,
    fecha: '2026-10-15',
    descripcion: `Gasto en ${catNombre}`,
    monto: 50000,
    taller_categorias_gastos: { id: `c-${catNombre}`, nombre: catNombre, color: '#6b7280' },
  };
  assertEqual(
    `Falla 3: Categoría variable "${catNombre}" se clasifica como directa (no fija)`,
    clasificarGastoProrrateo(gTest).esFijo,
    false
  );
}

console.log('\n📊 Suite 4: Nuevas Verificaciones (Gastos de Nómina, Pagos Semanales Repetidos y Categoría Otros con Arriendo)\n');

// 1. "Gastos de nómina", "Gastos de arriendo" y "Gastos administrativos" se prorratean como fijos
assertEqual(
  'Categoría "Gastos de nómina" se clasifica como fija',
  clasificarGastoProrrateo({
    id: 't-nom',
    fecha: '2026-10-15',
    descripcion: 'Sueldo quincenal',
    monto: 1200000,
    taller_categorias_gastos: { id: 'c-nom', nombre: 'Gastos de nómina', color: '#8b5cf6' },
  }).esFijo,
  true
);

assertEqual(
  'Categoría "Gastos de arriendo" se clasifica como fija',
  clasificarGastoProrrateo({
    id: 't-arr',
    fecha: '2026-10-05',
    descripcion: 'Canon de arrendamiento',
    monto: 3000000,
    taller_categorias_gastos: { id: 'c-arr', nombre: 'Gastos de arriendo', color: '#f59e0b' },
  }).esFijo,
  true
);

assertEqual(
  'Categoría "Gastos administrativos" se clasifica como fija',
  clasificarGastoProrrateo({
    id: 't-adm',
    fecha: '2026-10-10',
    descripcion: 'Honorarios administración',
    monto: 500000,
    taller_categorias_gastos: { id: 'c-adm', nombre: 'Gastos administrativos', color: '#10b981' },
  }).esFijo,
  true
);

// 2. Descripción "Arriendo bodega" en categoría genérica "Otros" se clasifica como fija
assertEqual(
  'Descripción "Arriendo bodega" en categoría genérica "Otros" se clasifica como fija',
  clasificarGastoProrrateo({
    id: 't-arr-otros',
    fecha: '2026-10-05',
    descripcion: 'Arriendo bodega taller',
    monto: 3000000,
    taller_categorias_gastos: { id: 'c-otros', nombre: 'Otros', color: '#6b7280' },
  }).esFijo,
  true
);

// 3. Dos pagos semanales de $100k en la misma semana se suman ($200k en 7 días)
const dosPagosSemanalesMismaSemana: GastoRaw[] = [
  {
    id: 'sem-p1',
    fecha: '2026-10-27',
    descripcion: 'Abono 1 Vigilancia semanal',
    monto: 100000,
    tipo: 'recurrente',
    plantilla_id: 'tpl-vigilancia',
    taller_gastos_recurrentes: { id: 'tpl-vigilancia', nombre: 'Vigilancia semanal', frecuencia: 'semanal' },
  },
  {
    id: 'sem-p2',
    fecha: '2026-10-29',
    descripcion: 'Abono 2 Vigilancia semanal',
    monto: 100000,
    tipo: 'recurrente',
    plantilla_id: 'tpl-vigilancia',
    taller_gastos_recurrentes: { id: 'tpl-vigilancia', nombre: 'Vigilancia semanal', frecuencia: 'semanal' },
  },
];
const resSemanalRepetido = calcularGastosPeriodoConProrrateo(dosPagosSemanalesMismaSemana, '2026-10-27', '2026-11-02');
assertEqual(
  'Dos pagos semanales de $100k en la misma semana se suman y reportan $200k en la vista de 7 días',
  resSemanalRepetido.totalGastos,
  200000
);

console.log(`\n─────────────────────────────────────────`);
console.log(`Resultados: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  throw new Error(`${failed} tests failed`);
}
