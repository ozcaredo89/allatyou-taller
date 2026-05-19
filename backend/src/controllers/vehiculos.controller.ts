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
      res.status(200).json(null);
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
    if (error.code === '23505') {
      res.status(400).json({ error: 'Este vehículo ya se encuentra registrado en tu taller.' });
      return;
    }
    res.status(500).json({ error: error.message });
  }
};

export const updateVehiculo = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { placa, marca, linea, modelo_anio, color } = req.body;
    
    const placaToSave = String(placa).toUpperCase();

    // Validar unicidad de placa (asegurar que no existe en OTRO id)
    const { data: existing } = await supabase
      .from('taller_vehiculos')
      .select('id')
      .eq('empresa_id', req.empresa_id)
      .eq('placa', placaToSave)
      .neq('id', id)
      .single();

    if (existing) {
       res.status(400).json({ error: 'Esta placa ya está registrada en otro vehículo.' });
       return;
    }

    const { data, error } = await supabase
      .from('taller_vehiculos')
      .update({ 
        placa: placaToSave, 
        marca, 
        linea, 
        modelo_anio, 
        color 
      })
      .eq('id', id)
      .eq('empresa_id', req.empresa_id)
      .select('*, taller_clientes(*)')
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    if (error.code === '23505') {
      res.status(400).json({ error: 'Esta placa ya está registrada en otro vehículo.' });
      return;
    }
    res.status(500).json({ error: error.message });
  }
};
