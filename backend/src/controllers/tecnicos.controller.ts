import { Request, Response } from 'express';
import { supabase } from '../config/supabase';

export const getTecnicos = async (req: Request, res: Response): Promise<void> => {
  try {
    const { data, error } = await supabase
      .from('taller_tecnicos')
      .select('id, nombre, estado')
      .eq('empresa_id', req.empresa_id)
      .order('nombre', { ascending: true });

    if (error) throw error;
    res.json(data || []);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const createTecnico = async (req: Request, res: Response): Promise<void> => {
  try {
    const { nombre } = req.body;
    
    if (!nombre || !nombre.trim()) {
      res.status(400).json({ error: 'El nombre del técnico es requerido.' });
      return;
    }

    const { data, error } = await supabase
      .from('taller_tecnicos')
      .insert({
        empresa_id: req.empresa_id,
        nombre: nombre.trim()
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const updateTecnico = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { nombre } = req.body;

    if (!nombre || !nombre.trim()) {
      res.status(400).json({ error: 'El nombre del técnico es requerido.' });
      return;
    }

    const { data, error } = await supabase
      .from('taller_tecnicos')
      .update({ nombre: nombre.trim() })
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

export const deleteTecnico = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('taller_tecnicos')
      .delete()
      .eq('id', id)
      .eq('empresa_id', req.empresa_id);

    if (error) throw error;
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

