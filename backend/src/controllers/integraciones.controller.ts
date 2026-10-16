import { Request, Response } from 'express';
import { supabase } from '../config/supabase';
import { generarApiKey } from '../middlewares/apiKey.middleware';
import { sumarItemsFactura } from '../utils/facturaUtils';

const ESTADOS_CERRADOS = ['entregado', 'cancelado'];
const MAX_INGRESOS = 50;

const normalizarPlaca = (placa: string): string =>
  String(placa || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();

// ──────── ADMINISTRACIÓN DE API KEYS (requireAuth) ────────

/**
 * POST /api/integraciones/keys
 * Crea una API key. La key completa SOLO se devuelve en esta respuesta.
 */
export const crearApiKey = async (req: Request, res: Response): Promise<void> => {
  try {
    const nombre = String(req.body?.nombre || '').trim();
    if (!nombre) {
      res.status(400).json({ error: 'El nombre de la integración es requerido.' });
      return;
    }

    const { key, prefix, hash } = generarApiKey();

    const { data, error } = await supabase
      .from('taller_api_keys')
      .insert({
        empresa_id: req.empresa_id,
        nombre,
        key_prefix: prefix,
        key_hash: hash,
        creada_por: req.user_email,
      })
      .select('id, nombre, key_prefix, scopes, created_at')
      .single();

    if (error) throw error;

    res.status(201).json({
      ...data,
      api_key: key,
      advertencia: 'Guarda esta key ahora. No se volverá a mostrar.',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * GET /api/integraciones/keys
 */
export const listarApiKeys = async (req: Request, res: Response): Promise<void> => {
  try {
    const { data, error } = await supabase
      .from('taller_api_keys')
      .select('id, nombre, key_prefix, scopes, activa, creada_por, ultimo_uso, revocada_at, created_at')
      .eq('empresa_id', req.empresa_id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * DELETE /api/integraciones/keys/:id
 * Revoca la key (soft delete para conservar auditoría).
 */
export const revocarApiKey = async (req: Request, res: Response): Promise<void> => {
  try {
    const { data, error } = await supabase
      .from('taller_api_keys')
      .update({ activa: false, revocada_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('empresa_id', req.empresa_id)
      .select('id');

    if (error) throw error;
    if (!data || data.length === 0) {
      res.status(404).json({ error: 'API key no encontrada.' });
      return;
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// ──────── CONSULTA PARA INTEGRACIONES (requireApiKey) ────────

/**
 * GET /api/integraciones/v1/vehiculos/:placa/historial
 * Indica si el vehículo está en el taller y devuelve su historial de ingresos
 * con estados, tiempos por estado y bitácora.
 * No expone datos personales del cliente (Habeas Data, Ley 1581 de 2012).
 */
export const getHistorialVehiculo = async (req: Request, res: Response): Promise<void> => {
  try {
    const placa = normalizarPlaca(String(req.params.placa));
    if (placa.length < 5 || placa.length > 8) {
      res.status(400).json({ error: 'Placa inválida.' });
      return;
    }

    // Coincidencia exacta tolerante a guiones/espacios guardados en BD:
    // filtro amplio con ILIKE y luego comparación normalizada en memoria.
    const { data: candidatos, error: vehError } = await supabase
      .from('taller_vehiculos')
      .select('id, placa, marca, linea, modelo_anio, color')
      .eq('empresa_id', req.empresa_id)
      .ilike('placa', `%${placa.split('').join('%')}%`)
      .limit(20);

    if (vehError) throw vehError;

    const vehiculos = (candidatos || []).filter((v: any) => normalizarPlaca(v.placa) === placa);

    if (vehiculos.length === 0) {
      res.json({ placa, encontrado: false, en_taller: false, vehiculo: null, ingreso_activo: null, ingresos: [] });
      return;
    }

    const { data: ingresos, error: ingError } = await supabase
      .from('taller_ingresos')
      .select('id, vehiculo_id, estado, estado_desde, fecha_ingreso, updated_at, kilometraje, nivel_gasolina, motivo_visita, items_factura')
      .eq('empresa_id', req.empresa_id)
      .in('vehiculo_id', vehiculos.map((v: any) => v.id))
      .order('fecha_ingreso', { ascending: false })
      .limit(MAX_INGRESOS);

    if (ingError) throw ingError;

    const ingresoIds = (ingresos || []).map((i: any) => i.id);
    let tiempos: any[] = [];
    let bitacora: any[] = [];

    if (ingresoIds.length > 0) {
      const [tiemposRes, bitacoraRes] = await Promise.all([
        supabase
          .from('taller_ingresos_tiempos')
          .select('*')
          .eq('empresa_id', req.empresa_id)
          .in('ingreso_id', ingresoIds),
        supabase
          .from('taller_ingresos_bitacora')
          .select('ingreso_id, tipo_evento, titulo, descripcion, created_at')
          .eq('empresa_id', req.empresa_id)
          .in('ingreso_id', ingresoIds)
          .order('created_at', { ascending: true }),
      ]);
      if (tiemposRes.error) throw tiemposRes.error;
      if (bitacoraRes.error) throw bitacoraRes.error;
      tiempos = tiemposRes.data || [];
      bitacora = bitacoraRes.data || [];
    }

    const ahora = Date.now();
    const historial = (ingresos || []).map((ing: any) => {
      const activo = !ESTADOS_CERRADOS.includes(ing.estado);
      const eventos = bitacora.filter(b => b.ingreso_id === ing.id);

      // Fecha de salida: el evento 'entrega'/'cancelacion' de la bitácora es la fuente
      // de verdad (bitácora ordenada asc → primer evento). Fallback a updated_at para
      // registros anteriores a la bitácora, marcado como 'estimada'.
      let fechaSalida: string | null = null;
      let fechaSalidaFuente: 'bitacora' | 'estimada' | null = null;
      if (!activo) {
        const tipoCierre = ing.estado === 'entregado' ? 'entrega' : 'cancelacion';
        const eventoCierre = eventos.find(b => b.tipo_evento === tipoCierre);
        fechaSalida = eventoCierre?.created_at ?? ing.updated_at ?? null;
        fechaSalidaFuente = eventoCierre ? 'bitacora' : (fechaSalida ? 'estimada' : null);
      }

      const finMs = fechaSalida ? new Date(fechaSalida).getTime() : ahora;
      const duracionMinutos = ing.fecha_ingreso
        ? Math.max(0, Math.round((finMs - new Date(ing.fecha_ingreso).getTime()) / 60000))
        : null;

      return {
        id: ing.id,
        estado: ing.estado,
        activo,
        fecha_ingreso: ing.fecha_ingreso,
        fecha_salida: fechaSalida,
        fecha_salida_fuente: fechaSalidaFuente,
        duracion_estadia_minutos: duracionMinutos,
        duracion_estadia_dias: duracionMinutos !== null ? Math.round((duracionMinutos / 1440) * 10) / 10 : null,
        estado_desde: ing.estado_desde,
        minutos_en_estado_actual: activo && ing.estado_desde
          ? Math.round((ahora - new Date(ing.estado_desde).getTime()) / 60000)
          : null,
        ultima_actualizacion: ing.updated_at,
        kilometraje: ing.kilometraje,
        nivel_gasolina: ing.nivel_gasolina,
        motivo_visita: ing.motivo_visita,
        total_factura: sumarItemsFactura(ing.items_factura),
        tiempos_por_estado: tiempos
          .filter(t => t.ingreso_id === ing.id)
          .map(t => ({ estado: t.estado, duracion_minutos: t.duracion_minutos, registrado_at: t.created_at ?? null })),
        bitacora: eventos.map(b => ({ tipo_evento: b.tipo_evento, titulo: b.titulo, descripcion: b.descripcion, fecha: b.created_at })),
      };
    });

    const ingresoActivo = historial.find(i => i.activo) || null;
    const { id: _id, ...vehiculo } = vehiculos[0] as any;

    res.json({
      placa,
      encontrado: true,
      en_taller: !!ingresoActivo,
      vehiculo,
      ingreso_activo: ingresoActivo,
      ingresos: historial,
    });
  } catch (err: any) {
    console.error('[getHistorialVehiculo] Error:', err.message);
    res.status(500).json({ error: 'Error consultando el historial.' });
  }
};
