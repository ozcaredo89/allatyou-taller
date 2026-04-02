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
