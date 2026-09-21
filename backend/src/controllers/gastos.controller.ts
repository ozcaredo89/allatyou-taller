import { Request, Response } from 'express';
import { supabase } from '../config/supabase';

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
    const { desde, hasta, categoria_id, ingreso_id, sin_vincular, page = '1', limit = '50' } = req.query;
    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

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

    if (!descripcion?.trim()) {
      res.status(400).json({ error: 'La descripción es obligatoria.' });
      return;
    }
    if (!monto || Number(monto) <= 0) {
      res.status(400).json({ error: 'El monto debe ser mayor a cero.' });
      return;
    }

    if (ingreso_id || item_id) {
      const validacion = await validarVinculo(req.empresa_id!, ingreso_id, item_id);
      if (!validacion.ok) {
        res.status(validacion.status || 400).json({ error: validacion.error });
        return;
      }
    }

    const { data, error } = await supabase
      .from('taller_gastos')
      .insert([{
        empresa_id: req.empresa_id,
        fecha: fecha || new Date().toISOString().split('T')[0],
        categoria_id: categoria_id || null,
        descripcion: descripcion.trim(),
        monto: Number(monto),
        proveedor: proveedor?.trim() || null,
        comprobante_url: comprobante_url || null,
        tipo: tipo || 'unico',
        plantilla_id: plantilla_id || null,
        notas: notas?.trim() || null,
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

    // Si viene de una plantilla recurrente, actualizar su último_registro
    if (plantilla_id) {
      await supabase
        .from('taller_gastos_recurrentes')
        .update({ ultimo_registro: fecha || new Date().toISOString().split('T')[0] })
        .eq('id', plantilla_id)
        .eq('empresa_id', req.empresa_id);
    }

    res.status(201).json(data);
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

    if (fecha !== undefined) payload.fecha = fecha;
    if (categoria_id !== undefined) payload.categoria_id = categoria_id;
    if (descripcion !== undefined) payload.descripcion = descripcion;
    if (monto !== undefined) payload.monto = Number(monto);
    if (proveedor !== undefined) payload.proveedor = proveedor;
    if (comprobante_url !== undefined) payload.comprobante_url = comprobante_url;
    if (notas !== undefined) payload.notas = notas;

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
    if (error) throw error;
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
 * Lista las plantillas de gastos recurrentes activas.
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
    res.json(data || []);
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

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const pendientes = (plantillas || []).filter((p: any) => {
      const proxima = calcularProximaFecha(p);
      return proxima !== null && proxima <= hoy;
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
 * Si ya venció (hoy >= proxima_fecha), retorna esa fecha.
 */
function calcularProximaFecha(plantilla: any): Date | null {
  const base = plantilla.ultimo_registro
    ? new Date(plantilla.ultimo_registro + 'T00:00:00')
    : new Date(plantilla.fecha_inicio + 'T00:00:00');

  const proxima = new Date(base);

  switch (plantilla.frecuencia) {
    case 'diario':
      proxima.setDate(proxima.getDate() + 1);
      break;
    case 'semanal':
      proxima.setDate(proxima.getDate() + 7);
      break;
    case 'quincenal':
      proxima.setDate(proxima.getDate() + 15);
      break;
    case 'mensual':
      proxima.setMonth(proxima.getMonth() + 1);
      if (plantilla.dia_del_mes) proxima.setDate(plantilla.dia_del_mes);
      break;
    case 'anual':
      proxima.setFullYear(proxima.getFullYear() + 1);
      break;
    default:
      return null;
  }

  return proxima;
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
    const { nombre, categoria_id, monto_estimado, frecuencia, dia_del_mes, activa, fecha_fin, notas } = req.body;
    const { data, error } = await supabase
      .from('taller_gastos_recurrentes')
      .update({ nombre, categoria_id, monto_estimado: Number(monto_estimado), frecuencia, dia_del_mes, activa, fecha_fin, notas })
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
