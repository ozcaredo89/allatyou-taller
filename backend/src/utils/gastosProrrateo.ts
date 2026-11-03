/**
 * gastosProrrateo.ts
 * Motor de clasificación y prorrateo de gastos fijos/periódicos (semanales,
 * quincenales, mensuales y anuales) para reportes financieros.
 *
 * Principios de diseño:
 * 1. Deduplicación por flujo ("stream"): Pagos sucesivos del mismo gasto periódico
 *    (ej. "Arriendo Octubre" el 5 oct y "Arriendo Noviembre" el 1 nov, o la misma
 *    plantilla recurrente) pertenecen al mismo flujo. En cualquier día calendario `d`,
 *    un flujo fijo solo puede tener UN pago activo cubriendo ese día (nunca se duplica).
 * 2. Cobertura por ciclo real (`diasCiclo`: 7, 15, 30 o 365 días):
 *    - Mensual (30d): usa el pago del mismo mes calendario; si aún no se ha registrado
 *      el pago del mes en curso (ej. 4 de nov con último pago el 5 de oct), aplica
 *      ventana de gracia hacia el mes anterior (hasta 45 días).
 *    - Semanal (7d) / Quincenal (15d): cada pago cubre su ventana de `diasCiclo` días
 *      (con margen de gracia si el siguiente pago se atrasa unos días).
 *    - Anual (365d): cubre los 365 días siguientes a la fecha del pago (o el año calendario).
 * 3. Consistencia total: El KPI `totalGastos`, la dona `gastosPorCategoria`, la tabla
 *    de desglose `gastosDetalle` y las barras diarias de la gráfica se calculan sobre
 *    exactamente los mismos días cubiertos.
 */

export interface CategoriaGastoRef {
  id: string;
  nombre: string;
  color: string;
  icono?: string;
}

export interface RecurrenteGastoRef {
  id: string;
  nombre: string;
  frecuencia?: string;
}

export interface GastoRaw {
  id: string;
  fecha: string;
  descripcion: string;
  monto: number | string;
  categoria_id?: string | null;
  proveedor?: string | null;
  comprobante_url?: string | null;
  tipo?: 'unico' | 'recurrente' | string;
  plantilla_id?: string | null;
  notas?: string | null;
  created_at?: string;
  ingreso_id?: string | null;
  item_id?: string | null;
  taller_categorias_gastos?: CategoriaGastoRef | CategoriaGastoRef[] | null;
  taller_gastos_recurrentes?: RecurrenteGastoRef | RecurrenteGastoRef[] | null;
  taller_ingresos?: unknown;
}

export interface GastoProcesadoPeriodo extends GastoRaw {
  monto: number;
  monto_original: number;
  fecha_pago_original: string | null;
  es_fijo: boolean;
  es_prorrateado: boolean;
  es_provision?: boolean;
  dias_prorrateo: number;
  dias_ciclo: number;
  cuota_diaria: number;
}

export interface PlantillaRecurrenteRaw {
  id: string;
  nombre: string;
  monto_estimado: number | string;
  frecuencia?: string;
  dia_del_mes?: number | null;
  dia_semana?: number | null;
  activa?: boolean;
  fecha_inicio?: string | null;
  fecha_fin?: string | null;
  categoria_id?: string | null;
  taller_categorias_gastos?: CategoriaGastoRef | CategoriaGastoRef[] | null;
}

export interface ProrrateoResultado {
  diasRango: string[];
  diasPeriodo: number;
  totalGastos: number;
  totalGastosDirectos: number;
  totalGastosFijosProrrateados: number;
  cuotaFijaDiariaTotal: number;
  gastosPorDiaMap: Record<string, { total: number; directos: number; fijos: number }>;
  gastosPorCategoria: Array<{
    nombre: string;
    color: string;
    total: number;
    directos: number;
    fijos: number;
  }>;
  gastosDetalle: GastoProcesadoPeriodo[];
}

function unwrapSingle<T>(val: T | T[] | null | undefined): T | null {
  if (!val) return null;
  return Array.isArray(val) ? (val[0] ?? null) : val;
}

function normalizarTexto(str: string): string {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

// Categorías fijas mensuales con límites de palabra estrictos (\b)
const FIXED_CATEGORY_REGEX =
  /\b(arriendos?|alquiler(es)?|canon|servicios(\s+p[uú]blicos)?|agua|acueducto|luz|energ[ií]a|electricidad|internet|tel[eé]fonos?|telefon[ií]a|gas(\s+natural|\s+domiciliario)?|aseo|n[oó]minas?|salarios?|sueldos?|seguridad\s+social|parafiscales|administraci[oó]n|administrativ\w*|contabilidad|contador(es)?|software|suscripci[oó]n|suscripciones|seguros?|vigilancia|gastos?\s+fijos?|costos?\s+fijos?|fijos?|mensualidad(es)?)\b/i;

// Categorías variables / operativas o puntuales: se evalúan DESPUÉS de descartar que no contenga términos fijos
// ("Gastos de nómina" o "Gastos de arriendo" no deben ser directos; solo "Gastos varios", "Gastos generales", etc.)
const VARIABLE_CATEGORY_REGEX =
  /\b(repuestos?|insumos?|proveedores?|herramientas?|subcontrat\w*|gasolina|combustibles?|lubricantes?|aceites?|lavados?|veh[ií]culos?|carros?|autom[oó]viles?|transporte|env[ií]os?|domicilios?|varios|otros|imprevistos?|caja\s+menor|comisiones?|bonificaciones?|marketing|publicidad|impuestos?)\b/i;

const FIXED_DESCRIPTION_REGEX =
  /\b(arriendo|alquiler|canon|servicios\s+p[uú]blicos|internet|acueducto|energ[ií]a|n[oó]mina\s+fija|n[oó]mina\s+administrativa|salario\s+mensual|sueldo\s+mensual|seguridad\s+social|contador|administraci[oó]n|mensualidad)\b/i;

const COMISION_LIQUIDACION_REGEX = /^liquidaci[oó]n\s+(de\s+)?comisiones/i;

// Palabras temporales o de relleno que cambian mes a mes en la descripción de un mismo gasto fijo
// (ej. "Arriendo Octubre" vs "Arriendo Noviembre 2026")
const TEMPORAL_TOKENS_REGEX =
  /\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre|ene|feb|mar|abr|may|jun|jul|ago|sep|sept|oct|nov|dic|mes|mensual|mensualidad|quincena|quincenal|semana|semanal|anual|ano|anio|pago|cuota|factura|recibo|periodo|correspondiente|de|del|el|la|los|las|por|en|al|a|\d+)\b/g;

/**
 * Resta N días a una fecha "YYYY-MM-DD" en UTC puro.
 */
export function restarDiasStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - days);
  return dt.toISOString().slice(0, 10);
}

/**
 * Diferencia en días calendario (b - a) entre dos fechas "YYYY-MM-DD".
 */
export function diffDiasStr(aStr: string, bStr: string): number {
  const [ay, am, ad] = aStr.split('-').map(Number);
  const [by, bm, bd] = bStr.split('-').map(Number);
  const aMs = Date.UTC(ay, am - 1, ad);
  const bMs = Date.UTC(by, bm - 1, bd);
  return Math.round((bMs - aMs) / 86400000);
}

/**
 * Devuelve el primer y último día del mes calendario de una fecha "YYYY-MM-DD".
 */
export function limitesMesCalendario(dateStr: string): { firstDay: string; lastDay: string } {
  const [y, m] = dateStr.split('-').map(Number);
  const yStr = String(y);
  const mStr = m < 10 ? `0${m}` : String(m);
  const firstDay = `${yStr}-${mStr}-01`;
  const lastDt = new Date(Date.UTC(y, m, 0));
  const lastDay = lastDt.toISOString().slice(0, 10);
  return { firstDay, lastDay };
}

/**
 * Genera todos los días "YYYY-MM-DD" entre startStr y endStr (inclusive).
 */
export function listarDiasEnRango(startStr: string, endStr: string): string[] {
  if (!startStr || !endStr || startStr > endStr) return [];
  const [sy, sm, sd] = startStr.split('-').map(Number);
  const [ey, em, ed] = endStr.split('-').map(Number);
  const cur = new Date(Date.UTC(sy, sm - 1, sd));
  const end = new Date(Date.UTC(ey, em - 1, ed));

  const dias: string[] = [];
  let safety = 0;
  while (cur <= end && safety < 730) {
    dias.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
    safety++;
  }
  return dias;
}

/**
 * Calcula la ventana ampliada de consulta a base de datos:
 * - Retrocede 365 días desde startStr para cubrir gastos anuales, mensuales
 *   en días de transición (ej. 4 nov con pago el 5 oct) y plantillas periódicas.
 * - Avanza hasta el fin del mes calendario de endStr para cubrir vistas de primeras
 *   semanas de un mes cuyo gasto fijo se registró días después dentro del mismo mes.
 */
export function obtenerVentanaConsultaGastos(startStr: string, endStr: string): {
  queryStart: string;
  queryEnd: string;
} {
  const queryStart = restarDiasStr(startStr, 365);
  const { lastDay: mesEndLast } = limitesMesCalendario(endStr);
  const queryEnd = endStr >= mesEndLast ? endStr : mesEndLast;

  return { queryStart, queryEnd };
}

/**
 * Determina si un gasto es fijo/periódico prorrateable y cuántos días cubre su ciclo.
 */
export function clasificarGastoProrrateo(gasto: GastoRaw): {
  esFijo: boolean;
  diasCiclo: number;
} {
  // 1. Gastos vinculados a una orden/vehículo o liquidaciones de comisiones por servicio
  //    son SIEMPRE costos directos variables del día en que se registran.
  if (gasto.ingreso_id || gasto.item_id) {
    return { esFijo: false, diasCiclo: 1 };
  }
  const desc = (gasto.descripcion || '').trim();
  if (COMISION_LIQUIDACION_REGEX.test(desc)) {
    return { esFijo: false, diasCiclo: 1 };
  }

  // 2. Gastos explícitamente marcados como recurrentes o vinculados a plantilla recurrente
  if (gasto.tipo === 'recurrente' || gasto.plantilla_id) {
    const rec = unwrapSingle(gasto.taller_gastos_recurrentes);
    const frec = (rec?.frecuencia || 'mensual').toLowerCase();
    if (frec === 'diario') return { esFijo: false, diasCiclo: 1 };
    if (frec === 'semanal') return { esFijo: true, diasCiclo: 7 };
    if (frec === 'quincenal') return { esFijo: true, diasCiclo: 15 };
    if (frec === 'anual') return { esFijo: true, diasCiclo: 365 };
    return { esFijo: true, diasCiclo: 30 };
  }

  // 3. Clasificación por categoría del gasto (sin vínculo a vehículo)
  const cat = unwrapSingle(gasto.taller_categorias_gastos);
  const catNombre = (cat?.nombre || '').trim();
  if (catNombre) {
    // Si la categoría contiene explícitamente términos variables vehiculares o de taller (lavado, vehículo, gasolina, repuestos)
    if (/\b(lavados?|veh[ií]culos?|carros?|autom[oó]viles?|gasolina|combustibles?|repuestos?|insumos?)\b/i.test(catNombre)) {
      return { esFijo: false, diasCiclo: 1 };
    }
    // Si la categoría contiene un concepto fijo ("Arriendo", "Nómina", "Gastos de nómina", "Gastos de arriendo", "Luz", etc.)
    if (FIXED_CATEGORY_REGEX.test(catNombre)) {
      return { esFijo: true, diasCiclo: 30 };
    }
    // Si no es un concepto fijo pero contiene un término variable explícito (ej. "Gastos varios", "Otros")
    if (VARIABLE_CATEGORY_REGEX.test(catNombre) || /^(gastos?|varios?|otros?)$/i.test(catNombre)) {
      // Si la categoría es genérica como "Otros" o "Gastos varios" pero la descripción dice explícitamente "Arriendo bodega",
      // la descripción manda.
      if (FIXED_DESCRIPTION_REGEX.test(desc)) {
        return { esFijo: true, diasCiclo: 30 };
      }
      return { esFijo: false, diasCiclo: 1 };
    }
  }

  // 4. Fallback por descripción solo si la descripción no es variable y coincide con un gasto fijo explícito
  if (!VARIABLE_CATEGORY_REGEX.test(desc) && FIXED_DESCRIPTION_REGEX.test(desc)) {
    return { esFijo: true, diasCiclo: 30 };
  }

  return { esFijo: false, diasCiclo: 1 };
}

/**
 * Construye una clave canónica de "flujo" (stream) para agrupar pagos sucesivos
 * del mismo concepto periódico (ej. "Arriendo Octubre" y "Arriendo Noviembre").
 */
export function obtenerClaveFlujoFijo(gasto: GastoRaw, diasCiclo: number): string {
  if (gasto.plantilla_id) {
    return `plantilla:${gasto.plantilla_id}`;
  }
  const rec = unwrapSingle(gasto.taller_gastos_recurrentes);
  if (rec?.id) {
    return `plantilla:${rec.id}`;
  }

  const cat = unwrapSingle(gasto.taller_categorias_gastos);
  const catKey = cat?.id || normalizarTexto(cat?.nombre || 'sin_cat');

  const descBase = normalizarTexto(gasto.descripcion || '')
    .replace(TEMPORAL_TOKENS_REGEX, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const concepto = descBase || normalizarTexto(cat?.nombre || 'fijo');
  return `flujo:${diasCiclo}:${catKey}:${concepto}`;
}

/**
 * Devuelve la fecha del lunes (YYYY-MM-DD) para cualquier fecha dada,
 * definiendo la semana calendario estándar de lunes a domingo.
 */
export function obtenerLunesSemanaStr(fechaStr: string): string {
  const [year, month, day] = fechaStr.split('-').map(Number);
  const dt = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const dayOfWeek = dt.getUTCDay(); // 0 = Domingo, 1 = Lunes, ..., 6 = Sábado
  const diffToMonday = (dayOfWeek + 6) % 7;
  const mondayUTC = new Date(Date.UTC(year, month - 1, day - diffToMonday, 12, 0, 0));
  return mondayUTC.toISOString().slice(0, 10);
}

/**
 * Dado el historial de pagos ordenados ascendentemente por fecha de un mismo flujo fijo,
 * determina cuál es el ÚNICO pago activo que cubre el día `diaStr` (o `null` si ninguno lo cubre).
 */
function seleccionarPagoActivoEnDia(
  pagosOrdenados: GastoRaw[],
  diasCiclo: number,
  diaStr: string
): GastoRaw | null {
  if (pagosOrdenados.length === 0) return null;

  // ── Caso Mensual (30 días) ──
  // Si hay pagos en el mismo mes calendario que `diaStr`, usar el pago de ese mes.
  // Sin regla de 35 días: si en ese mes no hubo pago, retorna null (se aprovisiona si tiene plantilla).
  if (diasCiclo === 30) {
    const ymDia = diaStr.slice(0, 7);
    const pagosMismoMes = pagosOrdenados.filter((p) => p.fecha.slice(0, 7) === ymDia);

    if (pagosMismoMes.length > 0) {
      const previosEnMes = pagosMismoMes.filter((p) => p.fecha <= diaStr);
      return previosEnMes.length > 0
        ? previosEnMes[previosEnMes.length - 1]
        : pagosMismoMes[0];
    }

    return null;
  }

  // ── Caso Anual (365 días) ──
  if (diasCiclo === 365) {
    for (let i = pagosOrdenados.length - 1; i >= 0; i--) {
      const p = pagosOrdenados[i];
      if (p.fecha <= diaStr) {
        const diff = diffDiasStr(p.fecha, diaStr);
        if (diff < 365) {
          return p;
        }
        break;
      }
    }
    return null;
  }

  // ── Caso Semanal (7 días) / Quincenal (15 días) u otros ciclos cortos ──
  // 1. Pago activo cuya semana calendario (si es semanal) o ventana natural cubre `diaStr`
  if (diasCiclo === 7) {
    const lunesDia = obtenerLunesSemanaStr(diaStr);
    const pagosMismaSemana = pagosOrdenados.filter(
      (p) => obtenerLunesSemanaStr(p.fecha) === lunesDia
    );
    if (pagosMismaSemana.length > 0) {
      const previosEnSemana = pagosMismaSemana.filter((p) => p.fecha <= diaStr);
      return previosEnSemana.length > 0
        ? previosEnSemana[previosEnSemana.length - 1]
        : pagosMismaSemana[0];
    }
  } else {
    for (let i = pagosOrdenados.length - 1; i >= 0; i--) {
      const p = pagosOrdenados[i];
      if (p.fecha <= diaStr) {
        const diff = diffDiasStr(p.fecha, diaStr);
        if (diff < diasCiclo) {
          return p;
        }
        break;
      }
    }

    for (let i = 0; i < pagosOrdenados.length; i++) {
      const p = pagosOrdenados[i];
      if (p.fecha > diaStr) {
        const diffForward = diffDiasStr(diaStr, p.fecha);
        if (diffForward < diasCiclo) {
          return p;
        }
        break;
      }
    }
  }

  // 2. Ventana de gracia corta (hasta 4 días adicionales) si en este ciclo no hay pago
  // pero el pago anterior aún tiene días disponibles dentro de su cuota
  for (let i = pagosOrdenados.length - 1; i >= 0; i--) {
    const p = pagosOrdenados[i];
    if (p.fecha <= diaStr) {
      const diff = diffDiasStr(p.fecha, diaStr);
      if (diff <= diasCiclo + 4) {
        return p;
      }
      break;
    }
  }

  return null;
}

/**
 * Procesa todos los gastos de la ventana ampliada y calcula:
 * - Gastos directos dentro de [startStr, endStr]
 * - Gastos fijos/periódicos prorrateados día a día sin duplicidades
 * - Distribución diaria para la gráfica comparativa (todos los días del rango)
 * - Distribución por categoría para la gráfica de dona
 * - Lista detallada de ítems para el modal de desglose
 */
export function calcularGastosPeriodoConProrrateo(
  gastosVentana: GastoRaw[],
  startStr: string,
  endStr: string,
  plantillasActivas: PlantillaRecurrenteRaw[] = []
): ProrrateoResultado {
  const diasRango = listarDiasEnRango(startStr, endStr);
  const diasPeriodo = Math.max(diasRango.length, 1);

  const gastosPorDiaMap: Record<string, { total: number; directos: number; fijos: number }> = {};
  const fijosSinRedondearPorDia: Record<string, number> = {};
  for (const dia of diasRango) {
    gastosPorDiaMap[dia] = { total: 0, directos: 0, fijos: 0 };
    fijosSinRedondearPorDia[dia] = 0;
  }

  const directosEnRango: GastoProcesadoPeriodo[] = [];
  const flujosFijosMap: Record<
    string,
    { diasCiclo: number; pagos: GastoRaw[] }
  > = {};

  for (const g of gastosVentana) {
    const montoOriginal = Number(g.monto || 0);
    if (montoOriginal <= 0) continue;

    const { esFijo, diasCiclo } = clasificarGastoProrrateo(g);

    if (!esFijo) {
      if (g.fecha >= startStr && g.fecha <= endStr) {
        const montoRedondeado = Math.round(montoOriginal);
        directosEnRango.push({
          ...g,
          monto: montoRedondeado,
          monto_original: montoRedondeado,
          fecha_pago_original: g.fecha,
          es_fijo: false,
          es_prorrateado: false,
          dias_prorrateo: 1,
          dias_ciclo: 1,
          cuota_diaria: montoRedondeado,
        });
      }
      continue;
    }

    const claveFlujo = obtenerClaveFlujoFijo(g, diasCiclo);
    if (!flujosFijosMap[claveFlujo]) {
      flujosFijosMap[claveFlujo] = { diasCiclo, pagos: [] };
    }
    flujosFijosMap[claveFlujo].pagos.push(g);
  }

  // Evaluar cada flujo fijo día por día en `diasRango`
  const fijosProcesados: GastoProcesadoPeriodo[] = [];
  const clavesFlujos = Object.keys(flujosFijosMap);

  for (const claveFlujo of clavesFlujos) {
    const { diasCiclo, pagos } = flujosFijosMap[claveFlujo];
    const pagosRawOrdenados = [...pagos].sort((a, b) => a.fecha.localeCompare(b.fecha));

    // Para flujos periódicos (semanales, quincenales, mensuales), si existen múltiples pagos
    // en el mismo ciclo (ej. abonos de arriendo, dos pagos de nómina en la misma semana o quincena),
    // consolidarlos por bloque de ciclo para que sus montos se sumen.
    let pagosOrdenados: GastoRaw[] = pagosRawOrdenados;
    if (pagosRawOrdenados.length > 1) {
      if (diasCiclo === 30 || diasCiclo === 365 || diasCiclo === 7) {
        const porCicloMap: Record<string, GastoRaw[]> = {};
        for (const p of pagosRawOrdenados) {
          let key: string;
          if (diasCiclo === 30) key = p.fecha.slice(0, 7); // Mismo mes YYYY-MM
          else if (diasCiclo === 365) key = p.fecha.slice(0, 4); // Mismo año YYYY
          else key = obtenerLunesSemanaStr(p.fecha); // Misma semana lunes-domingo
          if (!porCicloMap[key]) porCicloMap[key] = [];
          porCicloMap[key].push(p);
        }
        pagosOrdenados = Object.keys(porCicloMap)
          .sort()
          .map((k) => {
            const grupo = porCicloMap[k];
            if (grupo.length === 1) return grupo[0];
            const ultimo = grupo[grupo.length - 1];
            const sumaTotal = grupo.reduce((acc, item) => acc + Number(item.monto || 0), 0);
            const extraCount = grupo.length - 1;
            const sufijo =
              extraCount === 1 ? '(+1 pago en el ciclo)' : `(+${extraCount} pagos en el ciclo)`;
            return {
              ...ultimo,
              monto: sumaTotal,
              descripcion: `${ultimo.descripcion} ${sufijo}`,
            };
          });
      } else {
        // Quincenal (15d): agrupar pagos sucesivos que caen dentro de la misma ventana de diasCiclo
        const grupos: GastoRaw[][] = [];
        for (const p of pagosRawOrdenados) {
          const ultimoGrupo = grupos[grupos.length - 1];
          if (
            ultimoGrupo &&
            diffDiasStr(ultimoGrupo[0].fecha, p.fecha) < diasCiclo
          ) {
            ultimoGrupo.push(p);
          } else {
            grupos.push([p]);
          }
        }
        pagosOrdenados = grupos.map((grupo) => {
          if (grupo.length === 1) return grupo[0];
          const ultimo = grupo[grupo.length - 1];
          const sumaTotal = grupo.reduce((acc, item) => acc + Number(item.monto || 0), 0);
          const extraCount = grupo.length - 1;
          const sufijo =
            extraCount === 1 ? '(+1 pago en el ciclo)' : `(+${extraCount} pagos en el ciclo)`;
          return {
            ...ultimo,
            monto: sumaTotal,
            descripcion: `${ultimo.descripcion} ${sufijo}`,
          };
        });
      }
    }

    // ── Cambio 2: En vistas de 30 días o más, contar completo el gasto mensual pagado en el rango ──
    if (diasPeriodo >= 30 && diasCiclo === 30) {
      const pagosEnRango = pagosOrdenados.filter((p) => p.fecha >= startStr && p.fecha <= endStr);
      if (pagosEnRango.length > 0) {
        for (const pago of pagosEnRango) {
          const montoPago = Number(pago.monto || 0);
          const mesPago = pago.fecha.slice(0, 7);
          let diasAsignados = diasRango.filter((d) => d.slice(0, 7) === mesPago);
          if (
            diasAsignados.length < 28 &&
            pagosEnRango.length === 1 &&
            diasPeriodo >= 28 &&
            diasPeriodo <= 31
          ) {
            diasAsignados = diasRango;
          }
          const baseCuota = Math.floor(montoPago / Math.max(diasAsignados.length, 1));
          let residuo = Math.round(montoPago) - (baseCuota * diasAsignados.length);
          for (const dia of diasAsignados) {
            const extra = residuo > 0 ? 1 : 0;
            if (residuo > 0) residuo--;
            fijosSinRedondearPorDia[dia] += (baseCuota + extra);
          }

          fijosProcesados.push({
            ...pago,
            fecha: pago.fecha,
            fecha_pago_original: pago.fecha,
            monto: Math.round(montoPago),
            monto_original: Math.round(montoPago),
            es_fijo: true,
            es_prorrateado: false,
            dias_prorrateo: 30,
            dias_ciclo: 30,
            cuota_diaria: Math.round(montoPago / 30),
          });
        }
        continue;
      }
    }

    // Control para que un único pago individual nunca cubra más de `diasCiclo` días (100% de su monto)
    const diasUsadosPorPago: Record<string, number> = {};
    const detallePorPago: Record<
      string,
      {
        pago: GastoRaw;
        dias: number;
        suma: number;
        primeraFecha: string;
        ultimaFecha: string;
      }
    > = {};

    let diasCubiertosFlujo = 0;
    let sumaAcumuladaFlujo = 0;
    let ultimoPagoRepresentativo: GastoRaw | null = null;
    let primeraFechaFlujo = '';
    let ultimaFechaFlujo = '';

    for (const dia of diasRango) {
      const candidatosDisponibles = pagosOrdenados.filter(
        (p) => (diasUsadosPorPago[p.id] || 0) < diasCiclo
      );
      const pagoActivo = seleccionarPagoActivoEnDia(candidatosDisponibles, diasCiclo, dia);
      if (!pagoActivo) continue;

      const montoPago = Number(pagoActivo.monto || 0);
      const cuotaDiaria = montoPago / diasCiclo;

      diasUsadosPorPago[pagoActivo.id] = (diasUsadosPorPago[pagoActivo.id] || 0) + 1;
      if (!detallePorPago[pagoActivo.id]) {
        detallePorPago[pagoActivo.id] = {
          pago: pagoActivo,
          dias: 0,
          suma: 0,
          primeraFecha: dia,
          ultimaFecha: dia,
        };
      }
      detallePorPago[pagoActivo.id].dias += 1;
      detallePorPago[pagoActivo.id].suma += cuotaDiaria;
      detallePorPago[pagoActivo.id].ultimaFecha = dia;

      diasCubiertosFlujo++;
      sumaAcumuladaFlujo += cuotaDiaria;
      fijosSinRedondearPorDia[dia] += cuotaDiaria;
      ultimoPagoRepresentativo = pagoActivo;
      if (!primeraFechaFlujo) primeraFechaFlujo = dia;
      ultimaFechaFlujo = dia;
    }

    if (diasCubiertosFlujo === 0 || !ultimoPagoRepresentativo) continue;

    const construirFilaFija = (
      pago: GastoRaw,
      dias: number,
      suma: number,
      primeraFecha: string,
      ultimaFecha: string
    ): GastoProcesadoPeriodo => {
      const montoBase = Number(pago.monto || 0);
      const cuotaDiaria = montoBase / diasCiclo;
      const fechaOriginal = pago.fecha;
      const fechaEnPeriodo =
        fechaOriginal >= startStr && fechaOriginal <= endStr
          ? fechaOriginal
          : ultimaFecha || primeraFecha || endStr;

      return {
        ...pago,
        fecha: fechaEnPeriodo,
        fecha_pago_original: fechaOriginal,
        monto: Math.round(suma),
        monto_original: Math.round(montoBase),
        es_fijo: true,
        es_prorrateado: dias < diasCiclo,
        dias_prorrateo: dias,
        dias_ciclo: diasCiclo,
        cuota_diaria: Math.round(cuotaDiaria),
      };
    };

    // Si el total de días cubiertos por el flujo cabe dentro de un ciclo, consolidamos en una sola fila;
    // si abarca múltiples ciclos, emitimos cada pago con sus días reales.
    if (diasCubiertosFlujo <= diasCiclo) {
      fijosProcesados.push(
        construirFilaFija(
          ultimoPagoRepresentativo,
          diasCubiertosFlujo,
          sumaAcumuladaFlujo,
          primeraFechaFlujo,
          ultimaFechaFlujo
        )
      );
    } else {
      const idsPagos = Object.keys(detallePorPago);
      for (const pid of idsPagos) {
        const info = detallePorPago[pid];
        fijosProcesados.push(
          construirFilaFija(info.pago, info.dias, info.suma, info.primeraFecha, info.ultimaFecha)
        );
      }
    }
  }

  // ── Cambio 4: Aprovisionamiento de plantillas activas no pagadas en el período ──
  for (const plantilla of plantillasActivas) {
    if (!plantilla || (plantilla.activa !== undefined && !plantilla.activa)) continue;
    const montoEstimado = Number(plantilla.monto_estimado || 0);
    if (montoEstimado <= 0) continue;

    // Verificar si ya existe un pago de esta plantilla o concepto en el período (pagado no se duplica)
    const catPlantilla = unwrapSingle(plantilla.taller_categorias_gastos);
    const catId = plantilla.categoria_id || catPlantilla?.id;
    const yaPagado = fijosProcesados.some(
      (fp) =>
        fp.plantilla_id === plantilla.id ||
        (fp as any).taller_gastos_recurrentes?.id === plantilla.id ||
        (catId &&
          fp.categoria_id === catId &&
          fp.descripcion.toLowerCase().includes(plantilla.nombre.toLowerCase()))
    );

    if (yaPagado) continue; // Si ya se pagó en el período, no se aprovisiona

    const frec = (plantilla.frecuencia || 'mensual').toLowerCase();
    const diasCiclo =
      frec === 'semanal'
        ? 7
        : frec === 'quincenal'
        ? 15
        : frec === 'anual'
        ? 365
        : frec === 'diario'
        ? 1
        : 30;

    // Filtrar días elegibles sin contar antes de fecha_inicio ni después de fecha_fin
    const diasElegibles = diasRango.filter((dia) => {
      if (plantilla.fecha_inicio && dia < plantilla.fecha_inicio) return false;
      if (plantilla.fecha_fin && dia > plantilla.fecha_fin) return false;
      return true;
    });

    if (diasElegibles.length === 0) continue;

    const cuotaDiaria = montoEstimado / diasCiclo;
    let sumaAprovisionada = cuotaDiaria * diasElegibles.length;

    if (diasPeriodo >= 30 && diasCiclo === 30 && diasElegibles.length >= 28) {
      sumaAprovisionada = montoEstimado;
    }

    const baseCuotaDist = Math.floor(sumaAprovisionada / diasElegibles.length);
    let residuoDist = Math.round(sumaAprovisionada) - (baseCuotaDist * diasElegibles.length);
    for (const dia of diasElegibles) {
      const extra = residuoDist > 0 ? 1 : 0;
      if (residuoDist > 0) residuoDist--;
      fijosSinRedondearPorDia[dia] += (baseCuotaDist + extra);
    }

    const fechaItem = diasElegibles[0];
    fijosProcesados.push({
      id: `prov-${plantilla.id}`,
      fecha: fechaItem,
      fecha_pago_original: null,
      descripcion: plantilla.nombre,
      monto: Math.round(sumaAprovisionada),
      monto_original: Math.round(montoEstimado),
      proveedor: null,
      tipo: 'recurrente',
      plantilla_id: plantilla.id,
      categoria_id: catId || null,
      taller_categorias_gastos: plantilla.taller_categorias_gastos || null,
      es_fijo: true,
      es_provision: true,
      es_prorrateado: diasElegibles.length < diasCiclo,
      dias_prorrateo: diasElegibles.length,
      dias_ciclo: diasCiclo,
      cuota_diaria: Math.round(cuotaDiaria),
    });
  }

  // Poblar gastos directos por día
  for (const dir of directosEnRango) {
    if (gastosPorDiaMap[dir.fecha]) {
      gastosPorDiaMap[dir.fecha].directos += dir.monto;
    }
  }

  // Poblar gastos fijos por día y calcular cuota fija diaria promedio del período
  let sumaCuotasFijasDias = 0;
  for (const dia of diasRango) {
    const fijoDia = Math.round(fijosSinRedondearPorDia[dia] || 0);
    gastosPorDiaMap[dia].fijos = fijoDia;
    gastosPorDiaMap[dia].total = gastosPorDiaMap[dia].directos + fijoDia;
    sumaCuotasFijasDias += fijoDia;
  }
  const cuotaFijaDiariaTotal = Math.round(sumaCuotasFijasDias / diasPeriodo);

  // Calcular totales y agrupar por categoría
  let totalGastosDirectos = 0;
  let totalGastosFijosProrrateados = 0;
  const gastosPorCategoriaMap: Record<
    string,
    { nombre: string; color: string; total: number; directos: number; fijos: number }
  > = {};

  const acumularCategoria = (item: GastoProcesadoPeriodo) => {
    const cat = unwrapSingle(item.taller_categorias_gastos);
    const key = cat?.id || 'sin_categoria';
    const nombre = cat?.nombre || 'Sin categoría';
    const color = cat?.color || '#6b7280';

    if (!gastosPorCategoriaMap[key]) {
      gastosPorCategoriaMap[key] = { nombre, color, total: 0, directos: 0, fijos: 0 };
    }
    gastosPorCategoriaMap[key].total += item.monto;
    if (item.es_fijo) {
      gastosPorCategoriaMap[key].fijos += item.monto;
    } else {
      gastosPorCategoriaMap[key].directos += item.monto;
    }
  };

  for (const dir of directosEnRango) {
    totalGastosDirectos += dir.monto;
    acumularCategoria(dir);
  }

  for (const fijo of fijosProcesados) {
    totalGastosFijosProrrateados += fijo.monto;
    acumularCategoria(fijo);
  }

  const totalGastos = totalGastosDirectos + totalGastosFijosProrrateados;
  const gastosPorCategoria = Object.keys(gastosPorCategoriaMap)
    .map((k) => gastosPorCategoriaMap[k])
    .sort((a, b) => b.total - a.total);

  const gastosDetalle = [...directosEnRango, ...fijosProcesados].sort((a, b) => {
    if (a.es_prorrateado !== b.es_prorrateado) {
      return a.es_prorrateado ? 1 : -1;
    }
    return b.fecha.localeCompare(a.fecha) || b.monto - a.monto;
  });

  return {
    diasRango,
    diasPeriodo,
    totalGastos,
    totalGastosDirectos,
    totalGastosFijosProrrateados,
    cuotaFijaDiariaTotal,
    gastosPorDiaMap,
    gastosPorCategoria,
    gastosDetalle,
  };
}
