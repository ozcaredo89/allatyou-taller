import { Request, Response } from 'express';
import { supabase } from '../config/supabase';

// Obtiene todos los ingresos que actualmente están en el taller activos
export const getIngresosActivos = async (req: Request, res: Response): Promise<void> => {
  try {
    const { data, error } = await supabase
      .from('taller_ingresos')
      .select('*, taller_vehiculos(*, taller_clientes(*))')
      .eq('empresa_id', req.empresa_id)
      .in('estado', ['recepcion', 'diagnostico', 'en_reparacion', 'cotizacion']);
      
    if (error) throw error;
    res.json(data);
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
        estado: 'recepcion', // Estado inicial por defecto
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
