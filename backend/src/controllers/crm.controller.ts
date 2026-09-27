import { Request, Response } from 'express';
import { supabase } from '../config/supabase';

// ─── Retención Predictiva ─────────────────────────────────────────────────────
// GET /api/crm/retencion
// Retorna vehículos agrupados por cliente con todos sus servicios pendientes.
// Los intervalos (meses/km) se leen de config_crm_intervalos de la empresa para
// que cada taller pueda ajustarlos sin tocar el código.
export const getRetencionProspectos = async (req: Request, res: Response): Promise<void> => {
  try {
    // 1. Obtener configuración de intervalos de la empresa
    const { data: empresa, error: errEmpresa } = await supabase
      .from('taller_empresas')
      .select('config_crm_intervalos')
      .eq('id', req.empresa_id)
      .single();

    if (errEmpresa) throw errEmpresa;

    // Intervalos con fallback a valores por defecto
    const intervalos = empresa?.config_crm_intervalos ?? {
      aceite: { meses: 6, km: 5000 },
      frenos: { meses: 12, km: 20000 },
      aire: { meses: 12, km: 10000 },
      general: { meses: 6, km: 10000 },
    };

    // 2. Consultar la vista en tiempo real
    const { data, error } = await supabase
      .from('taller_mv_proximos_mantenimientos')
      .select('*')
      .eq('empresa_id', req.empresa_id)
      .order('fecha_sugerida', { ascending: true });

    if (error) throw error;

    // 3. Agrupar por vehiculo_id: consolidar múltiples servicios por vehículo
    //    y recalcular fecha_sugerida con los intervalos configurables
    const mapa: Record<string, any> = {};
    for (const row of data || []) {
      const key = row.vehiculo_id;
      const interval = intervalos[row.categoria as string] ?? intervalos['general'];

      // Recalcular fecha_sugerida con el intervalo del taller (no el de la vista)
      const fechaBase = new Date(row.ultima_fecha);
      const fechaSugerida = new Date(fechaBase);
      fechaSugerida.setMonth(fechaSugerida.getMonth() + (interval?.meses ?? 6));

      const kmSugerido = (row.ultimo_kilometraje ?? 0) + (interval?.km ?? 5000);
      const isVencido = fechaSugerida < new Date();

      const servicio = {
        categoria: row.categoria,
        ultima_fecha: row.ultima_fecha,
        ultimo_kilometraje: row.ultimo_kilometraje,
        fecha_sugerida: fechaSugerida.toISOString(),
        kilometraje_sugerido: kmSugerido,
        is_vencido: isVencido,
      };

      if (!mapa[key]) {
        mapa[key] = {
          vehiculo_id: row.vehiculo_id,
          placa: row.placa,
          marca: row.marca,
          linea: row.linea,
          cliente_id: row.cliente_id,
          cliente_nombre: row.cliente_nombre,
          cliente_telefono: row.cliente_telefono,
          empresa_id: row.empresa_id,
          servicios: [],
          // La fecha más próxima entre todos los servicios (para ordenar)
          fecha_sugerida_min: fechaSugerida.toISOString(),
          algun_vencido: isVencido,
        };
      }

      mapa[key].servicios.push(servicio);
      // Actualizar mínima fecha sugerida
      if (fechaSugerida < new Date(mapa[key].fecha_sugerida_min)) {
        mapa[key].fecha_sugerida_min = fechaSugerida.toISOString();
      }
      if (isVencido) mapa[key].algun_vencido = true;
    }

    // 4. Convertir a array y ordenar por urgencia
    const resultado = Object.values(mapa).sort((a: any, b: any) => {
      // Vencidos primero, luego por fecha más próxima
      if (a.algun_vencido !== b.algun_vencido) return a.algun_vencido ? -1 : 1;
      return new Date(a.fecha_sugerida_min).getTime() - new Date(b.fecha_sugerida_min).getTime();
    });

    res.json(resultado);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// ─── Reseñas de Google ────────────────────────────────────────────────────────
// GET /api/crm/resenas
// Retorna órdenes entregadas en los últimos 60 días donde el cliente:
//   - acepta_whatsapp = true
//   - NO tuvo reseña solicitada en los últimos 365 días (por cliente, no por orden)
export const getResenasPendientes = async (req: Request, res: Response): Promise<void> => {
  try {
    const hace60Dias = new Date();
    hace60Dias.setDate(hace60Dias.getDate() - 60);

    const { data, error } = await supabase
      .from('taller_ingresos')
      .select(`
        id, fecha_ingreso, resena_estado, resena_solicitada_at, updated_at,
        items_factura, motivo_visita,
        taller_vehiculos!inner(
          id, placa, marca, linea,
          taller_clientes!inner(
            id, nombre_completo, telefono, acepta_whatsapp, ultima_resena_solicitada_at
          )
        )
      `)
      .eq('empresa_id', req.empresa_id)
      .eq('estado', 'entregado')
      .eq('taller_vehiculos.taller_clientes.acepta_whatsapp', true)
      .gte('updated_at', hace60Dias.toISOString())
      .order('updated_at', { ascending: false });

    if (error) throw error;

    const hace365Dias = new Date();
    hace365Dias.setFullYear(hace365Dias.getFullYear() - 1);

    // Filtrar: un cliente no recibe solicitud de reseña si ya la recibió en el último año
    const filtrado = (data || []).filter((ingreso: any) => {
      const cliente = ingreso.taller_vehiculos?.taller_clientes;
      if (!cliente || !cliente.acepta_whatsapp) return false;
      if (!cliente.ultima_resena_solicitada_at) return true;
      return new Date(cliente.ultima_resena_solicitada_at) < hace365Dias;
    });

    res.json(filtrado);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// ─── Marcar reseña como "intentado" ──────────────────────────────────────────
// POST /api/crm/resenas/:id/intentar
export const marcarResenaIntentado = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('taller_ingresos')
      .update({
        resena_estado: 'intentado',
        resena_solicitada_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('empresa_id', req.empresa_id);

    if (error) throw error;
    res.json({ success: true, estado: 'intentado' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// ─── Confirmar envío de reseña ────────────────────────────────────────────────
// POST /api/crm/resenas/:id/confirmar
export const confirmarResena = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // 1. Obtener el ingreso para saber qué cliente actualizar
    const { data: ingreso, error: errIngreso } = await supabase
      .from('taller_ingresos')
      .select('taller_vehiculos(taller_clientes(id))')
      .eq('id', id)
      .eq('empresa_id', req.empresa_id)
      .single();

    if (errIngreso || !ingreso) {
      res.status(404).json({ error: 'Ingreso no encontrado.' });
      return;
    }

    const now = new Date().toISOString();

    // 2. Actualizar el estado de la orden
    const { error: errIngreso2 } = await supabase
      .from('taller_ingresos')
      .update({ resena_estado: 'confirmado', resena_solicitada_at: now })
      .eq('id', id)
      .eq('empresa_id', req.empresa_id);

    if (errIngreso2) throw errIngreso2;

    // 3. Actualizar la fecha en el cliente (control de frecuencia anual)
    const clienteId = (ingreso as any).taller_vehiculos?.taller_clientes?.id;
    if (clienteId) {
      await supabase
        .from('taller_clientes')
        .update({ ultima_resena_solicitada_at: now })
        .eq('id', clienteId);
    }

    res.json({ success: true, estado: 'confirmado' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// ─── Deshacer intento de reseña ───────────────────────────────────────────────
// POST /api/crm/resenas/:id/deshacer
export const deshacerResena = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('taller_ingresos')
      .update({ resena_estado: 'pendiente', resena_solicitada_at: null })
      .eq('id', id)
      .eq('empresa_id', req.empresa_id);

    if (error) throw error;
    res.json({ success: true, estado: 'pendiente' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// ─── Config CRM de la empresa (Google URL + intervalos) ──────────────────────
// GET /api/crm/config
export const getCrmConfig = async (req: Request, res: Response): Promise<void> => {
  try {
    const { data, error } = await supabase
      .from('taller_empresas')
      .select('nombre, google_review_url, config_crm_intervalos')
      .eq('id', req.empresa_id)
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// ─── Actualizar Config CRM ────────────────────────────────────────────────────
// PUT /api/crm/config
export const updateCrmConfig = async (req: Request, res: Response): Promise<void> => {
  try {
    const { google_review_url, config_crm_intervalos } = req.body;

    const updates: Record<string, any> = {};
    if (google_review_url !== undefined) updates.google_review_url = google_review_url;
    if (config_crm_intervalos !== undefined) updates.config_crm_intervalos = config_crm_intervalos;

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: 'No hay campos para actualizar.' });
      return;
    }

    const { error } = await supabase
      .from('taller_empresas')
      .update(updates)
      .eq('id', req.empresa_id);

    if (error) throw error;
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// ─── Gestión de no_contactar por cliente ─────────────────────────────────────
// PATCH /api/crm/clientes/:clienteId/no-contactar
export const toggleNoContactar = async (req: Request, res: Response): Promise<void> => {
  try {
    const { clienteId } = req.params;
    const { acepta_whatsapp } = req.body;

    if (typeof acepta_whatsapp !== 'boolean') {
      res.status(400).json({ error: 'Campo acepta_whatsapp debe ser booleano.' });
      return;
    }

    const { error } = await supabase
      .from('taller_clientes')
      .update({ acepta_whatsapp })
      .eq('id', clienteId)
      .eq('empresa_id', req.empresa_id);

    if (error) throw error;
    res.json({ success: true, acepta_whatsapp });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
