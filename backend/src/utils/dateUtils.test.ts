/**
 * dateUtils.test.ts
 * Tests de casos límite de timezone para los helpers de dateUtils.
 * Ejecutar con: npx ts-node src/utils/dateUtils.test.ts
 */

import { toBogotaDateStr, getBogotaRange, bogotaToday } from './dateUtils';

// ── Utilidades de test ────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function expect(description: string, actual: string, expected: string): void {
  if (actual === expected) {
    console.log(`  ✅ ${description}`);
    passed++;
  } else {
    console.error(`  ❌ ${description}`);
    console.error(`     Expected: "${expected}"`);
    console.error(`     Actual:   "${actual}"`);
    failed++;
  }
}

// ── Suite: toBogotaDateStr ───────────────────────────────────────────────────

console.log('\n📅 toBogotaDateStr — Conversión a fecha local de Colombia\n');

// Colombia es UTC-5. Un timestamp con hora UTC indica la hora ANTES de que
// Colombia pase al siguiente día natural.

// 23:59 UTC = 18:59 COT → mismo día calendario en Colombia
expect(
  '23:59 UTC = 18:59 COT → sigue siendo el mismo día en Colombia',
  toBogotaDateStr('2026-08-26T23:59:00.000Z'),
  '2026-08-26'
);

// 00:00 UTC = 19:00 COT → mismo día en Colombia (NO debe saltar al siguiente)
expect(
  '00:00 UTC = 19:00 COT → NO salta al día siguiente en Colombia',
  toBogotaDateStr('2026-08-27T00:00:00.000Z'),
  '2026-08-26'
);

// 04:59 UTC = 23:59 COT → sigue siendo el mismo día en Colombia
expect(
  '04:59 UTC = 23:59 COT → sigue siendo el mismo día',
  toBogotaDateStr('2026-08-27T04:59:59.000Z'),
  '2026-08-26'
);

// 05:00 UTC = 00:00 COT → ahora sí es el nuevo día en Colombia
expect(
  '05:00 UTC = 00:00 COT → nuevo día en Colombia',
  toBogotaDateStr('2026-08-27T05:00:00.000Z'),
  '2026-08-27'
);

// 05:01 UTC = 00:01 COT → nuevo día
expect(
  '05:01 UTC = 00:01 COT → nuevo día en Colombia',
  toBogotaDateStr('2026-08-27T05:01:00.000Z'),
  '2026-08-27'
);

// Medianoche UTC = 19:00 COT del día anterior (crítico: bugs de `split('T')[0]`)
expect(
  'Medianoche exacta UTC (2026-01-01T00:00:00Z) → 2025-12-31 en Colombia',
  toBogotaDateStr('2026-01-01T00:00:00.000Z'),
  '2025-12-31'
);

// Acepta Date objects
expect(
  'Acepta Date object',
  toBogotaDateStr(new Date('2026-08-26T23:00:00.000Z')),
  '2026-08-26'
);

// ── Suite: getBogotaRange ────────────────────────────────────────────────────

console.log('\n📅 getBogotaRange — Cálculo de rangos de filtro\n');

// Base: 2026-08-26 a las 00:30 UTC → 2026-08-25 19:30 COT (día anterior en Colombia)
const baseNight = new Date('2026-08-26T00:30:00.000Z');

const rangeHoyNight = getBogotaRange('hoy', baseNight);
expect(
  'hoy (base 00:30 UTC = víspera en Colombia) → 2026-08-25',
  rangeHoyNight.startStr,
  '2026-08-25'
);
expect(
  'hoy end === start',
  rangeHoyNight.endStr,
  rangeHoyNight.startStr
);

// Base: 2026-08-26 a las 10:00 UTC → 2026-08-26 05:00 COT (mismo día en Colombia)
const baseDay = new Date('2026-08-26T10:00:00.000Z');

const rangeHoyDay = getBogotaRange('hoy', baseDay);
expect(
  'hoy (base 10:00 UTC = mañana en Colombia) → 2026-08-26',
  rangeHoyDay.startStr,
  '2026-08-26'
);

const rangeAyer = getBogotaRange('ayer', baseDay);
expect(
  'ayer (base 2026-08-26 COT) → start 2026-08-25',
  rangeAyer.startStr,
  '2026-08-25'
);
expect(
  'ayer → end 2026-08-25',
  rangeAyer.endStr,
  '2026-08-25'
);

const rangeSemana = getBogotaRange('semana', baseDay);
expect(
  'semana (base 2026-08-26) → start 2026-08-20 (6 días atrás)',
  rangeSemana.startStr,
  '2026-08-20'
);
expect(
  'semana → end 2026-08-26',
  rangeSemana.endStr,
  '2026-08-26'
);

const rangeMes = getBogotaRange('mes', baseDay);
expect(
  'mes (base 2026-08-26) → start 2026-07-28 (29 días atrás)',
  rangeMes.startStr,
  '2026-07-28'
);
expect(
  'mes → end 2026-08-26',
  rangeMes.endStr,
  '2026-08-26'
);

// ── Resumen ──────────────────────────────────────────────────────────────────

console.log(`\n─────────────────────────────────────────`);
console.log(`Resultados: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('❌ ALGUNOS TESTS FALLARON');
  process.exit(1);
} else {
  console.log('✅ Todos los tests pasaron');
}
