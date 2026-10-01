import { Request, Response } from 'express';
import { supabase } from '../config/supabase';
import { bogotaToday } from '../utils/dateUtils';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Garantiza que la categoría 'Nómina' exista para la empresa.
 * Busca por nombre exacto; si no existe, la crea.
 * Retorna el UUID de la categoría.
 */
async function garantizarCategoriaNomina(empresaId: string): Promise<string> {
  const { data: cat } = await supabase
    .from('taller_categorias_gastos')
    .select('id')
    .eq('empresa_id', empresaId)
    .eq('nombre', 'Nómina')
    .maybeSingle();

  if (cat) return cat.id;

  // No existe: crear con upsert para evitar race condition
  const { data: nueva, error } = await supabase
    .from('taller_categorias_gastos')
    .upsert(
      { empresa_id: empresaId, nombre: 'Nómina', color: '#8b5cf6', icono: 'users', es_default: true },
      { onConflict: 'empresa_id,nombre', ignoreDuplicates: false }
    )
    .select('id')
    .single();

  if (error) throw error;
  return nueva.id;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/liquidaciones
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retorna comisiones de técnicos por ingresos en estado 'entregado'.
 *
 * Query params:
 *   desde       YYYY-MM-DD  (filtra por taller_ingresos.updated_at)
 *   hasta       YYYY-MM-DD
 *   tecnico_id  UUID        (opcional)
 *   estado      'pendiente' | 'liquidado' | 'todos'  (default: 'pendiente')
 */
export const getLiquidaciones = async (req: Request, res: Response): Promise<void> => {
  try {
    const { desde, hasta, tecnico_id, estado = 'pendiente' } = req.query;

    let query = supabase
      .from('taller_ingresos_tecnicos')
      .select(`
        id,
        ingreso_id,
        tecnico_id,
        monto_comision,
        porcentaje_aplicado,
        estado,
        fecha_pago,
        gasto_id,
        taller_ingresos!inner(
          id,
          estado,
          items_factura,
          updated_at,
          taller_vehiculos(placa)
        ),
        taller_tecnicos(id, nombre)
      `)
      .eq('taller_ingresos.empresa_id', req.empresa_id)
      .eq('taller_ingresos.estado', 'entregado');

    // Filtro de estado
    if (estado === 'pendiente' || estado === 'liquidado') {
      query = query.eq('estado', estado as string);
    }
    // 'todos' no añade filtro de estado

    if (tecnico_id) {
      query = query.eq('tecnico_id', tecnico_id as string);
    }
    if (desde) {
      query = query.gte('taller_ingresos.updated_at', `${desde}T00:00:00`);
    }
    if (hasta) {
      query = query.lte('taller_ingresos.updated_at', `${hasta}T23:59:59`);
    }

    const { data, error } = await query.order('taller_ingresos(updated_at)', { ascending: false });
    if (error) throw error;

    const rows = (data || []).map((row: any) => {
      const items = row.taller_ingresos?.items_factura || [];
      const totalManoObra = items
        .filter((item: any) => item.tipo === 'mano_obra')
        .reduce((acc: number, item: any) => acc + (item.total || 0), 0);

      return {
        id: row.id,
        ingreso_id: row.ingreso_id,
        tecnico_id: row.tecnico_id,
        nombre_tecnico: row.taller_tecnicos?.nombre || 'Sin nombre',
        placa: row.taller_ingresos?.taller_vehiculos?.placa || '-',
        fecha_entrega: row.taller_ingresos?.updated_at,
        total_mano_obra: totalManoObra,
        monto_comision: row.monto_comision || 0,
        porcentaje_aplicado: row.porcentaje_aplicado || 0,
        estado: row.estado || 'pendiente',
        fecha_pago: row.fecha_pago || null,
        gasto_id: row.gasto_id || null,
      };
    });

    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/liquidaciones/:id
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Recalcula monto_comision a partir de un nuevo porcentaje_aplicado.
 * Rechaza filas ya liquidadas.
 * Valida que la fila pertenezca al taller a través del join con taller_ingresos.
 */
export const updateLiquidacion = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { porcentaje_aplicado, total_mano_obra } = req.body;

    if (porcentaje_aplicado === undefined || porcentaje_aplicado === null) {
      res.status(400).json({ error: 'El campo porcentaje_aplicado es requerido.' });
      return;
    }
    if (total_mano_obra === undefined || total_mano_obra === null) {
      res.status(400).json({ error: 'El campo total_mano_obra es requerido.' });
      return;
    }

    const porcentaje = Number(porcentaje_aplicado);
    if (isNaN(porcentaje) || porcentaje < 0 || porcentaje > 100) {
      res.status(400).json({ error: 'El porcentaje debe estar entre 0 y 100.' });
      return;
    }

    // Validar pertenencia al taller y que la fila esté pendiente
    const { data: filaActual, error: errorFetch } = await supabase
      .from('taller_ingresos_tecnicos')
      .select('id, estado, taller_ingresos!inner(empresa_id)')
      .eq('id', id)
      .eq('taller_ingresos.empresa_id', req.empresa_id)
      .maybeSingle();

    if (errorFetch) throw errorFetch;
    if (!filaActual) {
      res.status(404).json({ error: 'Registro no encontrado o no pertenece a este taller.' });
      return;
    }
    if (filaActual.estado === 'liquidado') {
      res.status(400).json({ error: 'No se puede modificar una comisión ya liquidada.' });
      return;
    }

    const nuevo_monto = Math.round(Number(total_mano_obra) * (porcentaje / 100));

    const { data, error } = await supabase
      .from('taller_ingresos_tecnicos')
      .update({ porcentaje_aplicado: porcentaje, monto_comision: nuevo_monto })
      .eq('id', id)
      .select('id, porcentaje_aplicado, monto_comision')
      .single();

    if (error) throw error;

    res.json({
      id: data.id,
      porcentaje_aplicado: data.porcentaje_aplicado,
      monto_comision: data.monto_comision,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/liquidaciones/bulk
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Aplica el mismo porcentaje a múltiples registros.
 * Valida pertenencia al taller y rechaza filas ya liquidadas.
 */
export const bulkUpdateLiquidaciones = async (req: Request, res: Response): Promise<void> => {
  try {
    const { porcentaje_aplicado, filas } = req.body;

    if (porcentaje_aplicado === undefined || porcentaje_aplicado === null) {
      res.status(400).json({ error: 'El campo porcentaje_aplicado es requerido.' });
      return;
    }
    if (!Array.isArray(filas) || filas.length === 0) {
      res.status(400).json({ error: 'El campo filas debe ser un arreglo no vacío.' });
      return;
    }

    const porcentaje = Number(porcentaje_aplicado);
    if (isNaN(porcentaje) || porcentaje < 0 || porcentaje > 100) {
      res.status(400).json({ error: 'El porcentaje debe estar entre 0 y 100.' });
      return;
    }

    const ids = filas.map((f: { id: string }) => f.id);

    // Validar que todas las filas pertenezcan al taller y estén pendientes
    const { data: filasActuales, error: errorFetch } = await supabase
      .from('taller_ingresos_tecnicos')
      .select('id, estado, taller_ingresos!inner(empresa_id)')
      .in('id', ids)
      .eq('taller_ingresos.empresa_id', req.empresa_id);

    if (errorFetch) throw errorFetch;

    const liquidadas = (filasActuales || []).filter((f: any) => f.estado === 'liquidado');
    if (liquidadas.length > 0) {
      res.status(400).json({
        error: `${liquidadas.length} fila(s) ya están liquidadas y no pueden modificarse.`,
      });
      return;
    }

    if ((filasActuales || []).length !== ids.length) {
      res.status(400).json({ error: 'Algunas filas no pertenecen a este taller.' });
      return;
    }

    // Actualizar en paralelo
    const updatePromises = filas.map(({ id, total_mano_obra }: { id: string; total_mano_obra: number }) => {
      const nuevo_monto = Math.round(Number(total_mano_obra) * (porcentaje / 100));
      return supabase
        .from('taller_ingresos_tecnicos')
        .update({ porcentaje_aplicado: porcentaje, monto_comision: nuevo_monto })
        .eq('id', id)
        .select('id, porcentaje_aplicado, monto_comision')
        .single();
    });

    const results = await Promise.all(updatePromises);

    const updated: any[] = [];
    const errors: string[] = [];
    results.forEach(({ data, error }) => {
      if (error) errors.push(error.message);
      else if (data) updated.push(data);
    });

    if (errors.length > 0) {
      console.error('[bulkUpdateLiquidaciones] Errores parciales:', errors);
    }

    res.json({
      updated_count: updated.length,
      porcentaje_aplicado: porcentaje,
      rows: updated,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/liquidaciones/liquidar
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Liquida las comisiones seleccionadas de un técnico.
 * Atomicidad garantizada por la RPC liquidar_comisiones_tecnico.
 *
 * Body:
 *   tecnico_id  UUID
 *   filas_ids   UUID[]
 *   fecha       YYYY-MM-DD  (opcional, default hoy en Bogotá)
 *   notas       string      (opcional)
 *   lote_id     UUID        (generado en el frontend con crypto.randomUUID())
 */
export const liquidarTecnico = async (req: Request, res: Response): Promise<void> => {
  try {
    const { tecnico_id, filas_ids, fecha, notas = null, lote_id } = req.body;

    if (!tecnico_id || typeof tecnico_id !== 'string') {
      res.status(400).json({ error: 'El campo tecnico_id es requerido.' });
      return;
    }
    if (!Array.isArray(filas_ids) || filas_ids.length === 0) {
      res.status(400).json({ error: 'Debes seleccionar al menos una comisión para liquidar.' });
      return;
    }
    if (!lote_id || typeof lote_id !== 'string') {
      res.status(400).json({ error: 'El campo lote_id es requerido.' });
      return;
    }

    // Validar o calcular la fecha de pago en zona Bogotá
    let fechaPago = fecha;
    if (fechaPago) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaPago)) {
        res.status(400).json({ error: 'La fecha debe tener formato YYYY-MM-DD.' });
        return;
      }
    } else {
      fechaPago = bogotaToday();
    }

    // Garantizar categoría 'Nómina' para este taller
    const categoriaId = await garantizarCategoriaNomina(req.empresa_id!);

    // Ejecutar la RPC atómica
    const { data: gastoId, error: rpcError } = await supabase.rpc(
      'liquidar_comisiones_tecnico',
      {
        p_empresa_id:   req.empresa_id,
        p_tecnico_id:   tecnico_id,
        p_filas_ids:    filas_ids,
        p_fecha:        fechaPago,
        p_notas:        notas,
        p_categoria_id: categoriaId,
        p_lote_id:      lote_id,
      }
    );

    if (rpcError) {
      // Excepciones de negocio levantadas desde la RPC
      if (rpcError.message?.includes('FILAS_INVALIDAS')) {
        res.status(400).json({
          error: 'Una o más comisiones ya no están pendientes o no pertenecen a este técnico/taller.',
        });
        return;
      }
      if (rpcError.message?.includes('MONTO_CERO')) {
        res.status(400).json({
          error: 'El total de comisiones a liquidar debe ser mayor a cero.',
        });
        return;
      }
      throw rpcError;
    }

    res.status(201).json({ gasto_id: gastoId });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
