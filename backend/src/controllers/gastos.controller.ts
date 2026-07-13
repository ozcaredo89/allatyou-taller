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
 * GET /api/gastos
 * Lista gastos con filtros opcionales: desde, hasta, categoria_id.
 */
export const getGastos = async (req: Request, res: Response): Promise<void> => {
  try {
    const { desde, hasta, categoria_id, page = '1', limit = '50' } = req.query;
    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

    let query = supabase
      .from('taller_gastos')
      .select(`
        id, fecha, descripcion, monto, proveedor, comprobante_url,
        tipo, notas, created_at,
        taller_categorias_gastos(id, nombre, color, icono),
        taller_gastos_recurrentes(id, nombre)
      `, { count: 'exact' })
      .eq('empresa_id', req.empresa_id)
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + parseInt(limit as string) - 1);

    if (desde) query = query.gte('fecha', desde as string);
    if (hasta) query = query.lte('fecha', hasta as string);
    if (categoria_id) query = query.eq('categoria_id', categoria_id as string);

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({ gastos: data || [], total: count || 0 });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * POST /api/gastos
 * Registra un nuevo gasto ejecutado.
 */
export const createGasto = async (req: Request, res: Response): Promise<void> => {
  try {
    const { fecha, categoria_id, descripcion, monto, proveedor, comprobante_url, tipo, plantilla_id, notas } = req.body;

    if (!descripcion?.trim()) {
      res.status(400).json({ error: 'La descripción es obligatoria.' });
      return;
    }
    if (!monto || Number(monto) <= 0) {
      res.status(400).json({ error: 'El monto debe ser mayor a cero.' });
      return;
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
      }])
      .select(`
        id, fecha, descripcion, monto, proveedor, comprobante_url, tipo, notas,
        taller_categorias_gastos(id, nombre, color, icono)
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
    const { fecha, categoria_id, descripcion, monto, proveedor, comprobante_url, notas } = req.body;

    const { data, error } = await supabase
      .from('taller_gastos')
      .update({
        fecha, categoria_id, descripcion, monto: Number(monto),
        proveedor, comprobante_url, notas,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('empresa_id', req.empresa_id)
      .select(`
        id, fecha, descripcion, monto, proveedor, comprobante_url, tipo, notas,
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
