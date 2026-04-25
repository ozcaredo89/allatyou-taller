import { Request, Response } from 'express';
import { supabase } from '../config/supabase';

// Obtiene todos los ingresos que actualmente están en el taller activos
// Incluye estado_desde y promedios históricos de SLA por empresa
export const getIngresosActivos = async (req: Request, res: Response): Promise<void> => {
  try {
    const { data, error } = await supabase
      .from('taller_ingresos')
      .select('*, taller_vehiculos(*, taller_clientes(*)), taller_ingresos_tecnicos(taller_tecnicos(id, nombre))')
      .eq('empresa_id', req.empresa_id)
      .in('estado', ['recepcion', 'diagnostico', 'en_reparacion', 'cotizacion']);
      
    if (error) throw error;

    // Calcular promedios SLA por estado para esta empresa
    const { data: tiempos } = await supabase
      .from('taller_ingresos_tiempos')
      .select('estado, duracion_minutos')
      .eq('empresa_id', req.empresa_id);

    const promediosSLA: Record<string, number> = {};
    if (tiempos && tiempos.length > 0) {
      const agrupado: Record<string, number[]> = {};
      tiempos.forEach((t: any) => {
        if (!agrupado[t.estado]) agrupado[t.estado] = [];
        agrupado[t.estado].push(t.duracion_minutos);
      });
      Object.keys(agrupado).forEach(estado => {
        const arr = agrupado[estado];
        promediosSLA[estado] = Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
      });
    }

    res.json({ ingresos: data || [], promediosSLA });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getHistorial = async (req: Request, res: Response): Promise<void> => {
  try {
    const { data, error } = await supabase
      .from('taller_ingresos')
      .select('*, taller_vehiculos(*, taller_clientes(*))')
      .eq('empresa_id', req.empresa_id)
      .in('estado', ['entregado', 'cancelado'])
      .order('updated_at', { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const createIngreso = async (req: Request, res: Response): Promise<void> => {
  try {
    const { 
      vehiculo_id, 
      kilometraje, 
      nivel_gasolina, 
      motivo_visita, 
      checklist_inventario, 
      estado_carroceria,
      observaciones_recepcion 
    } = req.body;

    const { data, error } = await supabase
      .from('taller_ingresos')
      .insert([{
        vehiculo_id,
        kilometraje,
        nivel_gasolina,
        motivo_visita,
        checklist_inventario: checklist_inventario || {},
        estado_carroceria: estado_carroceria || {},
        observaciones_recepcion,
        estado: 'recepcion',
        estado_desde: new Date().toISOString(),
        empresa_id: req.empresa_id
      }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getIngresoById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('taller_ingresos')
      .select('*, taller_vehiculos(*, taller_clientes(*))')
      .eq('empresa_id', req.empresa_id)
      .eq('id', id)
      .single();
      
    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const updateIngreso = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const body = req.body;
    
    console.log(`[updateIngreso] id=${id} empresa_id=${req.empresa_id} body_keys=${Object.keys(body).join(',')}`);

    // Si viene un cambio de estado, registrar la transición SLA
    if (body.estado) {
      const { data: current, error: fetchError } = await supabase
        .from('taller_ingresos')
        .select('estado, estado_desde')
        .eq('empresa_id', req.empresa_id)
        .eq('id', id)
        .single();

      if (!fetchError && current && current.estado !== body.estado) {
        // Calcular duración en minutos del estado anterior
        const estadoDesde = current.estado_desde ? new Date(current.estado_desde).getTime() : Date.now();
        const duracionMinutos = Math.round((Date.now() - estadoDesde) / 60000);

        // Registrar el tiempo en la tabla de historial
        await supabase
          .from('taller_ingresos_tiempos')
          .insert({
            ingreso_id: id,
            empresa_id: req.empresa_id,
            estado: current.estado,
            duracion_minutos: duracionMinutos
          });

        // Resetear estado_desde para el nuevo estado
        body.estado_desde = new Date().toISOString();
      }
    }

    const { data, error } = await supabase
      .from('taller_ingresos')
      .update(body)
      .eq('empresa_id', req.empresa_id)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[updateIngreso] Supabase error:', JSON.stringify(error));
      throw error;
    }
    res.json(data);
  } catch (error: any) {
    console.error('[updateIngreso] Caught error:', error.message);
    res.status(500).json({ error: error.message });
  }
};

export const getReportesFinanzas = async (req: Request, res: Response): Promise<void> => {
  try {
    const { start, end } = req.query;
    
    // Obtener todos los ingresos entregados para histórico
    const { data: todos, error } = await supabase
      .from('taller_ingresos')
      .select('updated_at, items_factura')
      .eq('empresa_id', req.empresa_id)
      .eq('estado', 'entregado');
      
    if (error) throw error;
    
    const ingresos = todos || [];
    
    // Total historico y dias con ingresos
    let totalHistorico = 0;
    const diasUnicos = new Set<string>();
    
    // Para agrupar
    ingresos.forEach(ing => {
      const total = (ing.items_factura || []).reduce((acc: number, item: any) => acc + (item.total || 0), 0);
      if (total > 0) {
        totalHistorico += total;
        const dia = new Date(ing.updated_at).toISOString().split('T')[0];
        diasUnicos.add(dia);
      }
    });
    
    const promedioDiarioHistorico = diasUnicos.size > 0 ? totalHistorico / diasUnicos.size : 0;
    
    // Hoy
    const hoyStr = new Date().toISOString().split('T')[0];
    let facturadoHoy = 0;
    
    // Filtrar por rango
    let filtered = ingresos;
    if (start && end) {
      filtered = ingresos.filter(ing => {
        const d = new Date(ing.updated_at).toISOString().split('T')[0];
        return d >= (start as string) && d <= (end as string);
      });
    } else {
      // By default last 30 days if not provided
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const startStr = thirtyDaysAgo.toISOString().split('T')[0];
      filtered = ingresos.filter(ing => {
        const d = new Date(ing.updated_at).toISOString().split('T')[0];
        return d >= startStr;
      });
    }
    
    const chartDataMap: Record<string, number> = {};
    let totalPeriodo = 0;
    
    filtered.forEach(ing => {
      const d = new Date(ing.updated_at).toISOString().split('T')[0];
      const total = (ing.items_factura || []).reduce((acc: number, item: any) => acc + (item.total || 0), 0);
      
      if (!chartDataMap[d]) chartDataMap[d] = 0;
      chartDataMap[d] += total;
      totalPeriodo += total;
    });
    
    // Extraer facturado hoy
    ingresos.forEach(ing => {
      const d = new Date(ing.updated_at).toISOString().split('T')[0];
      if (d === hoyStr) {
        const total = (ing.items_factura || []).reduce((acc: number, item: any) => acc + (item.total || 0), 0);
        facturadoHoy += total;
      }
    });

    const chartData = Object.keys(chartDataMap).sort().map(fecha => ({
      fecha,
      total: chartDataMap[fecha]
    }));

    res.json({
      chartData,
      kpis: {
        facturadoHoy,
        promedioDiarioHistorico,
        totalPeriodo
      }
    });
    
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getReportesOperaciones = async (req: Request, res: Response): Promise<void> => {
  try {
    // Promedios globales por estado
    const { data: tiempos, error: tError } = await supabase
      .from('taller_ingresos_tiempos')
      .select('estado, duracion_minutos')
      .eq('empresa_id', req.empresa_id);

    if (tError) throw tError;

    const agrupado: Record<string, number[]> = {};
    (tiempos || []).forEach((t: any) => {
      if (!agrupado[t.estado]) agrupado[t.estado] = [];
      agrupado[t.estado].push(t.duracion_minutos);
    });

    const promediosGlobales = Object.keys(agrupado).map(estado => ({
      estado,
      promedio: Math.round(agrupado[estado].reduce((a, b) => a + b, 0) / agrupado[estado].length),
      total: agrupado[estado].length
    }));

    // Detalle por vehículo: JOINs manuales
    const { data: detalleRaw, error: dError } = await supabase
      .from('taller_ingresos_tiempos')
      .select('ingreso_id, estado, duracion_minutos')
      .eq('empresa_id', req.empresa_id);

    if (dError) throw dError;

    // Agrupar por ingreso_id
    const porIngreso: Record<string, Record<string, number>> = {};
    (detalleRaw || []).forEach((r: any) => {
      if (!porIngreso[r.ingreso_id]) porIngreso[r.ingreso_id] = {};
      porIngreso[r.ingreso_id][r.estado] = (porIngreso[r.ingreso_id][r.estado] || 0) + r.duracion_minutos;
    });

    // Obtener placas
    const ingresoIds = Object.keys(porIngreso);
    let detalleVehiculos: any[] = [];

    if (ingresoIds.length > 0) {
      const { data: ingresosData } = await supabase
        .from('taller_ingresos')
        .select('id, taller_vehiculos(placa)')
        .in('id', ingresoIds);

      const placaMap: Record<string, string> = {};
      (ingresosData || []).forEach((ing: any) => {
        placaMap[ing.id] = ing.taller_vehiculos?.placa || 'N/A';
      });

      detalleVehiculos = ingresoIds.map(ingresoId => ({
        placa: placaMap[ingresoId] || 'N/A',
        tiempos: porIngreso[ingresoId]
      }));
    }

    res.json({ promediosGlobales, detalleVehiculos });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const asignarTecnicos = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { tecnicos_ids } = req.body;

    if (!Array.isArray(tecnicos_ids)) {
      res.status(400).json({ error: 'tecnicos_ids debe ser un arreglo de IDs.' });
      return;
    }

    // Borrar asignaciones previas
    const { error: deleteError } = await supabase
      .from('taller_ingresos_tecnicos')
      .delete()
      .eq('ingreso_id', id);

    if (deleteError) throw deleteError;

    // Insertar nuevas asignaciones si hay
    if (tecnicos_ids.length > 0) {
      const inserts = tecnicos_ids.map(tecnicoId => ({
        ingreso_id: id,
        tecnico_id: tecnicoId
      }));

      const { error: insertError } = await supabase
        .from('taller_ingresos_tecnicos')
        .insert(inserts);

      if (insertError) throw insertError;
    }

    res.json({ success: true, message: 'Técnicos asignados correctamente.' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
