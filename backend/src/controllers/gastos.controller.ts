import { Request, Response } from 'express';
import { supabase } from '../config/supabase';
import { bogotaToday } from '../utils/dateUtils';
import {
  obtenerVentanaConsultaGastos,
  calcularGastosPeriodoConProrrateo,
} from '../utils/gastosProrrateo';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function esFechaValida(fecha: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
  const [y, m, d] = fecha.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function esUrlValida(url: string): boolean {
  if (typeof url !== 'string' || url.length > 2048) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || (process.env.NODE_ENV !== 'production' && parsed.protocol === 'http:');
  } catch {
    return false;
  }
}

async function validarCategoria(
  empresaId: string,
  categoriaId: string
): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase
    .from('taller_categorias_gastos')
    .select('id')
    .eq('id', categoriaId)
    .eq('empresa_id', empresaId)
    .maybeSingle();

  if (error || !data) {
    return { ok: false, error: 'La categoría especificada no existe o no pertenece a tu taller.' };
  }
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// CATEGORÍAS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/gastos/categorias
 * Lista las categorías activas de la empresa.
 */
export const getCategorias = async (req: Request, res: Response): Promise<void> => {
  try {
    const { data, error } = await supabase
      .from('taller_categorias_gastos')
      .select('id, nombre, color, icono, es_default, activa')
      .eq('empresa_id', req.empresa_id)
      .eq('activa', true)
      .order('nombre');
    if (error) throw error;
    res.json(data || []);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * POST /api/gastos/categorias
 * Crea una categoría personalizada para la empresa.
 */
export const createCategoria = async (req: Request, res: Response): Promise<void> => {
  try {
    const { nombre, color, icono } = req.body;
    if (!nombre?.trim()) {
      res.status(400).json({ error: 'El nombre de la categoría es obligatorio.' });
      return;
    }
    const { data, error } = await supabase
      .from('taller_categorias_gastos')
      .insert([{ empresa_id: req.empresa_id, nombre: nombre.trim(), color: color || '#6366f1', icono: icono || 'tag' }])
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * PUT /api/gastos/categorias/:id
 * Actualiza nombre/color/icono de una categoría de la empresa.
 */
export const updateCategoria = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { nombre, color, icono, activa } = req.body;
    const { data, error } = await supabase
      .from('taller_categorias_gastos')
      .update({ nombre, color, icono, activa })
      .eq('id', id)
      .eq('empresa_id', req.empresa_id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * DELETE /api/gastos/categorias/:id
 * Soft-delete: desactiva la categoría (no la borra para preservar histórico).
 */
export const deleteCategoria = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { error } = await supabase
      .from('taller_categorias_gastos')
      .update({ activa: false })
      .eq('id', id)
      .eq('empresa_id', req.empresa_id)
      .eq('es_default', false); // No se pueden eliminar las categorías base
    if (error) throw error;
    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * POST /api/gastos/categorias/inicializar
 * Inicializa las categorías por defecto para la empresa actual.
 * Se llama una sola vez al activar el módulo.
 */
export const inicializarCategorias = async (req: Request, res: Response): Promise<void> => {
  try {
    const { error } = await supabase.rpc('inicializar_categorias_gastos', {
      p_empresa_id: req.empresa_id
    });
    if (error) throw error;
    res.json({ ok: true, message: 'Categorías por defecto inicializadas.' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GASTOS EJECUTADOS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Helper: valida que un vínculo orden-ítem sea válido para el tenant.
 * - ingreso_id debe existir y pertenecer a empresaId.
 * - Si viene item_id, debe existir en items_factura de esa orden y ser tipo === 'repuesto'.
 * - item_id sin ingreso_id se rechaza.
 */
async function validarVinculo(
  empresaId: string,
  ingresoId?: string | null,
  itemId?: string | null
): Promise<{ ok: boolean; error?: string; status?: number }> {
  if (itemId && !ingresoId) {
    return { ok: false, error: 'No se puede vincular un ítem sin especificar la orden de servicio.', status: 400 };
  }

  if (!ingresoId) {
    return { ok: true };
  }

  const { data: orden, error } = await supabase
    .from('taller_ingresos')
    .select('id, items_factura')
    .eq('id', ingresoId)
    .eq('empresa_id', empresaId)
    .single();

  if (error || !orden) {
    return { ok: false, error: 'La orden de servicio especificada no existe o no pertenece a tu taller.', status: 404 };
  }

  if (itemId) {
    const items = Array.isArray(orden.items_factura) ? orden.items_factura : [];
    const itemEncontrado = items.find((i: any) => i && i.id === itemId);
    if (!itemEncontrado) {
      return { ok: false, error: `El ítem con ID '${itemId}' no existe en la orden de servicio.`, status: 400 };
    }
    if (itemEncontrado.tipo !== 'repuesto') {
      return { ok: false, error: 'Solo se pueden vincular gastos a ítems de tipo repuesto.', status: 400 };
    }
  }

  return { ok: true };
}

/**
 * GET /api/gastos
 * Lista gastos con filtros opcionales: desde, hasta, categoria_id, ingreso_id, sin_vincular.
 */
export const getGastos = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      desde,
      hasta,
      categoria_id,
      ingreso_id,
      sin_vincular,
      prorratear,
      page = '1',
      limit = '50',
    } = req.query;
    const limitNum = Math.max(1, parseInt(limit as string) || 50);
    const offset = (parseInt(page as string) - 1) * limitNum;

    // ── Modo Prorrateado (para Reportes Financieros en vistas cortas/semanales) ──
    if (
      prorratear === 'true' &&
      typeof desde === 'string' &&
      typeof hasta === 'string' &&
      esFechaValida(desde) &&
      esFechaValida(hasta)
    ) {
      const { queryStart, queryEnd } = obtenerVentanaConsultaGastos(desde, hasta);

      // Paginado explícito para no truncar la ventana de ~13 meses por el límite de filas de Supabase.
      const PAGE_SIZE = 1000;
      const gastosVentana: any[] = [];
      let pageOffset = 0;
      while (true) {
        let prorrateoQuery = supabase
          .from('taller_gastos')
          .select(`
            id, fecha, descripcion, monto, proveedor, comprobante_url,
            tipo, plantilla_id, notas, created_at, ingreso_id, item_id,
            taller_categorias_gastos(id, nombre, color, icono),
            taller_gastos_recurrentes(id, nombre, frecuencia),
            taller_ingresos(id, estado, fecha_ingreso, taller_vehiculos(placa, marca, linea))
          `)
          .eq('empresa_id', req.empresa_id)
          .gte('fecha', queryStart)
          .lte('fecha', queryEnd)
          .order('id', { ascending: true })
          .range(pageOffset, pageOffset + PAGE_SIZE - 1);

        if (categoria_id) prorrateoQuery = prorrateoQuery.eq('categoria_id', categoria_id as string);
        if (ingreso_id) prorrateoQuery = prorrateoQuery.eq('ingreso_id', ingreso_id as string);
        if (sin_vincular === 'true') prorrateoQuery = prorrateoQuery.is('ingreso_id', null);

        const { data: pagina, error: errProrrateo } = await prorrateoQuery;
        if (errProrrateo) throw errProrrateo;
        const filas = pagina || [];
        gastosVentana.push(...filas);
        if (filas.length < PAGE_SIZE) break;
        pageOffset += PAGE_SIZE;
      }

      let plantillasQuery = supabase
        .from('taller_gastos_recurrentes')
        .select(`
          id, nombre, monto_estimado, frecuencia, dia_del_mes, dia_semana,
          activa, fecha_inicio, fecha_fin, categoria_id,
          taller_categorias_gastos(id, nombre, color, icono)
        `)
        .eq('empresa_id', req.empresa_id)
        .eq('activa', true);

      if (categoria_id) {
        plantillasQuery = plantillasQuery.eq('categoria_id', categoria_id as string);
      }

      const { data: plantillasActivas, error: errPlantillas } = await plantillasQuery;
      if (errPlantillas) throw errPlantillas;

      const resultado = calcularGastosPeriodoConProrrateo(
        gastosVentana,
        desde,
        hasta,
        plantillasActivas || []
      );
      const paginados = resultado.gastosDetalle.slice(offset, offset + limitNum);

      res.json({
        gastos: paginados,
        total: resultado.gastosDetalle.length,
        totalMonto: resultado.totalGastos,
        totalGastosDirectos: resultado.totalGastosDirectos,
        totalGastosFijos: resultado.totalGastosFijosProrrateados,
        diasPeriodo: resultado.diasPeriodo,
      });
      return;
    }

    // ── Query base (sin paginación) para obtener el total monetario real ──
    // Así el totalMonto siempre refleja el período completo, no solo la página actual.
    let baseQuery = supabase
      .from('taller_gastos')
      .select('monto', { count: 'exact' })
      .eq('empresa_id', req.empresa_id);

    if (desde) baseQuery = baseQuery.gte('fecha', desde as string);
    if (hasta) baseQuery = baseQuery.lte('fecha', hasta as string);
    if (categoria_id) baseQuery = baseQuery.eq('categoria_id', categoria_id as string);
    if (ingreso_id) baseQuery = baseQuery.eq('ingreso_id', ingreso_id as string);
    if (sin_vincular === 'true') baseQuery = baseQuery.is('ingreso_id', null);

    const { data: allMontos, count } = await baseQuery;
    const totalMonto = (allMontos || []).reduce(
      (acc: number, g: any) => acc + Number(g.monto || 0), 0
    );

    // ── Query paginada para la tabla ──────────────────────────────
    let query = supabase
      .from('taller_gastos')
      .select(`
        id, fecha, descripcion, monto, proveedor, comprobante_url,
        tipo, notas, created_at, ingreso_id, item_id,
        taller_categorias_gastos(id, nombre, color, icono),
        taller_gastos_recurrentes(id, nombre),
        taller_ingresos(id, estado, fecha_ingreso, taller_vehiculos(placa, marca, linea))
      `)
      .eq('empresa_id', req.empresa_id)
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + parseInt(limit as string) - 1);

    if (desde) query = query.gte('fecha', desde as string);
    if (hasta) query = query.lte('fecha', hasta as string);
    if (categoria_id) query = query.eq('categoria_id', categoria_id as string);
    if (ingreso_id) query = query.eq('ingreso_id', ingreso_id as string);
    if (sin_vincular === 'true') query = query.is('ingreso_id', null);

    const { data, error } = await query;
    if (error) throw error;

    res.json({ gastos: data || [], total: count || 0, totalMonto });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * POST /api/gastos
 * Registra un nuevo gasto ejecutado (opcionalmente vinculado a orden e ítem).
 */
export const createGasto = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      fecha,
      categoria_id,
      descripcion,
      monto,
      proveedor,
      comprobante_url,
      tipo,
      plantilla_id,
      notas,
      ingreso_id,
      item_id
    } = req.body;

    if (!descripcion || typeof descripcion !== 'string' || !descripcion.trim()) {
      res.status(400).json({ error: 'La descripción es obligatoria y debe ser texto.' });
      return;
    }
    const montoNum = Number(monto);
    if (!Number.isFinite(montoNum) || montoNum <= 0 || montoNum > 999_999_999) {
      res.status(400).json({ error: 'El monto debe ser un número válido mayor a cero y menor a 1.000 millones.' });
      return;
    }
    if (fecha && !esFechaValida(fecha)) {
      res.status(400).json({ error: 'La fecha no es válida (use formato YYYY-MM-DD).' });
      return;
    }

    if (comprobante_url && !esUrlValida(comprobante_url)) {
      res.status(400).json({ error: 'El comprobante debe ser una URL válida con protocolo https.' });
      return;
    }

    if (categoria_id) {
      const validacionCat = await validarCategoria(req.empresa_id!, categoria_id);
      if (!validacionCat.ok) {
        res.status(400).json({ error: validacionCat.error });
        return;
      }
    }

    if (ingreso_id || item_id) {
      const validacion = await validarVinculo(req.empresa_id!, ingreso_id, item_id);
      if (!validacion.ok) {
        res.status(validacion.status || 400).json({ error: validacion.error });
        return;
      }
    }

    // ── Cambio 6: Rechazar un segundo pago del mismo gasto en el mes si tiene el mismo monto o no tiene nota ──
    if (plantilla_id) {
      const fechaGasto = fecha || bogotaToday();
      const mesStr = fechaGasto.slice(0, 7);
      const mesInicio = `${mesStr}-01`;
      const [y, m] = mesStr.split('-').map(Number);
      const ultimoDia = new Date(Date.UTC(y, m, 0, 12, 0, 0)).getUTCDate();
      const mesFin = `${mesStr}-${String(ultimoDia).padStart(2, '0')}`;

      const { data: pagosExistentes, error: errExistentes } = await supabase
        .from('taller_gastos')
        .select('id, monto, notas')
        .eq('empresa_id', req.empresa_id)
        .eq('plantilla_id', plantilla_id)
        .gte('fecha', mesInicio)
        .lte('fecha', mesFin);

      if (errExistentes) throw errExistentes;

      if (pagosExistentes && pagosExistentes.length > 0) {
        const mismoMonto = pagosExistentes.some((p: any) => Number(p.monto) === montoNum);
        const tieneNota = typeof notas === 'string' && notas.trim().length > 0;

        if (mismoMonto) {
          res.status(400).json({
            error: 'Ya existe un pago registrado para este gasto en el mes con el mismo monto. Si es un abono, debe tener un monto diferente y una nota explicativa.',
          });
          return;
        }
        if (!tieneNota) {
          res.status(400).json({
            error: 'Para registrar un segundo pago de este gasto en el mismo mes, debes incluir una nota explicativa (ej. motivo del abono o pago parcial).',
          });
          return;
        }
      }
    }

    const { data, error } = await supabase
      .from('taller_gastos')
      .insert([{
        empresa_id: req.empresa_id,
        fecha: fecha || bogotaToday(),
        categoria_id: categoria_id || null,
        descripcion: descripcion.trim(),
        monto: montoNum,
        proveedor: typeof proveedor === 'string' ? proveedor.trim() || null : null,
        comprobante_url: comprobante_url || null,
        tipo: tipo || 'unico',
        plantilla_id: plantilla_id || null,
        notas: typeof notas === 'string' ? notas.trim() || null : null,
        ingreso_id: ingreso_id || null,
        item_id: ingreso_id ? (item_id || null) : null,
      }])
      .select(`
        id, fecha, descripcion, monto, proveedor, comprobante_url, tipo, notas,
        ingreso_id, item_id,
        taller_categorias_gastos(id, nombre, color, icono),
        taller_ingresos(id, estado, fecha_ingreso, taller_vehiculos(placa, marca, linea))
      `)
      .single();
    if (error) throw error;

    // Si viene de una plantilla recurrente, actualizar su último_registro solo si la fecha es mayor
    if (plantilla_id && fecha) {
      const { data: recData } = await supabase
        .from('taller_gastos_recurrentes')
        .select('ultimo_registro')
        .eq('id', plantilla_id)
        .eq('empresa_id', req.empresa_id)
        .maybeSingle();

      if (!recData?.ultimo_registro || fecha > recData.ultimo_registro) {
        await supabase
          .from('taller_gastos_recurrentes')
          .update({ ultimo_registro: fecha })
          .eq('id', plantilla_id)
          .eq('empresa_id', req.empresa_id);
      }
    }

    res.status(201).json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// BATCH
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/gastos/batch
 * Registra N gastos en un único lote atómico (para facturas con varios repuestos).
 *
 * Orden de evaluación:
 *   1. Idempotencia — si lote_id ya existe devuelve los gastos ya creados (200).
 *   2. Validaciones de negocio (con número de fila).
 *   3. Detección de duplicados en servidor → 409 (si confirmar_duplicados no es true).
 *   4. Inserción con lote_orden para garantizar atomicidad ante reintentos concurrentes.
 */
export const createGastosBatch = async (req: Request, res: Response): Promise<void> => {
  try {
    const empresaId = req.empresa_id!;
    const {
      lote_id,
      filas,
      confirmar_duplicados = false,
    }: {
      lote_id: string;
      filas: {
        fecha?: string;
        categoria_id?: string;
        descripcion: string;
        monto: number;
        proveedor?: string;
        notas?: string;
        comprobante_url?: string;
        ingreso_id?: string;
        item_id?: string;
      }[];
      confirmar_duplicados?: boolean;
    } = req.body;

    // ── Validaciones básicas del wrapper ──────────────────────────────────
    if (!lote_id || typeof lote_id !== 'string' || !UUID_REGEX.test(lote_id)) {
      res.status(400).json({ error: 'lote_id debe ser un UUID válido.' });
      return;
    }
    if (!Array.isArray(filas) || filas.length === 0) {
      res.status(400).json({ error: 'Se requiere al menos una fila.' });
      return;
    }
    if (filas.length > 50) {
      res.status(400).json({ error: 'Máximo 50 filas por lote.' });
      return;
    }

    // Validar de inmediato que cada elemento sea un objeto válido
    for (let i = 0; i < filas.length; i++) {
      const f = filas[i];
      const num = i + 1;
      if (!f || typeof f !== 'object' || Array.isArray(f)) {
        res.status(400).json({ error: `Fila ${num}: La fila debe ser un objeto válido.`, fila: num });
        return;
      }
    }

    // ── 1. IDEMPOTENCIA ───────────────────────────────────────────────────
    const { data: existentes, error: errorExistentes } = await supabase
      .from('taller_gastos')
      .select(`
        id, fecha, descripcion, monto, proveedor, comprobante_url, tipo, notas,
        ingreso_id, item_id, lote_id, lote_orden,
        taller_categorias_gastos(id, nombre, color, icono),
        taller_ingresos(id, estado, fecha_ingreso, taller_vehiculos(placa, marca, linea))
      `)
      .eq('empresa_id', empresaId)
      .eq('lote_id', lote_id)
      .order('lote_orden', { ascending: true });

    if (errorExistentes) throw errorExistentes;

    if (existentes && existentes.length > 0) {
      // Lote ya procesado: respuesta idempotente
      res.status(200).json({ gastos: existentes, idempotente: true });
      return;
    }

    // ── 2. VALIDACIONES DE NEGOCIO POR FILA ──────────────────────────────
    const today = bogotaToday();

    // a) Recopilar categoria_ids únicos para validar en una sola consulta
    const categoriaIdsUsados = [...new Set(
      filas.map(f => f.categoria_id).filter((id): id is string => !!id)
    )];
    let categoriaIdsValidos = new Set<string>();
    if (categoriaIdsUsados.length > 0) {
      const { data: catRows, error: errorCat } = await supabase
        .from('taller_categorias_gastos')
        .select('id')
        .eq('empresa_id', empresaId)
        .in('id', categoriaIdsUsados);
      if (errorCat) throw errorCat;
      categoriaIdsValidos = new Set((catRows || []).map((c: any) => c.id));
    }

    // b) Recopilar ingreso_ids únicos para validar en una sola consulta
    const ingresoIdsUsados = [...new Set(
      filas.map(f => f.ingreso_id).filter((id): id is string => !!id)
    )];
    const ordenesMap = new Map<string, any>();
    if (ingresoIdsUsados.length > 0) {
      const { data: ordenRows, error: errorOrden } = await supabase
        .from('taller_ingresos')
        .select('id, items_factura')
        .eq('empresa_id', empresaId)
        .in('id', ingresoIdsUsados);
      if (errorOrden) throw errorOrden;
      for (const o of (ordenRows || [])) {
        ordenesMap.set(o.id, o);
      }
    }

    for (let i = 0; i < filas.length; i++) {
      const fila = filas[i];
      const num = i + 1;

      if (!fila.descripcion || typeof fila.descripcion !== 'string' || !fila.descripcion.trim()) {
        res.status(400).json({ error: `Fila ${num}: La descripción es obligatoria y debe ser texto.`, fila: num });
        return;
      }
      const montoNum = Number(fila.monto);
      if (!Number.isFinite(montoNum) || montoNum <= 0 || montoNum > 999_999_999) {
        res.status(400).json({ error: `Fila ${num}: El monto debe ser un número válido mayor a 0 y menor a 1.000 millones.`, fila: num });
        return;
      }
      if (fila.fecha && !esFechaValida(fila.fecha)) {
        res.status(400).json({ error: `Fila ${num}: Fecha inválida (use formato YYYY-MM-DD existente en el calendario).`, fila: num });
        return;
      }
      if (fila.proveedor !== undefined && fila.proveedor !== null && typeof fila.proveedor !== 'string') {
        res.status(400).json({ error: `Fila ${num}: El proveedor debe ser texto.`, fila: num });
        return;
      }
      if (fila.notas !== undefined && fila.notas !== null && typeof fila.notas !== 'string') {
        res.status(400).json({ error: `Fila ${num}: Las notas deben ser texto.`, fila: num });
        return;
      }
      if (fila.comprobante_url && !esUrlValida(fila.comprobante_url)) {
        res.status(400).json({ error: `Fila ${num}: El comprobante debe ser una URL válida con protocolo https.`, fila: num });
        return;
      }
      if (fila.categoria_id && !categoriaIdsValidos.has(fila.categoria_id)) {
        res.status(400).json({ error: `Fila ${num}: La categoría especificada no pertenece a tu taller.`, fila: num });
        return;
      }
      if (fila.item_id && !fila.ingreso_id) {
        res.status(400).json({ error: `Fila ${num}: No se puede vincular un ítem sin especificar la orden.`, fila: num });
        return;
      }
      if (fila.ingreso_id) {
        const orden = ordenesMap.get(fila.ingreso_id);
        if (!orden) {
          res.status(400).json({ error: `Fila ${num}: La orden de servicio no existe o no pertenece a tu taller.`, fila: num });
          return;
        }
        if (fila.item_id) {
          const items = Array.isArray(orden.items_factura) ? orden.items_factura : [];
          const item = items.find((it: any) => it?.id === fila.item_id);
          if (!item) {
            res.status(400).json({ error: `Fila ${num}: El ítem no existe en la orden de servicio.`, fila: num });
            return;
          }
          if (item.tipo !== 'repuesto') {
            res.status(400).json({ error: `Fila ${num}: Solo se pueden vincular gastos a ítems de tipo repuesto.`, fila: num });
            return;
          }
        }
      }
    }

    // ── 3. DETECCIÓN DE DUPLICADOS EN SERVIDOR ────────────────────────────
    if (!confirmar_duplicados) {
      const filasConProveedor = filas.filter(f => f.proveedor && typeof f.proveedor === 'string' && f.proveedor.trim());
      if (filasConProveedor.length > 0) {
        const montosUnicos = [...new Set(filasConProveedor.map(f => Number(f.monto)))];
        // Rango de fechas ±7 días respecto al mínimo/máximo de fechas del lote
        const fechasLote = filas.map(f => f.fecha || today);
        const fechaMin = new Date(Math.min(...fechasLote.map(d => new Date(d).getTime())));
        const fechaMax = new Date(Math.max(...fechasLote.map(d => new Date(d).getTime())));
        fechaMin.setDate(fechaMin.getDate() - 7);
        fechaMax.setDate(fechaMax.getDate() + 7);
        const dMin = fechaMin.toISOString().split('T')[0];
        const dMax = fechaMax.toISOString().split('T')[0];

        const { data: candidatos, error: errorCandidatos } = await supabase
          .from('taller_gastos')
          .select('id, fecha, descripcion, monto, proveedor')
          .eq('empresa_id', empresaId)
          .gte('fecha', dMin)
          .lte('fecha', dMax)
          .in('monto', montosUnicos);

        if (errorCandidatos) throw errorCandidatos;

        if (candidatos && candidatos.length > 0) {
          const duplicados: any[] = [];
          for (const fila of filasConProveedor) {
            const provNorm = fila.proveedor!.toLowerCase().trim();
            const fechaFila = new Date(fila.fecha || today);
            for (const c of candidatos) {
              if (!c.proveedor) continue;
              if (c.proveedor.toLowerCase().trim() !== provNorm) continue;
              if (Number(c.monto) !== Number(fila.monto)) continue;
              const diffDias = Math.abs(new Date(c.fecha).getTime() - fechaFila.getTime()) / 86400000;
              if (diffDias <= 7) {
                duplicados.push({ fila_nueva: fila, existente: c });
              }
            }
          }
          if (duplicados.length > 0) {
            res.status(409).json({
              error: 'Se detectaron posibles gastos duplicados. Revísalos y confirma para guardar.',
              duplicados,
            });
            return;
          }
        }
      }
    }

    // ── 4. INSERCIÓN ATÓMICA CON lote_orden ───────────────────────────────
    const rows = filas.map((fila, i) => ({
      empresa_id: empresaId,
      lote_id,
      lote_orden: i + 1,
      fecha: fila.fecha || today,
      categoria_id: fila.categoria_id || null,
      descripcion: fila.descripcion.trim(),
      monto: Number(fila.monto),
      proveedor: typeof fila.proveedor === 'string' ? fila.proveedor.trim() || null : null,
      notas: typeof fila.notas === 'string' ? fila.notas.trim() || null : null,
      comprobante_url: fila.comprobante_url || null,
      tipo: 'unico' as const,
      ingreso_id: fila.ingreso_id || null,
      item_id: fila.ingreso_id ? (fila.item_id || null) : null,
    }));

    const { data, error: insertError } = await supabase
      .from('taller_gastos')
      .insert(rows)
      .select(`
        id, fecha, descripcion, monto, proveedor, comprobante_url, tipo, notas,
        ingreso_id, item_id, lote_id, lote_orden,
        taller_categorias_gastos(id, nombre, color, icono),
        taller_ingresos(id, estado, fecha_ingreso, taller_vehiculos(placa, marca, linea))
      `);

    if (insertError) {
      // Código 23505 = violación de índice único → colisión concurrente de lote_id+lote_orden
      if (insertError.code === '23505') {
        const { data: existentesRetry, error: errorRetry } = await supabase
          .from('taller_gastos')
          .select(`
            id, fecha, descripcion, monto, proveedor, comprobante_url, tipo, notas,
            ingreso_id, item_id, lote_id, lote_orden,
            taller_categorias_gastos(id, nombre, color, icono),
            taller_ingresos(id, estado, fecha_ingreso, taller_vehiculos(placa, marca, linea))
          `)
          .eq('empresa_id', empresaId)
          .eq('lote_id', lote_id)
          .order('lote_orden', { ascending: true });
        if (errorRetry) throw errorRetry;
        res.status(200).json({ gastos: existentesRetry || [], idempotente: true });
        return;
      }
      throw insertError;
    }

    res.status(201).json({ gastos: data || [] });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * PATCH /api/gastos/batch-vinculo
 * Actualiza el vínculo orden/ítem de múltiples gastos mediante una RPC SQL atómica.
 * El RPC valida que cada orden e ítem pertenezca a la empresa (fail-closed multi-tenant).
 */
export const patchVinculoGastoBatch = async (req: Request, res: Response): Promise<void> => {
  try {
    const empresaId = req.empresa_id!;
    const { vinculos } = req.body as {
      vinculos: { gasto_id: string; ingreso_id?: string; item_id?: string }[];
    };

    if (!Array.isArray(vinculos) || vinculos.length === 0) {
      res.status(400).json({ error: 'Se requiere al menos un vínculo.' });
      return;
    }
    if (vinculos.length > 50) {
      res.status(400).json({ error: 'Máximo 50 vínculos por operación.' });
      return;
    }

    for (const v of vinculos) {
      if (!v.gasto_id || typeof v.gasto_id !== 'string' || !UUID_REGEX.test(v.gasto_id)) {
        res.status(400).json({ error: `gasto_id inválido: '${v.gasto_id}'. Debe ser un UUID válido.` });
        return;
      }
      if (v.ingreso_id && (typeof v.ingreso_id !== 'string' || !UUID_REGEX.test(v.ingreso_id))) {
        res.status(400).json({ error: `ingreso_id inválido: '${v.ingreso_id}'. Debe ser un UUID válido.` });
        return;
      }
    }

    const { data, error } = await supabase.rpc('actualizar_vinculos_gastos', {
      p_empresa_id: empresaId,
      p_vinculos: vinculos,
    });

    if (error) {
      // P0001 = RAISE EXCEPTION en PostgreSQL (regla de validación de negocio)
      if (error.code === 'P0001') {
        res.status(400).json({ error: error.message });
        return;
      }
      res.status(500).json({ error: error.message });
      return;
    }

    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * PUT /api/gastos/:id
 * Actualiza un gasto existente.
 */
export const updateGasto = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // Verificar si el gasto corresponde a una liquidación de comisiones de técnicos
    const { data: gastoActual, error: findError } = await supabase
      .from('taller_gastos')
      .select('id, descripcion, monto, fecha, notas, plantilla_id')
      .eq('id', id)
      .eq('empresa_id', req.empresa_id)
      .maybeSingle();

    if (findError || !gastoActual) {
      res.status(404).json({ error: 'El gasto no existe o no pertenece a tu taller.' });
      return;
    }

    const { data: comisionVinculada, error: comisionError } = await supabase
      .from('taller_ingresos_tecnicos')
      .select('id')
      .eq('gasto_id', id)
      .limit(1)
      .maybeSingle();

    if (comisionError) {
      res.status(500).json({ error: 'Error al verificar restricciones del gasto.' });
      return;
    }

    if (comisionVinculada) {
      res.status(400).json({
        error: 'Este gasto corresponde a una liquidación de técnicos y no puede modificarse manualmente.',
      });
      return;
    }

    const {
      fecha,
      categoria_id,
      descripcion,
      monto,
      proveedor,
      comprobante_url,
      notas,
      ingreso_id,
      item_id
    } = req.body;

    const payload: Record<string, any> = {
      updated_at: new Date().toISOString()
    };

    if (fecha !== undefined) {
      if (!esFechaValida(fecha)) {
        res.status(400).json({ error: 'La fecha no es válida (use formato YYYY-MM-DD).' });
        return;
      }
      payload.fecha = fecha;
    }

    if (categoria_id !== undefined) {
      if (categoria_id !== null) {
        const validacionCat = await validarCategoria(req.empresa_id!, categoria_id);
        if (!validacionCat.ok) {
          res.status(400).json({ error: validacionCat.error });
          return;
        }
      }
      payload.categoria_id = categoria_id;
    }

    if (descripcion !== undefined) {
      if (typeof descripcion !== 'string' || !descripcion.trim()) {
        res.status(400).json({ error: 'La descripción es obligatoria y debe ser texto.' });
        return;
      }
      payload.descripcion = descripcion.trim();
    }

    if (monto !== undefined) {
      const montoNum = Number(monto);
      if (!Number.isFinite(montoNum) || montoNum <= 0 || montoNum > 999_999_999) {
        res.status(400).json({ error: 'El monto debe ser un número válido mayor a 0 y menor a 1.000 millones.' });
        return;
      }
      payload.monto = montoNum;
    }

    if (proveedor !== undefined) {
      payload.proveedor = typeof proveedor === 'string' ? proveedor.trim() || null : null;
    }
    if (comprobante_url !== undefined) {
      if (comprobante_url !== null && !esUrlValida(comprobante_url)) {
        res.status(400).json({ error: 'El comprobante debe ser una URL válida con protocolo https.' });
        return;
      }
      payload.comprobante_url = comprobante_url;
    }
    if (notas !== undefined) {
      payload.notas = typeof notas === 'string' ? notas.trim() || null : null;
    }

    // Manejo de vínculo: undefined conserva el vínculo actual, null desvincula
    if (ingreso_id !== undefined || item_id !== undefined) {
      if (ingreso_id === null) {
        payload.ingreso_id = null;
        payload.item_id = null;
      } else if (ingreso_id) {
        const validacion = await validarVinculo(req.empresa_id!, ingreso_id, item_id);
        if (!validacion.ok) {
          res.status(validacion.status || 400).json({ error: validacion.error });
          return;
        }
        payload.ingreso_id = ingreso_id;
        payload.item_id = item_id || null;
      } else if (item_id !== undefined) {
        // Consultar el gasto actual para verificar su ingreso_id existente
        const { data: currentGasto } = await supabase
          .from('taller_gastos')
          .select('ingreso_id')
          .eq('id', id)
          .eq('empresa_id', req.empresa_id)
          .single();

        const currentIngresoId = currentGasto?.ingreso_id;
        if (item_id && !currentIngresoId) {
          res.status(400).json({ error: 'No se puede vincular un ítem a un gasto sin orden vinculada.' });
          return;
        }
        if (item_id && currentIngresoId) {
          const validacion = await validarVinculo(req.empresa_id!, currentIngresoId, item_id);
          if (!validacion.ok) {
            res.status(validacion.status || 400).json({ error: validacion.error });
            return;
          }
        }
        payload.item_id = item_id || null;
      }
    }

    // ── Cambio 6: Rechazar duplicados del mismo gasto en el mes en updateGasto ──
    const effectivePlantillaId = gastoActual.plantilla_id;
    const effectiveFecha = payload.fecha || gastoActual.fecha;
    const effectiveMonto = payload.monto !== undefined ? payload.monto : Number(gastoActual.monto);
    const effectiveNotas = payload.notas !== undefined ? payload.notas : gastoActual.notas;

    if (effectivePlantillaId && effectiveFecha) {
      const mesStr = effectiveFecha.slice(0, 7);
      const mesInicio = `${mesStr}-01`;
      const [y, m] = mesStr.split('-').map(Number);
      const ultimoDia = new Date(Date.UTC(y, m, 0, 12, 0, 0)).getUTCDate();
      const mesFin = `${mesStr}-${String(ultimoDia).padStart(2, '0')}`;

      const { data: otrosPagos, error: errOtros } = await supabase
        .from('taller_gastos')
        .select('id, monto, notas')
        .eq('empresa_id', req.empresa_id)
        .eq('plantilla_id', effectivePlantillaId)
        .neq('id', id)
        .gte('fecha', mesInicio)
        .lte('fecha', mesFin);

      if (errOtros) throw errOtros;

      if (otrosPagos && otrosPagos.length > 0) {
        const mismoMonto = otrosPagos.some((p: any) => Number(p.monto) === effectiveMonto);
        const tieneNota = typeof effectiveNotas === 'string' && effectiveNotas.trim().length > 0;

        if (mismoMonto) {
          res.status(400).json({
            error: 'Ya existe otro pago registrado para este gasto en el mes con el mismo monto. Si es un abono, debe tener un monto diferente y una nota explicativa.',
          });
          return;
        }
        if (!tieneNota) {
          res.status(400).json({
            error: 'Para mantener un pago adicional de este gasto en el mismo mes, debes incluir una nota explicativa.',
          });
          return;
        }
      }
    }

    const { data, error } = await supabase
      .from('taller_gastos')
      .update(payload)
      .eq('id', id)
      .eq('empresa_id', req.empresa_id)
      .select(`
        id, fecha, descripcion, monto, proveedor, comprobante_url, tipo, notas,
        ingreso_id, item_id,
        taller_categorias_gastos(id, nombre, color, icono),
        taller_ingresos(id, estado, fecha_ingreso, taller_vehiculos(placa, marca, linea))
      `)
      .single();
    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * PATCH /api/gastos/:id/vinculo
 * Actualiza únicamente el vínculo de un gasto con una orden e ítem.
 * Usado desde Checkout para vincular gastos existentes sin reenviar monto, fecha, etc.
 */
export const patchVinculoGasto = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { ingreso_id, item_id } = req.body;

    // Verificar que el gasto exista y pertenezca a la empresa
    const { data: existingGasto, error: findError } = await supabase
      .from('taller_gastos')
      .select('id')
      .eq('id', id)
      .eq('empresa_id', req.empresa_id)
      .maybeSingle();

    if (findError || !existingGasto) {
      res.status(404).json({ error: 'El gasto especificado no existe o no pertenece a tu taller.' });
      return;
    }

    const targetIngresoId = ingreso_id || null;
    const targetItemId = targetIngresoId ? (item_id || null) : null;

    if (targetIngresoId) {
      const validacion = await validarVinculo(req.empresa_id!, targetIngresoId, targetItemId);
      if (!validacion.ok) {
        res.status(validacion.status || 400).json({ error: validacion.error });
        return;
      }
    }

    const { data, error } = await supabase
      .from('taller_gastos')
      .update({
        ingreso_id: targetIngresoId,
        item_id: targetItemId,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('empresa_id', req.empresa_id)
      .select(`
        id, fecha, descripcion, monto, proveedor, comprobante_url, tipo, notas,
        ingreso_id, item_id,
        taller_categorias_gastos(id, nombre, color, icono),
        taller_ingresos(id, estado, fecha_ingreso, taller_vehiculos(placa, marca, linea))
      `)
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * DELETE /api/gastos/:id
 */
export const deleteGasto = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { error } = await supabase
      .from('taller_gastos')
      .delete()
      .eq('id', id)
      .eq('empresa_id', req.empresa_id);

    if (error) {
      // 23503 = violación de FK (ON DELETE RESTRICT): el gasto está vinculado
      // a comisiones liquidadas y no puede eliminarse directamente.
      if (error.code === '23503') {
        res.status(400).json({
          error: 'Este gasto corresponde a una liquidación de técnicos y no puede eliminarse.',
        });
        return;
      }
      throw error;
    }
    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GASTOS RECURRENTES (Plantillas)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/gastos/recurrentes
 * Lista las plantillas de gastos recurrentes activas con su próxima fecha estimada.
 */
export const getRecurrentes = async (req: Request, res: Response): Promise<void> => {
  try {
    const { data, error } = await supabase
      .from('taller_gastos_recurrentes')
      .select(`
        id, nombre, monto_estimado, frecuencia, dia_del_mes, dia_semana,
        activa, fecha_inicio, fecha_fin, ultimo_registro, notas,
        taller_categorias_gastos(id, nombre, color, icono)
      `)
      .eq('empresa_id', req.empresa_id)
      .eq('activa', true)
      .order('nombre');
    if (error) throw error;

    const hoy = bogotaToday();

    const enriquecidas = (data || []).map((p: any) => {
      const proxima = calcularProximaFecha(p);
      const proximaStr = proxima ? proxima.toISOString().split('T')[0] : null;
      return {
        ...p,
        proxima_fecha: proximaStr,
        vencido: Boolean(proximaStr && proximaStr <= hoy),
      };
    });

    res.json(enriquecidas);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * GET /api/gastos/recurrentes/pendientes
 * Retorna plantillas activas cuyo próximo cobro ya venció sin registrar.
 * El frontend usa este endpoint para mostrar el banner de alerta.
 */
export const getPendientes = async (req: Request, res: Response): Promise<void> => {
  try {
    const { data: plantillas, error } = await supabase
      .from('taller_gastos_recurrentes')
      .select(`
        id, nombre, monto_estimado, frecuencia, dia_del_mes, dia_semana,
        fecha_inicio, ultimo_registro,
        taller_categorias_gastos(id, nombre, color)
      `)
      .eq('empresa_id', req.empresa_id)
      .eq('activa', true);

    if (error) throw error;

    const hoy = bogotaToday();

    const pendientes = (plantillas || []).filter((p: any) => {
      const proxima = calcularProximaFecha(p);
      const proximaStr = proxima ? proxima.toISOString().split('T')[0] : null;
      return Boolean(proximaStr && proximaStr <= hoy);
    }).map((p: any) => ({
      ...p,
      proxima_fecha: calcularProximaFecha(p)?.toISOString().split('T')[0]
    }));

    res.json(pendientes);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Helper: calcula la próxima fecha de cobro de una plantilla recurrente.
 * Utiliza aritmética de calendario UTC pura para evitar desbordamientos de fin de mes
 * (ej. 31 de octubre + 1 mes pasa a 30 de noviembre en lugar de saltar a 31 de diciembre).
 */
function calcularProximaFecha(plantilla: any): Date | null {
  const baseStr = (plantilla.ultimo_registro || plantilla.fecha_inicio || '').split('T')[0];
  if (!baseStr || !/^\d{4}-\d{2}-\d{2}$/.test(baseStr)) return null;

  const [y, m, d] = baseStr.split('-').map(Number);

  switch (plantilla.frecuencia) {
    case 'diario': {
      const dt = new Date(Date.UTC(y, m - 1, d));
      dt.setUTCDate(dt.getUTCDate() + 1);
      return dt;
    }
    case 'semanal': {
      const dt = new Date(Date.UTC(y, m - 1, d));
      dt.setUTCDate(dt.getUTCDate() + 7);
      return dt;
    }
    case 'quincenal': {
      const dt = new Date(Date.UTC(y, m - 1, d));
      dt.setUTCDate(dt.getUTCDate() + 15);
      return dt;
    }
    case 'mensual': {
      let targetY = y;
      let targetM = m + 1; // siguiente mes (1-12)
      if (targetM > 12) {
        targetM = 1;
        targetY += 1;
      }
      // Días que tiene el mes destino
      const diasEnMesDestino = new Date(Date.UTC(targetY, targetM, 0)).getUTCDate();
      const targetDia = plantilla.dia_del_mes
        ? Math.min(Number(plantilla.dia_del_mes), diasEnMesDestino)
        : Math.min(d, diasEnMesDestino);
      return new Date(Date.UTC(targetY, targetM - 1, targetDia));
    }
    case 'anual': {
      const targetY = y + 1;
      const diasEnMesDestino = new Date(Date.UTC(targetY, m, 0)).getUTCDate();
      const targetDia = Math.min(d, diasEnMesDestino);
      return new Date(Date.UTC(targetY, m - 1, targetDia));
    }
    default:
      return null;
  }
}

/**
 * POST /api/gastos/recurrentes
 */
export const createRecurrente = async (req: Request, res: Response): Promise<void> => {
  try {
    const { nombre, categoria_id, monto_estimado, frecuencia, dia_del_mes, dia_semana, fecha_inicio, fecha_fin, notas } = req.body;
    if (!nombre?.trim() || !monto_estimado || !frecuencia) {
      res.status(400).json({ error: 'nombre, monto_estimado y frecuencia son obligatorios.' });
      return;
    }

    if (categoria_id) {
      const validacionCat = await validarCategoria(req.empresa_id!, categoria_id);
      if (!validacionCat.ok) {
        res.status(400).json({ error: validacionCat.error });
        return;
      }
    }
    const { data, error } = await supabase
      .from('taller_gastos_recurrentes')
      .insert([{
        empresa_id: req.empresa_id,
        nombre: nombre.trim(),
        categoria_id: categoria_id || null,
        monto_estimado: Number(monto_estimado),
        frecuencia,
        dia_del_mes: dia_del_mes || null,
        dia_semana: dia_semana ?? null,
        fecha_inicio: fecha_inicio || new Date().toISOString().split('T')[0],
        fecha_fin: fecha_fin || null,
        notas: notas?.trim() || null,
      }])
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * PUT /api/gastos/recurrentes/:id
 */
export const updateRecurrente = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { nombre, categoria_id, monto_estimado, frecuencia, dia_del_mes, fecha_inicio, activa, fecha_fin, notas } = req.body;

    if (!nombre?.trim() || !monto_estimado || !frecuencia) {
      res.status(400).json({ error: 'nombre, monto_estimado y frecuencia son obligatorios.' });
      return;
    }

    if (categoria_id) {
      const validacionCat = await validarCategoria(req.empresa_id!, categoria_id);
      if (!validacionCat.ok) {
        res.status(400).json({ error: validacionCat.error });
        return;
      }
    }

    const updatePayload: Record<string, any> = {
      nombre: nombre.trim(),
      categoria_id: categoria_id || null,
      monto_estimado: Number(monto_estimado),
      frecuencia,
      dia_del_mes: dia_del_mes ? Number(dia_del_mes) : null,
      notas: typeof notas === 'string' ? notas.trim() || null : null,
    };
    if (fecha_inicio) updatePayload.fecha_inicio = fecha_inicio;
    if (fecha_fin !== undefined) updatePayload.fecha_fin = fecha_fin || null;
    if (activa !== undefined) updatePayload.activa = Boolean(activa);

    const { data, error } = await supabase
      .from('taller_gastos_recurrentes')
      .update(updatePayload)
      .eq('id', id)
      .eq('empresa_id', req.empresa_id)
      .select(`
        id, nombre, monto_estimado, frecuencia, dia_del_mes, dia_semana,
        activa, fecha_inicio, fecha_fin, ultimo_registro, notas,
        taller_categorias_gastos(id, nombre, color, icono)
      `)
      .single();
    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * DELETE /api/gastos/recurrentes/:id
 * Desactiva la plantilla (soft-delete).
 */
export const deleteRecurrente = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { error } = await supabase
      .from('taller_gastos_recurrentes')
      .update({ activa: false })
      .eq('id', id)
      .eq('empresa_id', req.empresa_id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
