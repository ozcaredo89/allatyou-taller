import { Request, Response } from 'express';
import { supabase } from '../config/supabase';

export const getRetencionProspectos = async (req: Request, res: Response): Promise<void> => {
  try {
    const { data, error } = await supabase
      .from('taller_mv_proximos_mantenimientos')
      .select('*')
      .eq('empresa_id', req.empresa_id)
      .order('fecha_sugerida', { ascending: true });

    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
