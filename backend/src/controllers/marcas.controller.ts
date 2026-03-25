import { Request, Response } from 'express';
import { supabase } from '../config/supabase';

// Obtiene todas las marcas
export const getMarcas = async (req: Request, res: Response): Promise<void> => {
  try {
    const { data, error } = await supabase
      .from('taller_marcas')
      .select('*')
      .eq('empresa_id', req.empresa_id)
      .order('nombre', { ascending: true });
      
    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// Crea una nueva marca
export const createMarca = async (req: Request, res: Response): Promise<void> => {
  try {
    const { nombre } = req.body;
    
    const { data: existing } = await supabase
      .from('taller_marcas')
      .select('*')
      .eq('empresa_id', req.empresa_id)
      .ilike('nombre', nombre)
      .single();

    if (existing) {
       res.status(200).json(existing);
       return;
    }

    const { data, error } = await supabase
      .from('taller_marcas')
      .insert([{ nombre, empresa_id: req.empresa_id }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// Obtiene las líneas dada una marca_id
export const getLineasByMarca = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params; // marca_id
    const { data, error } = await supabase
      .from('taller_lineas')
      .select('*')
      .eq('empresa_id', req.empresa_id)
      .eq('marca_id', id)
      .order('nombre', { ascending: true });
      
    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// Crea una nueva línea para una marca específica
export const createLinea = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params; // marca_id
    const { nombre } = req.body;

    const { data: existing } = await supabase
      .from('taller_lineas')
      .select('*')
      .eq('empresa_id', req.empresa_id)
      .eq('marca_id', id)
      .ilike('nombre', nombre)
      .single();

    if (existing) {
       res.status(200).json(existing);
       return;
    }

    const { data, error } = await supabase
      .from('taller_lineas')
      .insert([{ marca_id: id, nombre, empresa_id: req.empresa_id }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
