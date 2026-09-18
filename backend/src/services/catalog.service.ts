import { supabase } from '../config/supabase';

// ─── Caché en Memoria con TTL ──────────────────────────────────────────────────
// Evita re-agregar 180 días de items_factura en cada petición.
// TTL: 15 minutos (900 000 ms).

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutos
const cache = new Map<string, CacheEntry<unknown>>();

function cacheGet<T>(key: string): T | null {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (!entry || Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function cacheSet<T>(key: string, data: T): void {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

function invalidarCacheVehiculo(marcaNorm?: string, lineaNorm?: string): void {
  for (const key of Array.from(cache.keys())) {
    if (key.startsWith('vehiculos:')) {
      cache.delete(key);
    } else if (marcaNorm && lineaNorm && key.includes(`:${marcaNorm}:${lineaNorm}`)) {
      cache.delete(key);
    }
  }
}

// ─── Diccionarios de Normalización ────────────────────────────────────────────

/**
 * Mapeo de variantes textuales de marca a su nombre canónico.
 * Las claves deben estar en minúsculas sin espacios extra.
 */
const MARCAS_CANONICAS: Record<string, string> = {
  chevrolet: 'Chevrolet', chevy: 'Chevrolet', 'gm': 'Chevrolet',
  renault: 'Renault',
  kia: 'Kia',
  mazda: 'Mazda',
  toyota: 'Toyota',
  nissan: 'Nissan',
  volkswagen: 'Volkswagen', vw: 'Volkswagen',
  ford: 'Ford',
  hyundai: 'Hyundai',
  suzuki: 'Suzuki',
  honda: 'Honda',
  peugeot: 'Peugeot',
  mitsubishi: 'Mitsubishi',
  subaru: 'Subaru',
  jeep: 'Jeep',
  dodge: 'Dodge',
  ram: 'RAM',
  bmw: 'BMW',
  'mercedes-benz': 'Mercedes-Benz', mercedes: 'Mercedes-Benz',
  audi: 'Audi',
  fiat: 'Fiat',
  seat: 'SEAT',
  skoda: 'Škoda', škoda: 'Škoda',
  volvo: 'Volvo',
  lexus: 'Lexus',
  land: 'Land Rover', 'land rover': 'Land Rover',
  isuzu: 'Isuzu',
  jac: 'JAC',
  chery: 'Chery',
  geely: 'Geely',
};

/**
 * Mapeo de variantes textuales de línea a su nombre canónico.
 * Las claves deben estar en minúsculas sin espacios extra.
 */
const LINEAS_CANONICAS: Record<string, string> = {
  // Chevrolet
  'spark gt': 'Spark GT', 'spark life': 'Spark Life', spark: 'Spark GT',
  aveo: 'Aveo', sail: 'Sail', optra: 'Optra', captiva: 'Captiva',
  tracker: 'Tracker', trax: 'Trax', blazer: 'Blazer', equinox: 'Equinox',
  traverse: 'Traverse', n300: 'N300', corsa: 'Corsa', sprint: 'Sprint',
  // Renault
  sandero: 'Sandero', logan: 'Logan', duster: 'Duster', kwid: 'Kwid',
  stepway: 'Stepway', clio: 'Clio', twingo: 'Twingo', kangoo: 'Kangoo',
  symbol: 'Symbol', koleos: 'Koleos', fluence: 'Fluence',
  // Kia
  picanto: 'Picanto', 'picanto ion': 'Picanto Ion',
  rio: 'Rio', sportage: 'Sportage', cerato: 'Cerato', soluto: 'Soluto',
  sephia: 'Sephia', sorento: 'Sorento', stinger: 'Stinger',
  // Mazda
  'mazda 2': 'Mazda 2', 'mazda 3': 'Mazda 3', 'mazda 6': 'Mazda 6',
  'm2': 'Mazda 2', 'm3': 'Mazda 3', '323': 'Mazda 323', allegro: 'Mazda Allegro',
  'cx-5': 'CX-5', 'cx-9': 'CX-9',
  // Toyota
  corolla: 'Corolla', hilux: 'Hilux', prado: 'Prado', fortuner: 'Fortuner',
  rav4: 'RAV4', yaris: 'Yaris', txl: 'TXL',
  // Nissan
  march: 'March', versa: 'Versa', frontier: 'Frontier', sentra: 'Sentra',
  qashqai: 'Qashqai', murano: 'Murano',
  // Hyundai
  i10: 'i10', accent: 'Accent', tucson: 'Tucson', santa: 'Santa Fe',
  'santa fe': 'Santa Fe', elantra: 'Elantra',
  // Suzuki
  swift: 'Swift', vitara: 'Vitara', 'grand vitara': 'Grand Vitara',
  // Honda
  civic: 'Civic', 'cr-v': 'CR-V', fit: 'Fit', accord: 'Accord',
  // Volkswagen
  polo: 'Polo', golf: 'Golf', jetta: 'Jetta', tiguan: 'Tiguan',
  // Ford
  fiesta: 'Fiesta', focus: 'Focus', explorer: 'Explorer', escape: 'Escape',
};

/**
 * Normaliza una marca a su nombre canónico o retorna capitalizada si no está en el dict.
 */
function normalizarMarca(marcaRaw: string): string {
  const key = marcaRaw.trim().toLowerCase();
  return MARCAS_CANONICAS[key] ?? capitalizar(marcaRaw.trim());
}

/**
 * Normaliza una línea a su nombre canónico o retorna capitalizada si no está en el dict.
 */
function normalizarLinea(lineaRaw: string): string {
  const key = lineaRaw.trim().toLowerCase();
  return LINEAS_CANONICAS[key] ?? capitalizar(lineaRaw.trim());
}

// ─── Diccionario de Servicios Mecánicos Canónicos ─────────────────────────────

interface ServicioCanonicoEntry {
  nombre: string;
  categoria: string;
}

/**
 * Palabras clave en descripciones de ítems → nombre canónico y categoría.
 * Se evalúan en orden: la primera coincidencia gana.
 */
const SERVICIOS_CANONICOS: Array<{ keywords: string[]; canonical: ServicioCanonicoEntry }> = [
  // Frenos
  { keywords: ['pastilla freno del', 'pastilla del', 'pastillas del'], canonical: { nombre: 'Pastillas de freno delanteras', categoria: 'Sistema de Frenos' } },
  { keywords: ['pastilla freno tras', 'pastilla tras', 'pastillas tras'], canonical: { nombre: 'Pastillas de freno traseras', categoria: 'Sistema de Frenos' } },
  { keywords: ['pastilla'], canonical: { nombre: 'Pastillas de freno', categoria: 'Sistema de Frenos' } },
  { keywords: ['disco freno del', 'disco del'], canonical: { nombre: 'Disco de freno delantero', categoria: 'Sistema de Frenos' } },
  { keywords: ['disco freno tras', 'disco tras'], canonical: { nombre: 'Disco de freno trasero', categoria: 'Sistema de Frenos' } },
  { keywords: ['disco', 'discos de freno'], canonical: { nombre: 'Disco de freno', categoria: 'Sistema de Frenos' } },
  { keywords: ['liquido freno', 'líquido de frenos', 'fluido freno'], canonical: { nombre: 'Líquido de frenos (cambio)', categoria: 'Sistema de Frenos' } },
  { keywords: ['bomba freno', 'bomba de frenos'], canonical: { nombre: 'Bomba de frenos', categoria: 'Sistema de Frenos' } },
  { keywords: ['calibrador', 'mordaza', 'caliper'], canonical: { nombre: 'Calibrador / Caliper de freno', categoria: 'Sistema de Frenos' } },
  // Aceite y Mantenimiento Preventivo
  { keywords: ['cambio aceite', 'aceite + filtro', 'aceite y filtro'], canonical: { nombre: 'Cambio de aceite + filtro', categoria: 'Mantenimiento Preventivo' } },
  { keywords: ['aceite'], canonical: { nombre: 'Aceite de motor', categoria: 'Mantenimiento Preventivo' } },
  { keywords: ['filtro aceite'], canonical: { nombre: 'Filtro de aceite', categoria: 'Mantenimiento Preventivo' } },
  { keywords: ['filtro aire'], canonical: { nombre: 'Filtro de aire', categoria: 'Mantenimiento Preventivo' } },
  { keywords: ['filtro combustible', 'filtro gasolina'], canonical: { nombre: 'Filtro de combustible', categoria: 'Mantenimiento Preventivo' } },
  { keywords: ['bujia', 'bujías', 'bujias'], canonical: { nombre: 'Bujías', categoria: 'Mantenimiento Preventivo' } },
  { keywords: ['correa distribucion', 'correa de distribución'], canonical: { nombre: 'Correa de distribución', categoria: 'Mantenimiento Preventivo' } },
  { keywords: ['correa accesorios', 'correa serpentine'], canonical: { nombre: 'Correa de accesorios', categoria: 'Mantenimiento Preventivo' } },
  { keywords: ['afinacion', 'afinación', 'tune up', 'tuneup'], canonical: { nombre: 'Afinación preventiva', categoria: 'Mantenimiento Preventivo' } },
  // Suspensión
  { keywords: ['amortiguador del', 'amortiguadores del'], canonical: { nombre: 'Amortiguador delantero', categoria: 'Suspensión' } },
  { keywords: ['amortiguador tras', 'amortiguadores tras'], canonical: { nombre: 'Amortiguador trasero', categoria: 'Suspensión' } },
  { keywords: ['amortiguador'], canonical: { nombre: 'Amortiguador', categoria: 'Suspensión' } },
  { keywords: ['rotula', 'rótula'], canonical: { nombre: 'Rótula', categoria: 'Suspensión' } },
  { keywords: ['buje', 'bujes', 'buje de barra'], canonical: { nombre: 'Bujes de barra estabilizadora', categoria: 'Suspensión' } },
  { keywords: ['rodamiento', 'rodaje', 'bearing del', 'bearing tras'], canonical: { nombre: 'Rodamiento / Rodaje', categoria: 'Suspensión' } },
  { keywords: ['barra estabilizadora', 'barra estab'], canonical: { nombre: 'Barra estabilizadora', categoria: 'Suspensión' } },
  { keywords: ['alineacion', 'alineación'], canonical: { nombre: 'Alineación de dirección', categoria: 'Suspensión' } },
  { keywords: ['balanceo'], canonical: { nombre: 'Balanceo de ruedas', categoria: 'Suspensión' } },
  // Aire Acondicionado
  { keywords: ['recarga gas', 'recarga refrigerante', 'carga gas aire'], canonical: { nombre: 'Recarga de gas A/C', categoria: 'Aire Acondicionado' } },
  { keywords: ['compresor aire', 'compresor a/c', 'compresor ac'], canonical: { nombre: 'Compresor de A/C', categoria: 'Aire Acondicionado' } },
  { keywords: ['filtro habitaculo', 'filtro cabina', 'filtro polen'], canonical: { nombre: 'Filtro de habitáculo', categoria: 'Aire Acondicionado' } },
  { keywords: ['condensador aire', 'condensador a/c'], canonical: { nombre: 'Condensador de A/C', categoria: 'Aire Acondicionado' } },
  // Motor y Transmisión
  { keywords: ['empaque culata', 'junta culata'], canonical: { nombre: 'Empaque de culata', categoria: 'Motor y Transmisión' } },
  { keywords: ['termostato'], canonical: { nombre: 'Termostato', categoria: 'Motor y Transmisión' } },
  { keywords: ['bomba agua', 'bomba de agua'], canonical: { nombre: 'Bomba de agua', categoria: 'Motor y Transmisión' } },
  { keywords: ['radiador'], canonical: { nombre: 'Radiador', categoria: 'Motor y Transmisión' } },
  { keywords: ['liquido refrigerante', 'anticongelante'], canonical: { nombre: 'Líquido refrigerante', categoria: 'Motor y Transmisión' } },
  { keywords: ['sensor oxigeno', 'sensor de oxígeno', 'sonda lambda'], canonical: { nombre: 'Sensor de oxígeno', categoria: 'Motor y Transmisión' } },
  { keywords: ['sensor maf', 'sensor de masa de aire'], canonical: { nombre: 'Sensor MAF', categoria: 'Motor y Transmisión' } },
  { keywords: ['inyector'], canonical: { nombre: 'Inyector de combustible', categoria: 'Motor y Transmisión' } },
  { keywords: ['bomba combustible', 'bomba gasolina'], canonical: { nombre: 'Bomba de combustible', categoria: 'Motor y Transmisión' } },
  { keywords: ['aceite caja', 'aceite transmision', 'aceite de transmisión'], canonical: { nombre: 'Aceite de transmisión', categoria: 'Motor y Transmisión' } },
  // Sistema Eléctrico
  { keywords: ['bateria', 'batería'], canonical: { nombre: 'Batería', categoria: 'Eléctrico' } },
  { keywords: ['alternador'], canonical: { nombre: 'Alternador', categoria: 'Eléctrico' } },
  { keywords: ['motor arranque', 'starter'], canonical: { nombre: 'Motor de arranque', categoria: 'Eléctrico' } },
  // Diagnóstico
  { keywords: ['diagnostico', 'diagnóstico escaner', 'scanner', 'escaneo'], canonical: { nombre: 'Diagnóstico electrónico', categoria: 'Diagnóstico' } },
  // Mano de Obra Genérica
  { keywords: ['mano de obra', 'mano obra', 'm.o.'], canonical: { nombre: 'Mano de obra', categoria: 'Mano de Obra' } },
];

/**
 * Intenta encontrar un nombre canónico y categoría para una descripción de ítem.
 * Retorna null si no hay coincidencia (se usará la descripción original capitalizada).
 */
function canonizarItem(descripcion: string): ServicioCanonicoEntry | null {
  const lower = descripcion.toLowerCase();
  for (const entry of SERVICIOS_CANONICOS) {
    if (entry.keywords.some(kw => lower.includes(kw))) {
      return entry.canonical;
    }
  }
  return null;
}

// ─── Tipos Exportados ──────────────────────────────────────────────────────────

/**
 * Estructura de un ítem de catálogo del taller (derivado de items_factura)
 */
interface ItemCatalogo {
  descripcion: string;
  tipo: 'repuesto' | 'mano_obra';
  precio_min: number;
  precio_max: number;
  precio_promedio: number;
  ocurrencias: number;
}

/**
 * Estructura del catálogo completo de un taller
 */
export interface CatalogoTaller {
  nombre: string;
  telefono: string | null;
  config_ai: {
    activo: boolean;
    modo_precios: 'rangos' | 'exacto';
    presupuesto_diario_usd: number;
    telefono_leads: string | null;
    email_notificaciones: string | null;
  };
  empresa_id: string;
  repuestos: ItemCatalogo[];
  mano_obra: ItemCatalogo[];
}

// ─── Ítem de Matriz de Precios (por vehículo) ─────────────────────────────────

export interface ItemMatriz {
  key: string;              // clave compuesta (tipo::descripcion_canonizada)
  nombre: string;
  categoria: string;
  tipo: 'repuesto' | 'mano_obra';
  precio_min: number;
  precio_max: number;
  precio_promedio: number;
  ocurrencias: number;
}

export interface VehiculoDisponible {
  marca: string;
  linea: string;
}

export interface AuditoriaItemRow {
  fecha: string;           // e.g. "Noviembre 2025"
  modelo_anio: number | null;
  valor_cobrado: number;   // con delta de modo_precios aplicado
  placa_enmascarada: string; // e.g. "ABC-***"
  nombre_servicio: string; // Nombre canónico sanitizado (evita exponer texto libre del técnico)
}

// ─── Funciones de Consulta: Catálogo de IA (Chatbot) ──────────────────────────

/**
 * Servicio de Catálogo de Precios por Taller (para el chatbot IA).
 * Ventana: últimos 60 días.
 */
export async function obtenerCatalogoTaller(slug: string): Promise<CatalogoTaller | null> {
  // 1. Obtener datos de la empresa
  const { data: empresa, error: errEmpresa } = await supabase
    .from('taller_empresas')
    .select('id, nombre, telefono_contacto, config_ai')
    .eq('slug', slug)
    .single();

  if (errEmpresa || !empresa) {
    return null;
  }

  // 2. Verificar que el módulo IA esté activo para este taller
  const configAI = empresa.config_ai ?? {
    activo: true,
    modo_precios: 'rangos',
    presupuesto_diario_usd: 0.50,
    telefono_leads: null,
    email_notificaciones: null,
  };

  if (!configAI.activo) {
    return null; // Módulo desactivado por el taller
  }

  // 3. Obtener los últimos 60 días de ítems facturados para construir catálogo
  const hace60Dias = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

  const { data: ingresos, error: errIngresos } = await supabase
    .from('taller_ingresos')
    .select('items_factura')
    .eq('empresa_id', empresa.id)
    .eq('estado', 'entregado')
    .gte('updated_at', hace60Dias)
    .not('items_factura', 'is', null);

  // Agregar ítems por descripción y tipo para calcular precios representativos
  const agregados: Record<string, {
    tipo: 'repuesto' | 'mano_obra';
    precios: number[];
  }> = {};

  if (!errIngresos && ingresos) {
    for (const ingreso of ingresos) {
      for (const item of (ingreso.items_factura || [])) {
        if (!item.descripcion || !item.precio_unitario) continue;

        const clave = `${item.tipo}::${item.descripcion.toLowerCase().trim()}`;

        if (!agregados[clave]) {
          agregados[clave] = { tipo: item.tipo, precios: [] };
        }
        agregados[clave].precios.push(Number(item.precio_unitario));
      }
    }
  }

  // 4. Construir catálogo ordenado por frecuencia (los más comunes primero)
  const modoPrecios = configAI.modo_precios ?? 'rangos';

  const todosLosItems: ItemCatalogo[] = Object.entries(agregados)
    .filter(([, v]) => v.precios.length >= 1)
    .map(([clave, v]) => {
      const [, descripcion] = clave.split('::');
      const sorted = [...v.precios].sort((a, b) => a - b);
      const min = sorted[0];
      const max = sorted[sorted.length - 1];
      const promedio = Math.round(v.precios.reduce((a, b) => a + b, 0) / v.precios.length);

      return {
        descripcion: capitalizar(descripcion),
        tipo: v.tipo,
        precio_min: aplicarDelta(modoPrecios, min, -0.10),
        precio_max: aplicarDelta(modoPrecios, max, 0.15),
        precio_promedio: aplicarDelta(modoPrecios, promedio, 0),
        ocurrencias: v.precios.length,
      };
    })
    .sort((a, b) => b.ocurrencias - a.ocurrencias);

  const repuestos = todosLosItems.filter(i => i.tipo === 'repuesto').slice(0, 40);
  const manoObra = todosLosItems.filter(i => i.tipo === 'mano_obra').slice(0, 30);

  return {
    nombre: empresa.nombre,
    telefono: empresa.telefono_contacto ?? configAI.telefono_leads ?? null,
    config_ai: configAI,
    empresa_id: empresa.id,
    repuestos,
    mano_obra: manoObra,
  };
}

// ─── Funciones de Consulta: Matriz de Precios Pública ─────────────────────────

/**
 * Obtiene los datos base de la empresa validando que exista y tenga config_ai.activo.
 * Si tenantId y config_ai ya fueron resueltos por tenantGuard downstream, los reutiliza
 * directamente sin ejecutar consultas adicionales a Supabase.
 */
async function obtenerEmpresaYConfig(
  slug: string,
  tenantId?: string,
  empresaConfigAI?: CatalogoTaller['config_ai']
): Promise<{
  id: string;
  config_ai: CatalogoTaller['config_ai'];
} | null> {
  if (tenantId && empresaConfigAI) {
    return { id: tenantId, config_ai: empresaConfigAI };
  }

  const { data: empresa, error } = await supabase
    .from('taller_empresas')
    .select('id, config_ai')
    .eq('slug', slug)
    .single();

  if (error || !empresa || !empresa.config_ai?.activo) return null;
  return { id: empresa.id, config_ai: empresa.config_ai };
}

// ─── Funciones de Persistencia Incremental ────────────────────────────────────

/**
 * Hook disparado cuando un ingreso pasa a estado 'entregado' o se editan sus ítems.
 * 1. Obtiene las claves previas asociadas a este ingreso_id.
 * 2. Limpia los registros anteriores de este ingreso en taller_precios_items_entregados.
 * 3. Inserta los nuevos ítems normalizados y anonimizados.
 * 4. Invoca la función atómica RPC 'recalcular_bucket_matriz' para la unión (oldKeys U newKeys).
 * 5. Invalida la caché en memoria.
 */
export async function sincronizarPreciosOrdenEntregada(
  empresaId: string,
  ingresoId: string,
  vehiculo: { marca?: string; linea?: string; modelo_anio?: number; placa?: string } | null,
  itemsFactura: any[],
  fechaEntrega?: string
): Promise<void> {
  try {
    if (!vehiculo?.marca || !vehiculo?.linea) return;

    const marcaNorm = normalizarMarca(vehiculo.marca);
    const lineaNorm = normalizarLinea(vehiculo.linea);
    const placaMascarada = vehiculo.placa
      ? `${vehiculo.placa.trim().slice(0, 3).toUpperCase()}-***`
      : '???-***';
    const modeloAnio = vehiculo.modelo_anio ? Number(vehiculo.modelo_anio) : null;
    const fechaReal = fechaEntrega || new Date().toISOString();

    // 1. Obtener item_keys que existían antes para este ingreso
    const { data: prevRows } = await supabase
      .from('taller_precios_items_entregados')
      .select('item_key')
      .eq('ingreso_id', ingresoId);

    const oldKeys: string[] = (prevRows || []).map((r: any) => r.item_key);

    // 2. Limpiar filas previas de este ingreso
    await supabase
      .from('taller_precios_items_entregados')
      .delete()
      .eq('ingreso_id', ingresoId);

    // 3. Normalizar e insertar los nuevos ítems válidos
    const validItems: any[] = [];
    const newKeys: string[] = [];

    for (const item of (itemsFactura || [])) {
      if (!item.descripcion || item.precio_unitario === undefined || item.precio_unitario === null) continue;
      const precioNum = Number(item.precio_unitario);
      if (isNaN(precioNum) || precioNum <= 0) continue;

      const canonical = canonizarItem(item.descripcion);
      const nombreServicio = canonical?.nombre ?? capitalizar(item.descripcion.trim());
      const categoria = canonical?.categoria ?? (item.categoria_crm ? capitalizar(item.categoria_crm) : 'Otros');
      const tipo = (item.tipo === 'mano_obra' ? 'mano_obra' : 'repuesto') as 'mano_obra' | 'repuesto';
      const itemKey = `${tipo}::${nombreServicio.toLowerCase()}`;

      newKeys.push(itemKey);
      validItems.push({
        empresa_id: empresaId,
        ingreso_id: ingresoId,
        marca: marcaNorm,
        linea: lineaNorm,
        modelo_anio: modeloAnio,
        placa_enmascarada: placaMascarada,
        tipo,
        item_key: itemKey,
        nombre_servicio: nombreServicio,
        categoria,
        precio_unitario: precioNum,
        fecha_entrega: fechaReal,
      });
    }

    if (validItems.length > 0) {
      const { error: insertErr } = await supabase
        .from('taller_precios_items_entregados')
        .insert(validItems);

      if (insertErr) {
        console.error('[PreciosSync] Error insertando ítems entregados:', insertErr.message);
      }
    }

    // 4. Ejecutar RPC atómico para la unión de buckets afectados (viejos U nuevos)
    const affectedKeys = Array.from(new Set([...oldKeys, ...newKeys]));
    for (const k of affectedKeys) {
      const { error: rpcErr } = await supabase.rpc('recalcular_bucket_matriz', {
        p_empresa_id: empresaId,
        p_marca: marcaNorm,
        p_linea: lineaNorm,
        p_item_key: k,
      });
      if (rpcErr) {
        console.error(`[PreciosSync] Error en recalcular_bucket_matriz para ${k}:`, rpcErr.message);
      }
    }

    // 5. Invalidar caché en memoria correctamente (coincide con claves vehiculos:* y matriz:*)
    invalidarCacheVehiculo(marcaNorm, lineaNorm);
  } catch (err: any) {
    console.error('[PreciosSync] Error inesperado sincronizando precios de orden:', err.message);
  }
}

/**
 * Hook disparado si una orden que estaba en 'entregado' se cancela.
 */
export async function eliminarPreciosOrdenEntregada(
  empresaId: string,
  ingresoId: string
): Promise<void> {
  try {
    const { data: prevRows } = await supabase
      .from('taller_precios_items_entregados')
      .select('marca, linea, item_key')
      .eq('ingreso_id', ingresoId);

    if (!prevRows || prevRows.length === 0) return;

    await supabase
      .from('taller_precios_items_entregados')
      .delete()
      .eq('ingreso_id', ingresoId);

    for (const r of prevRows) {
      await supabase.rpc('recalcular_bucket_matriz', {
        p_empresa_id: empresaId,
        p_marca: r.marca,
        p_linea: r.linea,
        p_item_key: r.item_key,
      });
      invalidarCacheVehiculo(r.marca, r.linea);
    }
  } catch (err: any) {
    console.error('[PreciosSync] Error al eliminar precios de orden cancelada:', err.message);
  }
}

// ─── Funciones de Consulta: Matriz de Precios Pública (Lectura Directa) ─────────

/**
 * Retorna la lista de marcas y líneas disponibles leyendo directamente
 * de la tabla persistente taller_matriz_precios (ocurrencias >= 3).
 * Usa caché con TTL de 15 min.
 */
export async function obtenerVehiculosDisponibles(
  slug: string,
  tenantId?: string,
  configAI?: CatalogoTaller['config_ai']
): Promise<VehiculoDisponible[]> {
  const cacheKey = `vehiculos:${slug}`;
  const cached = cacheGet<VehiculoDisponible[]>(cacheKey);
  if (cached) return cached;

  const empresa = await obtenerEmpresaYConfig(slug, tenantId, configAI);
  if (!empresa) return [];

  const { data, error } = await supabase
    .from('taller_matriz_precios')
    .select('marca, linea')
    .eq('empresa_id', empresa.id)
    .gte('ocurrencias', 3);

  if (error || !data) return [];

  const seen = new Set<string>();
  const resultado: VehiculoDisponible[] = [];

  for (const row of data) {
    const key = `${row.marca}::${row.linea}`;
    if (!seen.has(key)) {
      seen.add(key);
      resultado.push({ marca: row.marca, linea: row.linea });
    }
  }

  resultado.sort((a, b) => a.marca.localeCompare(b.marca) || a.linea.localeCompare(b.linea));
  cacheSet(cacheKey, resultado);
  return resultado;
}

/**
 * Retorna la matriz de precios para un vehículo específico leyendo directamente
 * de taller_matriz_precios en < 2ms y aplicando el delta de modo_precios.
 * Usa caché con TTL de 15 min.
 */
export async function obtenerMatrizPreciosVehiculo(
  slug: string,
  marcaInput: string,
  lineaInput: string,
  tenantId?: string,
  configAI?: CatalogoTaller['config_ai']
): Promise<ItemMatriz[]> {
  const marcaNorm = normalizarMarca(marcaInput);
  const lineaNorm = normalizarLinea(lineaInput);
  const cacheKey = `matriz:${slug}:${marcaNorm}:${lineaNorm}`;
  const cached = cacheGet<ItemMatriz[]>(cacheKey);
  if (cached) return cached;

  const empresa = await obtenerEmpresaYConfig(slug, tenantId, configAI);
  if (!empresa) return [];

  const modoPrecios = empresa.config_ai.modo_precios ?? 'rangos';

  const { data, error } = await supabase
    .from('taller_matriz_precios')
    .select('item_key, nombre_servicio, categoria, tipo, precio_min, precio_max, precio_promedio, ocurrencias')
    .eq('empresa_id', empresa.id)
    .eq('marca', marcaNorm)
    .eq('linea', lineaNorm)
    .gte('ocurrencias', 3)
    .order('ocurrencias', { ascending: false });

  if (error || !data) return [];

  const resultado: ItemMatriz[] = data.map((row: any) => ({
    key: row.item_key,
    nombre: row.nombre_servicio,
    categoria: row.categoria,
    tipo: row.tipo,
    precio_min: aplicarDelta(modoPrecios, Number(row.precio_min), -0.10),
    precio_max: aplicarDelta(modoPrecios, Number(row.precio_max), 0.15),
    precio_promedio: aplicarDelta(modoPrecios, Number(row.precio_promedio), 0),
    ocurrencias: row.ocurrencias,
  }));

  cacheSet(cacheKey, resultado);
  return resultado;
}

/**
 * Retorna los casos individuales que componen el promedio de un ítem,
 * consultando directamente la tabla persistida taller_precios_items_entregados.
 * HABEAS DATA: Placa enmascarada y nombre de servicio canónico sanitizado.
 */
export async function obtenerAuditoriaItem(
  slug: string,
  marcaInput: string,
  lineaInput: string,
  itemKey: string,
  tenantId?: string,
  configAI?: CatalogoTaller['config_ai']
): Promise<AuditoriaItemRow[]> {
  const empresa = await obtenerEmpresaYConfig(slug, tenantId, configAI);
  if (!empresa) return [];

  const modoPrecios = empresa.config_ai.modo_precios ?? 'rangos';
  const marcaNorm = normalizarMarca(marcaInput);
  const lineaNorm = normalizarLinea(lineaInput);

  const { data, error } = await supabase
    .from('taller_precios_items_entregados')
    .select('fecha_entrega, modelo_anio, precio_unitario, placa_enmascarada, nombre_servicio')
    .eq('empresa_id', empresa.id)
    .eq('marca', marcaNorm)
    .eq('linea', lineaNorm)
    .eq('item_key', itemKey)
    .order('fecha_entrega', { ascending: false })
    .limit(20);

  if (error || !data) return [];

  return data.map((row: any) => {
    const valorConDelta = aplicarDelta(modoPrecios, Number(row.precio_unitario), 0);
    const fecha = new Date(row.fecha_entrega);
    const fechaFormateada = fecha.toLocaleDateString('es-CO', {
      month: 'long',
      year: 'numeric',
      timeZone: 'America/Bogota',
    });

    return {
      fecha: capitalizar(fechaFormateada),
      modelo_anio: row.modelo_anio ?? null,
      valor_cobrado: valorConDelta,
      placa_enmascarada: row.placa_enmascarada,
      nombre_servicio: row.nombre_servicio,
    };
  });
}

// ─── Formateador para el Chatbot IA ───────────────────────────────────────────

/**
 * Formatea el catálogo en texto legible optimizado para el system prompt de Gemini/OpenAI.
 * Se aplica formato Markdown para facilitar la comprensión del modelo.
 */
export function formatearCatalogoParaPrompt(catalogo: CatalogoTaller): string {
  const modoStr = catalogo.config_ai.modo_precios === 'rangos' ? 'RANGOS ORIENTATIVOS' : 'PRECIOS DE REFERENCIA';
  const lineas: string[] = [`### Catálogo de ${modoStr} en COP (Pesos Colombianos)\n`];

  if (catalogo.mano_obra.length > 0) {
    lineas.push('**Mano de Obra:**');
    for (const item of catalogo.mano_obra) {
      if (item.precio_min === item.precio_max) {
        lineas.push(`- ${item.descripcion}: $${formatCOP(item.precio_promedio)}`);
      } else {
        lineas.push(`- ${item.descripcion}: $${formatCOP(item.precio_min)} – $${formatCOP(item.precio_max)}`);
      }
    }
  }

  if (catalogo.repuestos.length > 0) {
    lineas.push('\n**Repuestos y Materiales:**');
    for (const item of catalogo.repuestos) {
      if (item.precio_min === item.precio_max) {
        lineas.push(`- ${item.descripcion}: $${formatCOP(item.precio_promedio)}`);
      } else {
        lineas.push(`- ${item.descripcion}: $${formatCOP(item.precio_min)} – $${formatCOP(item.precio_max)}`);
      }
    }
  }

  if (lineas.length <= 1) {
    lineas.push('_El taller aún no cuenta con un catálogo configurado. Ofrece rangos de mercado para Colombia._');
  }

  return lineas.join('\n');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function aplicarDelta(modo: string, precio: number, delta: number): number {
  if (modo !== 'rangos' || delta === 0) return Math.round(precio);
  return Math.round(precio * (1 + delta));
}

function formatCOP(valor: number): string {
  return new Intl.NumberFormat('es-CO').format(Math.round(valor));
}

function capitalizar(texto: string): string {
  if (!texto) return texto;
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

