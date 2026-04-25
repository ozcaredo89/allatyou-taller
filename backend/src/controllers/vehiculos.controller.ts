import { Request, Response } from 'express';
import { supabase } from '../config/supabase';

export const getVehiculos = async (req: Request, res: Response): Promise<void> => {
  try {
    const { data, error } = await supabase
      .from('taller_vehiculos')
      .select('*, taller_clientes(*)')
      .eq('empresa_id', req.empresa_id);

    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getVehiculoByPlaca = async (req: Request, res: Response): Promise<void> => {
  try {
    const { placa } = req.params;
    const { data, error } = await supabase
      .from('taller_vehiculos')
      .select('*, taller_clientes(*)')
      .eq('empresa_id', req.empresa_id)
      .eq('placa', String(placa).toUpperCase())
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    if (!data) {
      res.status(404).json({ error: 'Vehiculo no encontrado' });
      return;
    }
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const createVehiculo = async (req: Request, res: Response): Promise<void> => {
  try {
    const { cliente_id, placa, marca, linea, modelo_anio, color } = req.body;
    
    const { data: existing } = await supabase
      .from('taller_vehiculos')
      .select('*')
      .eq('empresa_id', req.empresa_id)
      .eq('placa', String(placa).toUpperCase())
      .single();

    if (existing) {
       res.status(400).json({ error: 'Vehiculo con placa ya existe' });
       return;
    }

    const { data, error } = await supabase
      .from('taller_vehiculos')
      .insert([{ 
        cliente_id, 
        placa: String(placa).toUpperCase(), 
        marca, 
        linea, 
        modelo_anio, 
        color,
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
