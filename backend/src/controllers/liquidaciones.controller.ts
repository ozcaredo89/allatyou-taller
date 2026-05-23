import { Request, Response } from 'express';
import { supabase } from '../config/supabase';

/**
 * GET /api/liquidaciones
 * Retorna comisiones de técnicos por ingresos en estado 'entregado'.
 * Filters: desde, hasta (fechas YYYY-MM-DD), tecnico_id (opcional)
 */
export const getLiquidaciones = async (req: Request, res: Response): Promise<void> => {
  try {
    const { desde, hasta, tecnico_id } = req.query;

    let query = supabase
      .from('taller_ingresos_tecnicos')
      .select(`
        id,
        ingreso_id,
        tecnico_id,
        monto_comision,
        porcentaje_aplicado,
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

    // Calcular total de mano de obra por ingreso para la tabla
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
      };
    });

    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * PUT /api/liquidaciones/:id
 * Recibe el nuevo porcentaje_aplicado y el total_mano_obra,
 * recalcula el monto_comision en el servidor y guarda ambos.
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
    const baseMontoObra = Number(total_mano_obra);

    if (isNaN(porcentaje) || porcentaje < 0 || porcentaje > 100) {
      res.status(400).json({ error: 'El porcentaje debe estar entre 0 y 100.' });
      return;
    }

    // El backend recalcula el dinero de forma segura
    const nuevo_monto = Math.round(baseMontoObra * (porcentaje / 100));

    const { data, error } = await supabase
      .from('taller_ingresos_tecnicos')
      .update({
        porcentaje_aplicado: porcentaje,
        monto_comision: nuevo_monto
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // Retornar ambos valores al frontend
    res.json({
      id: data.id,
      porcentaje_aplicado: data.porcentaje_aplicado,
      monto_comision: data.monto_comision,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * PUT /api/liquidaciones/bulk
 * Aplica el mismo porcentaje a múltiples registros de una sola vez.
 * Body: { porcentaje_aplicado: number, filas: Array<{ id: string, total_mano_obra: number }> }
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

    // Calcular y actualizar cada fila de forma paralela
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

    // Recopilar resultados y detectar errores parciales
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
