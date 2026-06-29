import { Request, Response } from 'express';
import { supabase } from '../config/supabase';

// GET /api/kiosco/:slug - Pública
export const getEmpresaBySlug = async (req: Request, res: Response): Promise<void> => {
  try {
    const { slug } = req.params;
    const { data, error } = await supabase
      .from('taller_empresas')
      .select('id, nombre, telefono_contacto, config_diagnostico')
      .eq('slug', slug)
      .single();

    if (error || !data) {
      res.status(404).json({ error: 'Empresa no encontrada.' });
      return;
    }
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// POST /api/kiosco/check-placa - Pública
export const checkPlaca = async (req: Request, res: Response): Promise<void> => {
  try {
    const { placa, empresa_id } = req.body;
    if (!placa || !empresa_id) {
      res.status(400).json({ error: 'Placa y empresa_id son requeridos.' });
      return;
    }

    const { data } = await supabase
      .from('taller_vehiculos')
      .select('id, placa, marca, linea, taller_clientes(id, nombre_completo, telefono, documento)')
      .eq('empresa_id', empresa_id)
      .eq('placa', String(placa).toUpperCase())
      .single();

    res.json({
      existe: !!data,
      vehiculo: data || null,
      nombre_cliente: data?.taller_clientes ? (data.taller_clientes as any).nombre_completo : null,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// POST /api/kiosco/registrar - Pública
export const registrarIngresoKiosco = async (req: Request, res: Response): Promise<void> => {
  try {
    const { empresa_id, placa, motivo_visita, cliente, vehiculo } = req.body;

    if (!empresa_id || !placa || !motivo_visita) {
      res.status(400).json({ error: 'Faltan campos requeridos.' });
      return;
    }

    let vehiculo_id: string;

    // Verificar si el vehículo ya existe
    const { data: existingVehiculo } = await supabase
      .from('taller_vehiculos')
      .select('id')
      .eq('empresa_id', empresa_id)
      .eq('placa', String(placa).toUpperCase())
      .single();

    if (existingVehiculo) {
      vehiculo_id = existingVehiculo.id;
    } else {
      // Crear cliente primero
      if (!cliente?.nombre_completo || !cliente?.telefono) {
        res.status(400).json({ error: 'Datos del cliente requeridos para vehículo nuevo.' });
        return;
      }

      const { data: nuevoCliente, error: clienteError } = await supabase
        .from('taller_clientes')
        .insert({
          empresa_id,
          nombre_completo: cliente.nombre_completo.trim(),
          telefono: cliente.telefono.trim(),
          documento: cliente.documento?.trim() || '',
          email: cliente.email?.trim() || '',
        })
        .select()
        .single();

      if (clienteError) throw clienteError;

      // Crear vehículo
      const { data: nuevoVehiculo, error: vehiculoError } = await supabase
        .from('taller_vehiculos')
        .insert({
          empresa_id,
          cliente_id: nuevoCliente.id,
          placa: String(placa).toUpperCase(),
          marca: vehiculo?.marca?.trim() || 'No especificado',
          linea: vehiculo?.linea?.trim() || 'No especificado',
          color: 'No especificado',
        })
        .select()
        .single();

      if (vehiculoError) throw vehiculoError;
      vehiculo_id = nuevoVehiculo.id;
    }

    // Crear ingreso
    const { data: ingreso, error: ingresoError } = await supabase
      .from('taller_ingresos')
      .insert({
        empresa_id,
        vehiculo_id,
        motivo_visita: motivo_visita.trim(),
        estado: 'recepcion',
        estado_desde: new Date().toISOString(),
        kilometraje: 0,
        nivel_gasolina: 'No especificado',
      })
      .select()
      .single();

    if (ingresoError) throw ingresoError;
    res.status(201).json({ success: true, ingreso_id: ingreso.id });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
