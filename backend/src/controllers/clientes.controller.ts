import { Request, Response } from 'express';
import { supabase } from '../config/supabase';

export const getClientes = async (req: Request, res: Response): Promise<void> => {
  try {
    const { data, error } = await supabase
      .from('taller_clientes')
      .select('*')
      .eq('empresa_id', req.empresa_id);

    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getClienteByDocumento = async (req: Request, res: Response): Promise<void> => {
  try {
    const { documento } = req.params;
    const { data, error } = await supabase
      .from('taller_clientes')
      .select('*')
      .eq('empresa_id', req.empresa_id)
      .eq('documento', documento)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error; // PGRST116 is not found
    if (!data) {
      res.status(200).json(null);
      return;
    }
    
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const createCliente = async (req: Request, res: Response): Promise<void> => {
  try {
    const { documento, nombre_completo, telefono, email } = req.body;
    
    // UPSERT or Insert Check
    const { data: existing } = await supabase
      .from('taller_clientes')
      .select('*')
      .eq('empresa_id', req.empresa_id)
      .eq('documento', documento)
      .single();
      
    if (existing) {
       res.status(400).json({ error: 'Ya existe un cliente registrado con este documento en tu taller.' });
       return;
    }

    const { data, error } = await supabase
      .from('taller_clientes')
      .insert([{ documento, nombre_completo, telefono, email, empresa_id: req.empresa_id }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (error: any) {
    if (error.code === '23505') {
      const mensaje = error.message.includes('documento')
        ? 'Ya existe un cliente registrado con este documento en tu taller.'
        : 'Este cliente ya se encuentra registrado.';
      res.status(400).json({ error: mensaje });
      return;
    }
    res.status(500).json({ error: error.message });
  }
};

export const updateCliente = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { documento, nombre_completo, telefono, email } = req.body;

    // Validar unicidad de documento (asegurar que no existe en OTRO id)
    const { data: existing } = await supabase
      .from('taller_clientes')
      .select('id')
      .eq('empresa_id', req.empresa_id)
      .eq('documento', documento)
      .neq('id', id)
      .single();

    if (existing) {
       res.status(400).json({ error: 'Este documento ya está registrado en otro cliente.' });
       return;
    }

    const { data, error } = await supabase
      .from('taller_clientes')
      .update({ documento, nombre_completo, telefono, email })
      .eq('id', id)
      .eq('empresa_id', req.empresa_id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    if (error.code === '23505') {
      res.status(400).json({ error: 'Este documento ya está registrado en otro cliente.' });
      return;
    }
    res.status(500).json({ error: error.message });
  }
};
