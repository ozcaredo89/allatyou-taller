import { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { seguimientoDb, seguimientoDbSiConfigurada } from '../config/seguimientoDb';
import { comprimirEvidencias, EvidenciaInvalida, evidenciasTabla } from '../services/seguimientoEvidencias';
import { supabase } from '../config/supabase';
import { consultarVentasMostrador, resumirVentasMostradorPorDia } from '../services/ventasMostrador.service';
import { toBogotaDateStr, bogotaToday, getBogotaRange, bogotaDayBounds } from '../utils/dateUtils';
import { sumarItemsFactura } from '../utils/facturaUtils';
import { pareceManoObra } from '../utils/tipoItemUtils';
import {
  obtenerVentanaConsultaGastos,
  calcularGastosPeriodoConProrrateo,
} from '../utils/gastosProrrateo';
import {
  sincronizarPreciosOrdenEntregada,
  eliminarPreciosOrdenEntregada,
  obtenerSugerenciasCatalogoTaller
} from '../services/catalog.service';
import {
  evaluarAplicaRenting,
  procesarSincronizacionRenting,
  consultarLeasingRenting,
  LeasingSyncOptions
} from '../services/allatyouSync.service';

// ─── Helper: Registrar evento en la bitácora ─────────────────────────────────
// El cambio de ESTADO queda cubierto por el Trigger SQL (fn_bitacora_cambio_estado).
// Este helper se usa para eventos que el trigger no puede capturar (asignaciones, notas, etc.)
async function registrarEventoBitacora(
  empresa_id: string,
  ingreso_id: string,
  tipo_evento: string,
  titulo: string,
  descripcion?: string,
  metadata?: Record<string, any>
): Promise<void> {
  const { error } = await supabase
    .from('taller_ingresos_bitacora')
    .insert({
      empresa_id,
      ingreso_id,
      tipo_evento,
      titulo,
      descripcion: descripcion || null,
      metadata: metadata || {},
    });
  if (error) {
    console.error(`[bitacora] Error registrando evento '${tipo_evento}':`, error.message);
  }
}

// Obtiene todos los ingresos que actualmente están en el taller activos
// Incluye estado_desde y promedios históricos de SLA por empresa
export const getIngresosActivos = async (req: Request, res: Response): Promise<void> => {
  try {
    const [{ data, error }, { data: empresaCfg }, { data: tiempos }] = await Promise.all([
      supabase
        .from('taller_ingresos')
        .select('*, taller_vehiculos(*, taller_clientes(*)), taller_ingresos_tecnicos(taller_tecnicos(id, nombre))')
        .eq('empresa_id', req.empresa_id)
        .in('estado', ['recepcion', 'diagnostico', 'cotizacion', 'esperando_aprobacion', 'en_reparacion']),
      supabase
        .from('taller_empresas')
        .select('intervalo_seguimiento_horas')
        .eq('id', req.empresa_id)
        .maybeSingle(),
      supabase
        .from('taller_ingresos_tiempos')
        .select('estado, duracion_minutos')
        .eq('empresa_id', req.empresa_id)
    ]);

    if (error) throw error;

    const intervaloSeguimientoHoras: number = empresaCfg?.intervalo_seguimiento_horas || 6;

    // Calcular promedios SLA por estado para esta empresa
    const promediosSLA: Record<string, number> = {};
    if (tiempos && tiempos.length > 0) {
      const agrupado: Record<string, number[]> = {};
      tiempos.forEach((t: any) => {
        if (!agrupado[t.estado]) agrupado[t.estado] = [];
        agrupado[t.estado].push(t.duracion_minutos);
      });
      Object.keys(agrupado).forEach(estado => {
        const arr = agrupado[estado];
        promediosSLA[estado] = Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
      });
    }

    const ahoraMs = Date.now();
    const ingresosConRenting = (data || []).map((ing: any) => {
      const estadoDesdeMs = ing.estado_desde ? new Date(ing.estado_desde).getTime() : new Date(ing.fecha_ingreso).getTime();
      const ultActMs = ing.ultima_actualizacion_estado
        ? new Date(ing.ultima_actualizacion_estado).getTime()
        : estadoDesdeMs;

      const minutosEnEstado = Math.max(0, Math.round((ahoraMs - estadoDesdeMs) / 60000));
      const horasSinActualizacion = Math.max(0, Number(((ahoraMs - ultActMs) / 3600000).toFixed(1)));
      const requiereActualizacion = horasSinActualizacion >= intervaloSeguimientoHoras;

      const promedioEstado = promediosSLA[ing.estado] || 0;
      const entregaEstMs = ing.fecha_entrega_estimada ? new Date(ing.fecha_entrega_estimada).getTime() : null;
      const minutosParaEntrega = entregaEstMs !== null ? Math.round((entregaEstMs - ahoraMs) / 60000) : null;

      let estadoDemora: 'vencido' | 'en_riesgo' | 'demorado_promedio' | 'a_tiempo' = 'a_tiempo';
      if (minutosParaEntrega !== null && minutosParaEntrega < 0) {
        estadoDemora = 'vencido';
      } else if (
        (minutosParaEntrega !== null && minutosParaEntrega <= 120) ||
        (promedioEstado > 0 && minutosEnEstado >= promedioEstado * 1.5)
      ) {
        estadoDemora = 'en_riesgo';
      } else if (promedioEstado > 0 && minutosEnEstado >= promedioEstado) {
        estadoDemora = 'demorado_promedio';
      }

      return {
        ...ing,
        aplica_renting: evaluarAplicaRenting(req.empresa_id, ing.taller_vehiculos?.taller_clientes?.documento),
        minutos_en_estado_actual: minutosEnEstado,
        horas_sin_actualizacion: horasSinActualizacion,
        requiere_actualizacion: requiereActualizacion,
        minutos_para_entrega: minutosParaEntrega,
        estado_demora: estadoDemora
      };
    });

    res.json({ ingresos: ingresosConRenting, promediosSLA, intervaloSeguimientoHoras });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// ─── Centinela ultra-liviano para sincronización del Dashboard sin saturar la BD ─────────
export const getCentinelaStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const empresa_id = req.empresa_id;
    if (!empresa_id) {
      res.status(401).json({ error: 'No autorizado' });
      return;
    }

    // 1. Conteo exacto de vehículos activos
    const { count: totalActivos, error: errCount } = await supabase
      .from('taller_ingresos')
      .select('*', { count: 'exact', head: true })
      .eq('empresa_id', empresa_id)
      .in('estado', ['recepcion', 'diagnostico', 'cotizacion', 'esperando_aprobacion', 'en_reparacion']);

    if (errCount) throw errCount;

    // 2. Última bitácora (cambio de estado, nota, técnicos, entregas, cancelaciones)
    const { data: ultBitacora, error: errBitacora } = await supabase
      .from('taller_ingresos_bitacora')
      .select('created_at')
      .eq('empresa_id', empresa_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (errBitacora) throw errBitacora;

    const latestTimestamp = ultBitacora?.created_at || '0';

    // Generar version token (conteo_timestamp)
    const version = `${totalActivos ?? 0}_${latestTimestamp}`;

    res.json({
      version,
      totalActivos: totalActivos ?? 0,
      lastModified: latestTimestamp,
      timestamp: Date.now()
    });
  } catch (error: any) {
    console.error('[getCentinelaStatus] Error:', error?.message);
    res.status(500).json({ error: 'Error interno consultando estado del centinela' });
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
    const historialConRenting = (data || []).map((ing: any) => ({
      ...ing,
      aplica_renting: evaluarAplicaRenting(req.empresa_id, ing.taller_vehiculos?.taller_clientes?.documento)
    }));
    res.json(historialConRenting);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * GET /api/ingresos/buscar
 * Busca órdenes por placa de vehículo (activas y cerradas).
 * Usado para autocompletar en el módulo de gastos e ítems de repuestos.
 */
export const buscarIngresosPorPlaca = async (req: Request, res: Response): Promise<void> => {
  try {
    const { q, placa } = req.query;
    const raw = String(q || placa || '').trim();
    // Normalización: quita todo lo que no sea letra o número y pasa a mayúsculas
    const clean = raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (clean.length < 2) {
      res.json([]);
      return;
    }

    // Patrón tolerante a espacios y guiones: intercala comodines '%' entre cada carácter (%J%F%S%1%0%9%)
    const pattern = `%${clean.split('').join('%')}%`;

    const { data, error } = await supabase
      .from('taller_ingresos')
      .select(`
        id, estado, fecha_ingreso, items_factura, motivo_visita,
        taller_vehiculos!inner(placa, marca, linea, taller_clientes(nombre_completo, telefono))
      `)
      .eq('empresa_id', req.empresa_id)
      .eq('taller_vehiculos.empresa_id', req.empresa_id)
      .ilike('taller_vehiculos.placa', pattern)
      .neq('estado', 'cancelado')
      .order('fecha_ingreso', { ascending: false })
      .limit(30);

    if (error) throw error;

    const ordenes = data || [];

    // Priorizar en memoria: activas primero, luego entregado
    const prioridadEstado: Record<string, number> = {
      en_reparacion: 1,
      esperando_aprobacion: 2,
      cotizacion: 3,
      diagnostico: 4,
      recepcion: 5,
      entregado: 6
    };

    ordenes.sort((a: any, b: any) => {
      const pA = prioridadEstado[a.estado] || 99;
      const pB = prioridadEstado[b.estado] || 99;
      if (pA !== pB) return pA - pB;
      return new Date(b.fecha_ingreso).getTime() - new Date(a.fecha_ingreso).getTime();
    });

    const resultados = ordenes.slice(0, 15).map((ord: any) => {
      const itemsFactura = Array.isArray(ord.items_factura) ? ord.items_factura : [];
      const itemsRepuesto = itemsFactura
        .filter((i: any) => i && i.tipo === 'repuesto' && i.id)
        .map((i: any) => ({
          id: i.id,
          descripcion: i.descripcion,
          cantidad: i.cantidad || 1,
          total: i.total || 0,
        }));

      return {
        id: ord.id,
        estado: ord.estado,
        fecha_ingreso: ord.fecha_ingreso,
        motivo_visita: ord.motivo_visita,
        vehiculo: ord.taller_vehiculos,
        items_repuesto: itemsRepuesto
      };
    });

    res.json(resultados);
  } catch (error: any) {
    console.error('[buscarIngresosPorPlaca] Error:', error.message);
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

    // VALIDACIÓN: Evitar ingresos duplicados para el mismo vehículo
    const { data: ingresosActivos, error: chkError } = await supabase
      .from('taller_ingresos')
      .select('fecha_ingreso, taller_vehiculos(placa)')
      .eq('empresa_id', req.empresa_id)
      .eq('vehiculo_id', vehiculo_id)
      .in('estado', ['recepcion', 'diagnostico', 'cotizacion', 'esperando_aprobacion', 'en_reparacion'])
      .order('fecha_ingreso', { ascending: false })
      .limit(1);

    if (chkError) {
      console.error('[createIngreso] Error verificando duplicados:', chkError);
      throw chkError;
    }

    if (ingresosActivos && ingresosActivos.length > 0) {
      const placa = (ingresosActivos[0].taller_vehiculos as any)?.placa || 'Desconocida';
      const d = new Date(ingresosActivos[0].fecha_ingreso);
      const fechaFormat = new Intl.DateTimeFormat('es-CO', { dateStyle: 'short', timeStyle: 'short' }).format(d);
      res.status(400).json({ 
        error: `El vehículo con placa ${placa} ya tiene un ingreso activo del día ${fechaFormat}. Por favor gestione esa salida o cancele el ingreso anterior antes de crear uno nuevo.`
      });
      return;
    }

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
        estado: 'recepcion',
        estado_desde: new Date().toISOString(),
        empresa_id: req.empresa_id
      }])
      .select()
      .single();

    if (error) throw error;

    // Registrar evento de creación en la bitácora
    await registrarEventoBitacora(
      req.empresa_id!,
      data.id,
      'creacion',
      'Vehículo Recibido en Taller',
      `Motivo de visita: ${motivo_visita || 'No especificado'}`,
      { kilometraje, nivel_gasolina, motivo_visita }
    );

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
      .select('*, taller_vehiculos(*, taller_clientes(*)), taller_ingresos_tecnicos(taller_tecnicos(id, nombre))')
      .eq('empresa_id', req.empresa_id)
      .eq('id', id)
      .single();
      
    if (error) throw error;
    const clienteDoc = (data as any)?.taller_vehiculos?.taller_clientes?.documento;
    const aplicaRenting = evaluarAplicaRenting(req.empresa_id, clienteDoc);
    const inventario = data.estado === 'entregado' && tieneRepuestoDeInventario(data.items_factura)
      ? seguimientoDbSiConfigurada() : undefined;
    let faltantes: string[] = [];
    if (inventario) {
      try {
        const { rows: salidas } = await inventario.query(
          'SELECT ingreso_item_id FROM public.taller_inventario_salidas_vigentes WHERE empresa_id=$1 AND ingreso_id=$2',
          [req.empresa_id, id]
        );
        const descontadas = new Set(salidas.map(salida => salida.ingreso_item_id));
        faltantes = [...new Set<string>(data.items_factura
          .filter((item: any) => item?.tipo === 'repuesto' && item.inventario_item_id && !descontadas.has(item.id))
          .map((item: any) => item.descripcion || 'Repuesto'))];
      } catch (error: any) {
        if (error.code !== '42P01') throw error;
      }
    }
    res.json({ ...data, aplica_renting: aplicaRenting, inventario_faltantes: faltantes });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

function tieneRepuestoDeInventario(items: unknown): boolean {
  return Array.isArray(items) && items.some(item => item?.tipo === 'repuesto' && item.inventario_item_id);
}

export const updateIngreso = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const body = req.body;
    
    console.log(`[updateIngreso] id=${id} empresa_id=${req.empresa_id} body_keys=${Object.keys(body).join(',')}`);

    // 1. Obtener estado actual para SLA y comisiones
    const { data: current, error: fetchError } = await supabase
      .from('taller_ingresos')
      .select('estado, updated_at, estado_desde, fecha_entrega_estimada, reprogramaciones_count, items_factura, vehiculo_id, motivo_visita, kilometraje, nivel_gasolina, fecha_ingreso, renting_sync_at, taller_vehiculos(id, marca, linea, modelo_anio, color, placa, cliente_id, taller_clientes(id, documento, nombre_completo, telefono))')
      .eq('empresa_id', req.empresa_id)
      .eq('id', id)
      .single();

    if (fetchError) {
      console.error('[updateIngreso] Error fetching current state:', fetchError);
    }

    if (!current) {
      res.status(404).json({ error: 'Ingreso no encontrado.' });
      return;
    }

    // 2. Si viene un cambio de estado, registrar la transición SLA
    if (body.estado && current && current.estado !== body.estado) {
      // Resetear estado_desde y ultima_actualizacion_estado para el nuevo estado
      const nowIso = new Date().toISOString();
      body.estado_desde = nowIso;
      body.ultima_actualizacion_estado = nowIso;
    }

    // Separar campos del ingreso de campos relacionales o auxiliares
    const {
      taller_vehiculos,
      taller_ingresos_tecnicos,
      taller_clientes,
      vehiculo,
      cliente,
      vehiculo_datos,
      cliente_datos,
      motivo_reprogramacion,
      ...camposIngreso
    } = body;

    // Control de reprogramación si cambia fecha_entrega_estimada
    let cambioFechaEstimada: 'ninguno' | 'primera_vez' | 'reprogramacion' = 'ninguno';
    if (camposIngreso.fecha_entrega_estimada !== undefined && current) {
      const prevMs = current.fecha_entrega_estimada ? new Date(current.fecha_entrega_estimada).getTime() : null;
      const nextMs = camposIngreso.fecha_entrega_estimada ? new Date(camposIngreso.fecha_entrega_estimada).getTime() : null;
      if (nextMs !== null && prevMs === null) {
        cambioFechaEstimada = 'primera_vez';
        camposIngreso.ultima_actualizacion_estado = camposIngreso.ultima_actualizacion_estado || new Date().toISOString();
      } else if (nextMs !== null && prevMs !== null && Math.abs(nextMs - prevMs) > 60000) {
        cambioFechaEstimada = 'reprogramacion';
        camposIngreso.reprogramaciones_count = (current.reprogramaciones_count || 0) + 1;
        camposIngreso.ultima_actualizacion_estado = new Date().toISOString();
        if (motivo_reprogramacion) {
          camposIngreso.motivo_demora_actual = String(motivo_reprogramacion).trim();
        }
      }
    }

    // 1. Whitelist y validación estricta de vehiculo_datos (prevenir mass assignment y cruce de tenant)
    const safeVehiculoData: Record<string, any> = {};
    if (vehiculo_datos && typeof vehiculo_datos === 'object' && current?.vehiculo_id) {
      if (vehiculo_datos.placa !== undefined) {
        const cleanPlaca = String(vehiculo_datos.placa).trim().toUpperCase();
        if (cleanPlaca.length === 0) {
          res.status(400).json({ error: 'La placa no puede quedar vacía.' });
          return;
        }
        safeVehiculoData.placa = cleanPlaca;

        // Validar unicidad dentro del tenant si la placa cambió
        const currentPlaca = (current?.taller_vehiculos as any)?.placa;
        if (cleanPlaca !== currentPlaca && req.empresa_id) {
          const { data: vehDup } = await supabase
            .from('taller_vehiculos')
            .select('id')
            .eq('empresa_id', req.empresa_id)
            .eq('placa', cleanPlaca)
            .neq('id', current.vehiculo_id)
            .maybeSingle();

          if (vehDup) {
            res.status(409).json({ error: `La placa ${cleanPlaca} ya está registrada en otro vehículo.` });
            return;
          }
        }
      }
      if (vehiculo_datos.marca !== undefined) safeVehiculoData.marca = String(vehiculo_datos.marca).trim();
      if (vehiculo_datos.linea !== undefined) safeVehiculoData.linea = String(vehiculo_datos.linea).trim();
      if (vehiculo_datos.modelo_anio !== undefined) safeVehiculoData.modelo_anio = vehiculo_datos.modelo_anio ? Number(vehiculo_datos.modelo_anio) : null;
      if (vehiculo_datos.color !== undefined) safeVehiculoData.color = String(vehiculo_datos.color).trim();
    }

    // 2. Whitelist y validación estricta de cliente_datos
    const safeClienteData: Record<string, any> = {};
    if (cliente_datos && typeof cliente_datos === 'object') {
      if (cliente_datos.nombre_completo !== undefined) safeClienteData.nombre_completo = String(cliente_datos.nombre_completo).trim();
      if (cliente_datos.telefono !== undefined) safeClienteData.telefono = String(cliente_datos.telefono).trim();
    }

    delete camposIngreso.id;
    delete camposIngreso.empresa_id;
    delete camposIngreso.updated_at;
    if (Object.keys(camposIngreso).length > 0) {
      const versionAnterior = current.updated_at ? Date.parse(current.updated_at) : 0;
      camposIngreso.updated_at = new Date(Math.max(Date.now(), versionAnterior + 1)).toISOString();
    }
    const cambiaLineasOEstado = camposIngreso.estado !== undefined || camposIngreso.items_factura !== undefined;
    const cambiaInventario = cambiaLineasOEstado &&
      (tieneRepuestoDeInventario(current.items_factura) || tieneRepuestoDeInventario(camposIngreso.items_factura));
    const seleccion = '*, taller_vehiculos(*, taller_clientes(*)), taller_ingresos_tecnicos(taller_tecnicos(id, nombre))';
    let faltantesInventario: string[] = [];

    if (cambiaInventario) {
      const client = seguimientoDbSiConfigurada();
      if (!client) {
        res.status(503).json({ error: 'El inventario no está configurado para actualizar los repuestos de esta orden.' });
        return;
      }
      try {
        const { rows: [resultado] } = await client.query<{ faltantes: string[] }>(
          'SELECT public.actualizar_orden_inventario_operativo($1,$2,$3,$4,$5,$6) AS faltantes',
          [req.empresa_id, id, JSON.stringify(camposIngreso), req.user_email, current.estado, current.updated_at]
        );
        faltantesInventario = [...new Set(resultado.faltantes)];
      } catch (error: any) {
        if (error.code === '42883') {
          res.status(503).json({ error: 'La migración de inventario está pendiente en este entorno.' });
          return;
        }
        if (error.code === '22023' || error.code === '40001') {
          res.status(409).json({ error: error.message });
          return;
        }
        throw error;
      }
    }

    const tabla = supabase.from('taller_ingresos');
    const actualizacion = tabla.update(camposIngreso).eq('empresa_id', req.empresa_id).eq('id', id);
    if (cambiaLineasOEstado) {
      actualizacion.eq('estado', current.estado);
      if (current.updated_at == null) actualizacion.is('updated_at', null);
      else actualizacion.eq('updated_at', current.updated_at);
    }
    const query = cambiaInventario || Object.keys(camposIngreso).length === 0
      ? tabla.select(seleccion).eq('empresa_id', req.empresa_id).eq('id', id)
      : actualizacion.select(seleccion);
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    if (!data) {
      res.status(409).json({ error: 'La orden cambió. Actualiza la página antes de continuar.' });
      return;
    }

    if (body.estado && current.estado !== body.estado) {
      // Calcular duración en minutos del estado anterior
      const estadoDesde = current.estado_desde ? new Date(current.estado_desde).getTime() : Date.now();
      const duracionMinutos = Math.round((Date.now() - estadoDesde) / 60000);

      // Registrar el tiempo en la tabla de historial
      const { error: insertTiemposError } = await supabase
        .from('taller_ingresos_tiempos')
        .insert({
          ingreso_id: id,
          empresa_id: req.empresa_id,
          estado: current.estado,
          duracion_minutos: duracionMinutos
        });

      if (insertTiemposError) {
        console.error('[updateIngreso] Error insertando en taller_ingresos_tiempos:', insertTiemposError);
      }

    }

    // 3. ── AUTOMATISMO DE COMISIONES (MODELO PORCENTAJE) ──────────────────
    // Calcular y guardar comisiones por MO si pasa a entregado, o si ya estaba entregado y se están editando los ítems
    const isTransitioningToEntregado = body.estado === 'entregado' && current?.estado !== 'entregado';
    const isAlreadyEntregadoAndEditingItems = current?.estado === 'entregado' && body.items_factura !== undefined && (body.estado ?? current.estado) === 'entregado';

    if (isTransitioningToEntregado || isAlreadyEntregadoAndEditingItems) {
      try {
        // Porcentaje global del taller a repartir entre todos los técnicos
        const PORCENTAJE_GLOBAL_MO = 50; // 50% del total de MO se reparte

        // Obtener items_factura: prefiere los del body, sino los de la BD
        const itemsFactura: any[] = body.items_factura ?? current?.items_factura ?? [];

        const totalManoObra = itemsFactura
          .filter((item: any) => item.tipo === 'mano_obra')
          .reduce((acc: number, item: any) => acc + (item.total || 0), 0);

        // Si totalManoObra es >= 0, recalcular (incluso si bajó a 0 hay que actualizar a 0).
        // Consultar TODAS las filas de la orden para calcular numTecnicos correctamente;
        // si se filtrara solo por 'pendiente', el porcentaje se distorsionaría cuando
        // algún técnico ya fue liquidado (ej. 2 técnicos → 25% c/u; uno liquidado →
        // el pendiente no debe subir a 50%).
        const { data: pivoteRows } = await supabase
          .from('taller_ingresos_tecnicos')
          .select('id, estado')
          .eq('ingreso_id', id);

        const numTecnicos = pivoteRows?.length ?? 0;

        if (numTecnicos > 0) {
          const porcentajePorTecnico = PORCENTAJE_GLOBAL_MO / numTecnicos;
          const comisionPorTecnico = Math.round(totalManoObra * (porcentajePorTecnico / 100));

          // Actualizar monto_comision Y porcentaje_aplicado SOLO en filas pendientes.
          // Las filas ya liquidadas no se tocan: su monto coincide con el gasto emitido.
          const filasPendientes = (pivoteRows || []).filter((row: any) => row.estado !== 'liquidado');
          const updatePromises = filasPendientes.map((row: any) =>
            supabase
              .from('taller_ingresos_tecnicos')
              .update({
                monto_comision: comisionPorTecnico,
                porcentaje_aplicado: porcentajePorTecnico
              })
              .eq('id', row.id)
          );
          if (updatePromises.length > 0) await Promise.all(updatePromises);
          console.log(`[updateIngreso] Comisiones recalculadas: ${porcentajePorTecnico}% = $${comisionPorTecnico} x ${numTecnicos} técnicos (MO: $${totalManoObra}, pendientes actualizados: ${filasPendientes.length})`);
        }
      } catch (comisionError: any) {
        console.error('[updateIngreso] Error calculando comisiones:', comisionError.message);
      }
    }
    // ───────────────────────────────────────────────────────────────────

    // 4. ── SINCRONIZACIÓN AUTOMÁTICA DE MATRIZ DE PRECIOS ─────────────────
    if (isTransitioningToEntregado || isAlreadyEntregadoAndEditingItems) {
      const itemsFactura = body.items_factura ?? current?.items_factura ?? [];
      const vehiculo = (current as any)?.taller_vehiculos;
      if (req.empresa_id) {
        sincronizarPreciosOrdenEntregada(req.empresa_id, id as string, vehiculo, itemsFactura).catch(err => {
          console.error('[updateIngreso] Error sincronizando matriz de precios:', err);
        });
      }
    } else if (body.estado && body.estado !== 'entregado' && current?.estado === 'entregado') {
      if (req.empresa_id) {
        eliminarPreciosOrdenEntregada(req.empresa_id, id as string).catch(err => {
          console.error('[updateIngreso] Error eliminando precios de orden cancelada:', err);
        });
      }
    }
    // 4. Actualizar vehículo con manejo explícito de errores (no tragar fallos)
    if (Object.keys(safeVehiculoData).length > 0 && current?.vehiculo_id && req.empresa_id) {
      const { error: vehErr } = await supabase
        .from('taller_vehiculos')
        .update(safeVehiculoData)
        .eq('id', current.vehiculo_id)
        .eq('empresa_id', req.empresa_id);

      if (vehErr) {
        console.error('[updateIngreso] Error actualizando datos del vehículo:', vehErr.message);
        res.status(vehErr.code === '23505' ? 409 : 400).json({
          error: vehErr.code === '23505' ? 'La placa ya se encuentra registrada en otro vehículo.' : vehErr.message
        });
        return;
      }
    }

    // 5. Actualizar cliente con filtro estricto por tenant (regla multi-tenant CLAUDE.md)
    if (Object.keys(safeClienteData).length > 0 && req.empresa_id && current?.vehiculo_id) {
      const clienteId = (current?.taller_vehiculos as any)?.cliente_id || (current?.taller_vehiculos as any)?.taller_clientes?.id;
      if (clienteId) {
        const { error: cliErr } = await supabase
          .from('taller_clientes')
          .update(safeClienteData)
          .eq('id', clienteId)
          .eq('empresa_id', req.empresa_id);

        if (cliErr) {
          console.error('[updateIngreso] Error actualizando datos del cliente:', cliErr.message);
          res.status(400).json({ error: cliErr.message });
          return;
        }
      }
    }

    // 6. Escribir en la bitácora DESPUÉS de que todos los updates fueron exitosos
    const cambiosEntrada: string[] = [];
    if (camposIngreso.motivo_visita && current && current.motivo_visita !== camposIngreso.motivo_visita) {
      cambiosEntrada.push(`Motivo: "${current.motivo_visita}" -> "${camposIngreso.motivo_visita}"`);
    }
    if (camposIngreso.kilometraje !== undefined && current && (current as any).kilometraje !== undefined && (current as any).kilometraje !== camposIngreso.kilometraje) {
      cambiosEntrada.push(`Kilometraje: ${(current as any).kilometraje} km -> ${camposIngreso.kilometraje} km`);
    }
    if (camposIngreso.nivel_gasolina && (current as any).nivel_gasolina && (current as any).nivel_gasolina !== camposIngreso.nivel_gasolina) {
      cambiosEntrada.push(`Gasolina: ${(current as any).nivel_gasolina} -> ${camposIngreso.nivel_gasolina}`);
    }
    if (camposIngreso.fecha_ingreso && current?.fecha_ingreso && new Date(current.fecha_ingreso).getTime() !== new Date(camposIngreso.fecha_ingreso).getTime()) {
      cambiosEntrada.push(`Fecha de ingreso ajustada`);
    }
    if (safeVehiculoData.placa && (current?.taller_vehiculos as any)?.placa && (current?.taller_vehiculos as any)?.placa !== safeVehiculoData.placa) {
      cambiosEntrada.push(`Placa: ${(current?.taller_vehiculos as any)?.placa} -> ${safeVehiculoData.placa}`);
    }
    if (safeClienteData.nombre_completo && (current?.taller_vehiculos as any)?.taller_clientes?.nombre_completo && (current?.taller_vehiculos as any)?.taller_clientes?.nombre_completo !== safeClienteData.nombre_completo) {
      cambiosEntrada.push(`Cliente: "${safeClienteData.nombre_completo}"`);
    }

    if (cambiosEntrada.length > 0 && req.empresa_id) {
      await registrarEventoBitacora(
        req.empresa_id,
        id as string,
        'nota',
        'Entrada de Vehículo Modificada',
        cambiosEntrada.join(' | '),
        { detalle_cambios: cambiosEntrada }
      );
    } else if (req.empresa_id && camposIngreso.items_factura !== undefined && (!camposIngreso.estado || camposIngreso.estado === current?.estado)) {
      await registrarEventoBitacora(
        req.empresa_id,
        id as string,
        'cotizacion',
        'Cotización Actualizada',
        'Se actualizaron los ítems de repuestos o mano de obra.'
      );
    }

    if (req.empresa_id && cambioFechaEstimada !== 'ninguno' && camposIngreso.fecha_entrega_estimada) {
      const fechaFormateada = new Date(camposIngreso.fecha_entrega_estimada).toLocaleString('es-CO', {
        timeZone: 'America/Bogota',
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      });
      if (cambioFechaEstimada === 'primera_vez') {
        await registrarEventoBitacora(
          req.empresa_id,
          id as string,
          'diagnostico',
          'Fecha Estimada de Salida Definida',
          `Promesa de entrega establecida para: ${fechaFormateada}`,
          { fecha_entrega_estimada: camposIngreso.fecha_entrega_estimada }
        );
      } else {
        await registrarEventoBitacora(
          req.empresa_id,
          id as string,
          'reprogramacion',
          'Fecha de Entrega Reprogramada',
          `Nueva fecha estimada: ${fechaFormateada}${motivo_reprogramacion ? ` — Motivo: ${motivo_reprogramacion}` : ''}`,
          {
            fecha_anterior: current?.fecha_entrega_estimada,
            fecha_nueva: camposIngreso.fecha_entrega_estimada,
            motivo: motivo_reprogramacion || null
          }
        );
      }
    }

    // 5. ── LIMPIEZA DE HUÉRFANOS DE GASTOS ────────────────────────────────
    // Si se guardaron exitosamente los items_factura, detectar repuestos eliminados o cambiados
    if (body.items_factura !== undefined && current?.items_factura) {
      try {
        const prevRepuestos = (current.items_factura || [])
          .filter((item: any) => item && item.tipo === 'repuesto' && item.id)
          .map((item: any) => item.id);

        const newRepuestosSet = new Set(
          (body.items_factura || [])
            .filter((item: any) => item && item.tipo === 'repuesto' && item.id)
            .map((item: any) => item.id)
        );

        const repuestosRemovidos = prevRepuestos.filter((prevId: string) => !newRepuestosSet.has(prevId));

        if (repuestosRemovidos.length > 0 && req.empresa_id) {
          const { error: orphanErr } = await supabase
            .from('taller_gastos')
            .update({ item_id: null })
            .eq('empresa_id', req.empresa_id)
            .eq('ingreso_id', id)
            .in('item_id', repuestosRemovidos);

          if (orphanErr) {
            console.error('[updateIngreso] Error limpiando gastos huérfanos:', orphanErr.message);
          }
        }
      } catch (err: any) {
        console.error('[updateIngreso] Error evaluando gastos huérfanos:', err?.message);
      }
    }
    // ───────────────────────────────────────────────────────────────────

    // 6. Preparar información de Renting Flota Propia
    const clienteDoc = (current?.taller_vehiculos as any)?.taller_clientes?.documento || (data?.taller_vehiculos as any)?.taller_clientes?.documento;
    const aplicaRenting = evaluarAplicaRenting(req.empresa_id, clienteDoc);

    let rentingInfo = null;
    if (aplicaRenting) {
      const effectivePlaca = safeVehiculoData.placa || (current?.taller_vehiculos as any)?.placa || (data?.taller_vehiculos as any)?.placa || '';
      const itemsRaw = body.items_factura ?? current?.items_factura ?? data?.items_factura ?? [];
      const validItems = (itemsRaw || [])
        .filter((i: any) => typeof i?.total === 'number' && i.total > 0 && i.descripcion)
        .map((i: any) => ({
          item: String(i.descripcion).trim(),
          category: 'Mantenimiento',
          amount: i.total
        }));

      const dateBogota = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
      const motivo = body.motivo_visita ?? current?.motivo_visita ?? '';

      rentingInfo = {
        aplica_renting: true,
        ya_sincronizado: Boolean(current?.renting_sync_at || (data as any)?.renting_sync_at),
        prefill: {
          date: dateBogota,
          placa: effectivePlaca,
          description: `[Taller Orden #${id}] ${motivo}`.trim(),
          items: validItems
        }
      };
    }

    res.json({
      ...data,
      aplica_renting: aplicaRenting,
      inventario_faltantes: faltantesInventario,
      renting_info: rentingInfo
    });
  } catch (error: any) {
    console.error('[updateIngreso] Caught error:', error.message);
    res.status(500).json({ error: error.message });
  }
};

// ─── Helpers para consulta escalable de ingresos por fechas ──────────────────
async function fetchIngresosEnChunks(empresaId: string, ids: string[], selectCols: string): Promise<any[]> {
  if (ids.length === 0) return [];
  const CHUNK_SIZE = 100;
  const results: any[] = [];
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const chunk = ids.slice(i, i + CHUNK_SIZE);
    const { data, error } = await supabase
      .from('taller_ingresos')
      .select(selectCols)
      .eq('empresa_id', empresaId)
      .eq('estado', 'entregado')
      .in('id', chunk);

    if (error) {
      console.error('[fetchIngresosEnChunks] Error consultando lote de ingresos:', error.message);
      throw error;
    }
    if (data) results.push(...data);
  }
  return results;
}

async function fetchBitacoraIdsEnRango(empresaId: string, startISO: string, endExclusiveISO: string): Promise<string[]> {
  const ids: string[] = [];
  let offset = 0;
  const PAGE_SIZE = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('taller_ingresos_bitacora')
      .select('ingreso_id')
      .eq('empresa_id', empresaId)
      .eq('tipo_evento', 'entrega')
      .gte('created_at', startISO)
      .lt('created_at', endExclusiveISO)
      .order('created_at', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      console.error('[fetchBitacoraIdsEnRango] Error consultando bitacora en rango:', error.message);
      throw error;
    }

    if (!data || data.length === 0) break;
    data.forEach((r: any) => ids.push(r.ingreso_id));
    if (data.length < PAGE_SIZE) {
      hasMore = false;
    } else {
      offset += PAGE_SIZE;
    }
  }
  return ids;
}

async function fetchFallbackIdsEnRango(empresaId: string, startISO: string, endExclusiveISO: string): Promise<string[]> {
  const ids: string[] = [];
  let offset = 0;
  const PAGE_SIZE = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('taller_ingresos')
      .select('id')
      .eq('empresa_id', empresaId)
      .eq('estado', 'entregado')
      .gte('updated_at', startISO)
      .lt('updated_at', endExclusiveISO)
      .order('id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      console.error('[fetchFallbackIdsEnRango] Error consultando fallback por updated_at:', error.message);
      throw error;
    }

    if (!data || data.length === 0) break;
    data.forEach((r: any) => ids.push(r.id));
    if (data.length < PAGE_SIZE) {
      hasMore = false;
    } else {
      offset += PAGE_SIZE;
    }
  }
  return ids;
}

async function fetchPrimerasEntregasBitacora(
  empresaId: string,
  candidateIds: string[]
): Promise<Record<string, string>> {
  if (candidateIds.length === 0) return {};
  const CHUNK_SIZE = 100;
  const bitacoraMap: Record<string, string> = {};

  for (let i = 0; i < candidateIds.length; i += CHUNK_SIZE) {
    const chunk = candidateIds.slice(i, i + CHUNK_SIZE);
    const { data, error } = await supabase
      .from('taller_ingresos_bitacora')
      .select('ingreso_id, created_at')
      .eq('empresa_id', empresaId)
      .eq('tipo_evento', 'entrega')
      .in('ingreso_id', chunk)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[fetchPrimerasEntregasBitacora] Error consultando bitacora sin filtro de fecha:', error.message);
      throw error;
    }

    (data || []).forEach((b: any) => {
      // Al venir ordenado ascendentemente por created_at, la primera aparición
      // de ingreso_id corresponde a la primera entrega histórica real de la orden.
      if (!bitacoraMap[b.ingreso_id]) {
        bitacoraMap[b.ingreso_id] = toBogotaDateStr(b.created_at);
      }
    });
  }

  return bitacoraMap;
}

async function getIngresosEntregadosEnRango(
  empresaId: string,
  startStr: string,
  endStr: string,
  selectCols: string
): Promise<{ ingresos: any[]; bitacoraMap: Record<string, string> }> {
  const { startISO, endExclusiveISO } = bogotaDayBounds(startStr, endStr);

  // 1. Bitácora de eventos 'entrega' en el rango solicitado (paginado para evitar corte de 1000)
  const bitacoraIds = await fetchBitacoraIdsEnRango(empresaId, startISO, endExclusiveISO);

  // 2. Fallback: órdenes entregadas según updated_at en el rango (paginado)
  const fallbackIds = await fetchFallbackIdsEnRango(empresaId, startISO, endExclusiveISO);

  const candidateIds = Array.from(new Set([...bitacoraIds, ...fallbackIds]));

  if (candidateIds.length === 0) {
    return { ingresos: [], bitacoraMap: {} };
  }

  // 3. Buscar en la bitácora la primera entrega de esas órdenes sin filtrar por fecha.
  // Esto previene que una orden entregada en el pasado que se edite hoy (o se re-entregue)
  // tome falsamente la fecha de hoy.
  const bitacoraMap = await fetchPrimerasEntregasBitacora(empresaId, candidateIds);

  // 4. Traer los datos de las candidatas
  const candidatos = await fetchIngresosEnChunks(empresaId, candidateIds, selectCols);

  // 5. Filtrar estrictamente solo aquellas cuya fecha real de primera entrega caiga dentro de [startStr, endStr]
  const ingresos = candidatos.filter((ing: any) => {
    const diaEfectivo = bitacoraMap[ing.id] ?? toBogotaDateStr(ing.updated_at);
    return diaEfectivo >= startStr && diaEfectivo <= endStr;
  });

  return { ingresos, bitacoraMap };
}

export const getReportesFinanzas = async (req: Request, res: Response): Promise<void> => {
  try {
    const { start, end } = req.query;
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;

    let startStr: string;
    let endStr: string;

    if (start !== undefined || end !== undefined) {
      if (typeof start !== 'string' || typeof end !== 'string' || !dateRe.test(start) || !dateRe.test(end)) {
        res.status(400).json({ error: 'Los parámetros start y end deben tener formato YYYY-MM-DD.' });
        return;
      }
      startStr = start;
      endStr = end;
    } else {
      const range = getBogotaRange('mes');
      startStr = range.startStr;
      endStr = range.endStr;
    }

    const hoyStr = bogotaToday();

    // ── 1. Obtener órdenes entregadas en el período ──────────────
    const { ingresos: ingresosPeriodo, bitacoraMap } = await getIngresosEntregadosEnRango(
      req.empresa_id!,
      startStr,
      endStr,
      'id, updated_at, items_factura'
    );

    const chartDataMap: Record<string, number> = {};
    let totalPeriodo = 0;
    let facturadoHoy = 0;

    ingresosPeriodo.forEach((ing: any) => {
      const total = (ing.items_factura || []).reduce(
        (acc: number, item: any) => acc + (item.total || 0), 0
      );
      if (total <= 0) return;

      const dia = bitacoraMap[ing.id] ?? toBogotaDateStr(ing.updated_at);
      if (dia >= startStr && dia <= endStr) {
        chartDataMap[dia] = (chartDataMap[dia] || 0) + total;
        totalPeriodo += total;
      }
      if (dia === hoyStr) {
        facturadoHoy += total;
      }
    });

    // Si hoy no estaba incluido en el período consultado, consultar hoy de forma acotada
    if (hoyStr < startStr || hoyStr > endStr) {
      const { ingresos: ingresosHoy, bitacoraMap: bitacoraHoy } = await getIngresosEntregadosEnRango(
        req.empresa_id!,
        hoyStr,
        hoyStr,
        'id, updated_at, items_factura'
      );
      facturadoHoy = ingresosHoy.reduce((acc: number, ing: any) => {
        const dia = bitacoraHoy[ing.id] ?? toBogotaDateStr(ing.updated_at);
        if (dia !== hoyStr) return acc;
        return acc + (ing.items_factura || []).reduce((s: number, i: any) => s + (i.total || 0), 0);
      }, 0);
    }

    const ventasMostrador = await resumirVentasMostradorPorDia(req.empresa_id!, endStr > hoyStr ? endStr : hoyStr);
    const totalMostrador = ventasMostrador.reduce((total, venta) => {
      const ingreso = Number(venta.ingreso);
      if (venta.fecha === hoyStr) facturadoHoy += ingreso;
      if (venta.fecha < startStr || venta.fecha > endStr) return total;
      chartDataMap[venta.fecha] = (chartDataMap[venta.fecha] || 0) + ingreso;
      return total + ingreso;
    }, 0);
    totalPeriodo += totalMostrador;

    // ── 2. Calcular promedio diario histórico con bitácora y paginación ordenada ──
    const bitacoraHistoricaMap: Record<string, string> = {};
    let bitOffset = 0;
    const PAGE_SIZE = 1000;
    let hasMoreBit = true;

    while (hasMoreBit) {
      const { data: bitPage, error: bitHistError } = await supabase
        .from('taller_ingresos_bitacora')
        .select('ingreso_id, created_at')
        .eq('empresa_id', req.empresa_id)
        .eq('tipo_evento', 'entrega')
        .order('created_at', { ascending: true })
        .range(bitOffset, bitOffset + PAGE_SIZE - 1);

      if (bitHistError) {
        console.error('[getReportesFinanzas] Error consultando bitacora historica para promedio:', bitHistError.message);
        throw bitHistError;
      }

      if (!bitPage || bitPage.length === 0) break;

      bitPage.forEach((b: any) => {
        if (!bitacoraHistoricaMap[b.ingreso_id]) {
          bitacoraHistoricaMap[b.ingreso_id] = toBogotaDateStr(b.created_at);
        }
      });

      if (bitPage.length < PAGE_SIZE) {
        hasMoreBit = false;
      } else {
        bitOffset += PAGE_SIZE;
      }
    }

    let totalHistorico = 0;
    const diasUnicos = new Set<string>();
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const { data: pageRows, error: histError } = await supabase
        .from('taller_ingresos')
        .select('id, updated_at, items_factura')
        .eq('empresa_id', req.empresa_id)
        .eq('estado', 'entregado')
        .order('id', { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);

      if (histError) {
        console.error('[getReportesFinanzas] Error consultando historico para promedio:', histError.message);
        throw histError;
      }

      if (!pageRows || pageRows.length === 0) break;

      pageRows.forEach((ing: any) => {
        const total = (ing.items_factura || []).reduce(
          (acc: number, item: any) => acc + (item.total || 0), 0
        );
        if (total <= 0) return;
        totalHistorico += total;
        const dia = bitacoraHistoricaMap[ing.id] ?? toBogotaDateStr(ing.updated_at);
        diasUnicos.add(dia);
      });

      if (pageRows.length < PAGE_SIZE) {
        hasMore = false;
      } else {
        offset += PAGE_SIZE;
      }
    }

    for (const venta of ventasMostrador) {
      if (Number(venta.ingreso) <= 0) continue;
      totalHistorico += Number(venta.ingreso);
      diasUnicos.add(venta.fecha);
    }

    const promedioDiarioHistorico =
      diasUnicos.size > 0 ? totalHistorico / diasUnicos.size : 0;

    // ── 3. Gastos ejecutados + prorrateo de gastos fijos/mensuales ──
    const { queryStart: gastosQueryStart, queryEnd: gastosQueryEnd } = obtenerVentanaConsultaGastos(
      startStr,
      endStr
    );

    // Paginado explícito: la ventana abarca ~13 meses y no debe truncarse por el límite
    // de filas (max rows) de la API de Supabase.
    const gastosData: any[] = [];
    {
      let gastosOffset = 0;
      while (true) {
        const { data: pagina, error: gastosError } = await supabase
          .from('taller_gastos')
          .select(`
            id, monto, fecha, descripcion, tipo, plantilla_id, ingreso_id, item_id,
            taller_categorias_gastos(id, nombre, color),
            taller_gastos_recurrentes(id, nombre, frecuencia)
          `)
          .eq('empresa_id', req.empresa_id)
          .gte('fecha', gastosQueryStart)
          .lte('fecha', gastosQueryEnd)
          .order('id', { ascending: true })
          .range(gastosOffset, gastosOffset + PAGE_SIZE - 1);

        if (gastosError) {
          console.error('[getReportesFinanzas] Error fetching gastos:', gastosError.message);
          throw gastosError;
        }
        const filas = pagina || [];
        gastosData.push(...filas);
        if (filas.length < PAGE_SIZE) break;
        gastosOffset += PAGE_SIZE;
      }
    }

    const { data: plantillasActivas, error: errPlantillas } = await supabase
      .from('taller_gastos_recurrentes')
      .select(`
        id, nombre, monto_estimado, frecuencia, dia_del_mes, dia_semana,
        activa, fecha_inicio, fecha_fin, categoria_id,
        taller_categorias_gastos(id, nombre, color, icono)
      `)
      .eq('empresa_id', req.empresa_id)
      .eq('activa', true);

    if (errPlantillas) {
      console.error('[getReportesFinanzas] Error fetching plantillas:', errPlantillas.message);
    }

    const prorrateo = calcularGastosPeriodoConProrrateo(
      gastosData || [],
      startStr,
      endStr,
      plantillasActivas || []
    );
    const totalGastos = prorrateo.totalGastos;
    const gastosPorCategoria = prorrateo.gastosPorCategoria;

    // Construir serie diaria completa (todos los días del rango, con ingresos vs. gastos)
    const chartData = prorrateo.diasRango.map((fecha) => {
      const ingresosDia = chartDataMap[fecha] || 0;
      const gastosDia = prorrateo.gastosPorDiaMap[fecha] || { total: 0, directos: 0, fijos: 0 };
      return {
        fecha,
        total: ingresosDia,
        ingresos: ingresosDia,
        gastos: gastosDia.total,
        gastosDirectos: gastosDia.directos,
        gastosFijos: gastosDia.fijos,
        utilidad: ingresosDia - gastosDia.total,
      };
    });

    // ── 4. Cálculos de rentabilidad ──────────────────────────────
    const utilidadBruta = totalPeriodo - totalGastos;
    const margenPct = totalPeriodo > 0 ? Math.round((utilidadBruta / totalPeriodo) * 100) : 0;

    res.json({
      rangoEfectivo: { start: startStr, end: endStr },
      chartData,
      kpis: {
        facturadoHoy,
        promedioDiarioHistorico,
        totalPeriodo,
        totalMostrador,
        totalGastos,
        totalGastosDirectos: prorrateo.totalGastosDirectos,
        totalGastosFijos: prorrateo.totalGastosFijosProrrateados,
        cuotaFijaDiaria: prorrateo.cuotaFijaDiariaTotal,
        diasPeriodo: prorrateo.diasPeriodo,
        utilidadBruta,
        margenPct,
      },
      gastosPorCategoria,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};


export const getReportesFinanzasDetalle = async (req: Request, res: Response): Promise<void> => {
  try {
    const { fecha, start, end } = req.query;
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;

    let startStr: string;
    let endStr: string;

    if (fecha !== undefined) {
      if (typeof fecha !== 'string' || !dateRe.test(fecha)) {
        res.status(400).json({ error: 'El parámetro fecha debe tener formato YYYY-MM-DD.' });
        return;
      }
      startStr = fecha;
      endStr = fecha;
    } else if (start !== undefined || end !== undefined) {
      if (typeof start !== 'string' || typeof end !== 'string' || !dateRe.test(start) || !dateRe.test(end)) {
        res.status(400).json({ error: 'Los parámetros start y end deben tener formato YYYY-MM-DD.' });
        return;
      }
      startStr = start;
      endStr = end;
    } else {
      res.status(400).json({ error: 'Se requiere el parámetro fecha o los parámetros start y end en formato YYYY-MM-DD.' });
      return;
    }

    // ── 1. Obtener órdenes entregadas en el rango acotado ──────────────
    const { ingresos, bitacoraMap } = await getIngresosEntregadosEnRango(
      req.empresa_id!,
      startStr,
      endStr,
      `
        id,
        updated_at,
        fecha_ingreso,
        motivo_visita,
        items_factura,
        taller_vehiculos (
          placa,
          marca,
          linea,
          taller_clientes (
            nombre_completo,
            telefono
          )
        )
      `
    );

    // ── 2. Filtrar y formatear cada orden ─────────────────────────────
    const ordenes: Array<{
      id: string;
      fecha_entrega: string;
      placa: string;
      marca: string;
      linea: string;
      cliente: string;
      telefono: string;
      motivo_visita: string;
      total: number;
      total_mano_obra: number;
      total_repuestos: number;
      items_count: number;
      items: Array<{
        id: string;
        tipo: string;
        descripcion: string;
        cantidad: number;
        precio_unitario: number;
        total: number;
      }>;
    }> = [];

    let totalPeriodo = 0;
    let totalManoObra = 0;
    let totalRepuestos = 0;

    ingresos.forEach((ing: any) => {
      const dia = bitacoraMap[ing.id] ?? toBogotaDateStr(ing.updated_at);
      if (dia < startStr || dia > endStr) return;

      const itemsRaw = ing.items_factura || [];
      let subTotalMO = 0;
      let subTotalRep = 0;
      const formattedItems: Array<any> = [];

      itemsRaw.forEach((it: any) => {
        const itemTot = Number(it.total || 0);
        if (it.tipo === 'mano_obra') {
          subTotalMO += itemTot;
        } else {
          subTotalRep += itemTot;
        }
        formattedItems.push({
          id: it.id || '',
          tipo: it.tipo || 'repuesto',
          descripcion: it.descripcion || 'Sin descripción',
          cantidad: Number(it.cantidad || 1),
          precio_unitario: Number(it.precio_unitario || 0),
          total: itemTot,
        });
      });

      const ordenTotal = subTotalMO + subTotalRep;
      if (ordenTotal <= 0 && formattedItems.length === 0) return;

      totalPeriodo += ordenTotal;
      totalManoObra += subTotalMO;
      totalRepuestos += subTotalRep;

      const placa = (ing.taller_vehiculos as any)?.placa || 'Sin placa';
      const marca = (ing.taller_vehiculos as any)?.marca || '';
      const linea = (ing.taller_vehiculos as any)?.linea || '';
      const cliente = (ing.taller_vehiculos as any)?.taller_clientes?.nombre_completo || 'Cliente no registrado';
      const telefono = (ing.taller_vehiculos as any)?.taller_clientes?.telefono || '';

      ordenes.push({
        id: ing.id,
        fecha_entrega: dia,
        placa,
        marca,
        linea,
        cliente,
        telefono,
        motivo_visita: ing.motivo_visita || '',
        total: ordenTotal,
        total_mano_obra: subTotalMO,
        total_repuestos: subTotalRep,
        items_count: formattedItems.length,
        items: formattedItems,
      });
    });

    const ventasMostrador = await consultarVentasMostrador(req.empresa_id!, startStr, endStr);
    const totalMostrador = ventasMostrador.reduce((suma, venta) => suma + Number(venta.ingreso), 0);
    totalPeriodo += totalMostrador;
    totalRepuestos += totalMostrador;

    // Ordenar de más reciente a más antigua, y por monto mayor
    ordenes.sort((a, b) => b.fecha_entrega.localeCompare(a.fecha_entrega) || b.total - a.total);

    res.json({
      rango: { start: startStr, end: endStr },
      fecha: startStr === endStr ? startStr : undefined,
      totalPeriodo,
      totalManoObra,
      totalRepuestos,
      totalMostrador,
      ventasMostrador,
      totalOrdenes: ordenes.length,
      ordenes,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};


// ─── Reporte: Repuestos más usados (cantidad, precio/costo promedio, utilidad) ───
// Venta: items_factura tipo 'repuesto' de órdenes entregadas en el rango.
// Costo: taller_gastos vinculados al ítem vía item_id.
const normalizarDescripcionRepuesto = (s: string): string =>
  (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export const getReportesRepuestos = async (req: Request, res: Response): Promise<void> => {
  try {
    const { start, end } = req.query;
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    if (typeof start !== 'string' || typeof end !== 'string' || !dateRe.test(start) || !dateRe.test(end) || start > end) {
      res.status(400).json({ error: 'Los parámetros start y end deben tener formato YYYY-MM-DD.' });
      return;
    }

    const { ingresos, bitacoraMap } = await getIngresosEntregadosEnRango(
      req.empresa_id!,
      start,
      end,
      `
        id,
        updated_at,
        items_factura,
        taller_vehiculos (
          placa,
          marca,
          linea,
          taller_clientes ( nombre_completo )
        )
      `
    );

    // ── Costos vinculados a ítems (chunked) ──
    const ingresoIds = ingresos.map((i: any) => i.id);
    const costoPorItem: Record<string, number> = {};
    const inventario = seguimientoDbSiConfigurada();
    const costoInventario: Record<string, number> = {};
    const CHUNK = 100;
    for (let i = 0; i < ingresoIds.length; i += CHUNK) {
      const chunk = ingresoIds.slice(i, i + CHUNK);
      const { data, error } = await supabase
        .from('taller_gastos')
        .select('ingreso_id, item_id, monto')
        .eq('empresa_id', req.empresa_id)
        .in('ingreso_id', chunk)
        .not('item_id', 'is', null);
      if (error) throw error;
      (data || []).forEach((g: any) => {
        const key = `${g.ingreso_id}::${g.item_id}`;
        costoPorItem[key] = (costoPorItem[key] || 0) + Number(g.monto || 0);
      });
      if (inventario) {
        try {
          const { rows: salidas } = await inventario.query<{ ingreso_id: string; ingreso_item_id: string; costo: string }>(
            `SELECT s.ingreso_id, s.ingreso_item_id, -m.cantidad * m.costo_unitario AS costo
             FROM public.taller_inventario_salidas_vigentes s
             JOIN public.taller_inventario_movimientos m ON m.empresa_id=s.empresa_id AND m.id=s.movimiento_id
             WHERE s.empresa_id=$1 AND s.ingreso_id=ANY($2::uuid[])`,
            [req.empresa_id, chunk]
          );
          for (const salida of salidas) {
            costoInventario[`${salida.ingreso_id}::${salida.ingreso_item_id}`] = Number(salida.costo);
          }
        } catch (error: any) {
          if (error.code !== '42P01') throw error;
        }
      }
    }

    type Detalle = {
      ingreso_id: string;
      fecha_entrega: string;
      placa: string;
      vehiculo: string;
      cliente: string;
      descripcion: string;
      cantidad: number;
      precio_unitario: number;
      total: number;
      costo: number | null;
      utilidad: number | null;
    };
    type Grupo = {
      key: string;
      descripcion: string;
      descripcionesConteo: Record<string, number>;
      cantidad: number;
      ordenes: Set<string>;
      ventaTotal: number;
      ventaConCosto: number;
      cantidadConCosto: number;
      costoTotal: number;
      detalle: Detalle[];
    };

    const grupos: Record<string, Grupo> = {};

    ingresos.forEach((ing: any) => {
      const dia = bitacoraMap[ing.id] ?? toBogotaDateStr(ing.updated_at);
      const veh = ing.taller_vehiculos as any;
      (ing.items_factura || []).forEach((it: any) => {
        if (!it || it.tipo !== 'repuesto') return;
        const descripcion = String(it.descripcion || '').trim() || 'Sin descripción';
        const key = normalizarDescripcionRepuesto(descripcion) || 'sin descripcion';
        const cantidad = Number(it.cantidad || 1);
        const total = Number(it.total || 0);
        const precioUnit = Number(it.precio_unitario || (cantidad ? total / cantidad : 0));
        const costoKey = it.id ? `${ing.id}::${it.id}` : null;
        const costo = costoKey ? costoPorItem[costoKey] ?? costoInventario[costoKey] ?? null : null;
        const tieneCosto = costo !== null;

        if (!grupos[key]) {
          grupos[key] = {
            key, descripcion, descripcionesConteo: {}, cantidad: 0, ordenes: new Set(),
            ventaTotal: 0, ventaConCosto: 0, cantidadConCosto: 0, costoTotal: 0, detalle: [],
          };
        }
        const g = grupos[key];
        g.descripcionesConteo[descripcion] = (g.descripcionesConteo[descripcion] || 0) + 1;
        g.cantidad += cantidad;
        g.ordenes.add(ing.id);
        g.ventaTotal += total;
        if (tieneCosto) {
          g.ventaConCosto += total;
          g.cantidadConCosto += cantidad;
          g.costoTotal += costo!;
        }
        g.detalle.push({
          ingreso_id: ing.id,
          fecha_entrega: dia,
          placa: veh?.placa || 'Sin placa',
          vehiculo: [veh?.marca, veh?.linea].filter(Boolean).join(' '),
          cliente: veh?.taller_clientes?.nombre_completo || 'Cliente no registrado',
          descripcion,
          cantidad,
          precio_unitario: precioUnit,
          total,
          costo,
          utilidad: tieneCosto ? total - costo! : null,
        });
      });
    });

    const repuestos = Object.values(grupos).map((g) => {
      // Nombre más frecuente como etiqueta del grupo
      const descripcion = Object.entries(g.descripcionesConteo).sort((a, b) => b[1] - a[1])[0]?.[0] || g.descripcion;
      const utilidad = g.cantidadConCosto > 0 ? g.ventaConCosto - g.costoTotal : null;
      g.detalle.sort((a, b) => b.fecha_entrega.localeCompare(a.fecha_entrega));
      return {
        key: g.key,
        descripcion,
        posibleManoObra: pareceManoObra(descripcion),
        cantidad: g.cantidad,
        ordenes: g.ordenes.size,
        ventaTotal: g.ventaTotal,
        precioPromedio: g.cantidad > 0 ? g.ventaTotal / g.cantidad : 0,
        cantidadConCosto: g.cantidadConCosto,
        costoTotal: g.costoTotal,
        costoPromedio: g.cantidadConCosto > 0 ? g.costoTotal / g.cantidadConCosto : null,
        utilidad,
        margenPct: utilidad !== null && g.ventaConCosto > 0 ? (utilidad / g.ventaConCosto) * 100 : null,
        detalle: g.detalle,
      };
    });

    repuestos.sort((a, b) => b.cantidad - a.cantidad || b.ventaTotal - a.ventaTotal);

    const ventaConCosto = Object.values(grupos).reduce((s, g) => s + g.ventaConCosto, 0);
    const costoTotal = Object.values(grupos).reduce((s, g) => s + g.costoTotal, 0);
    const resumen = {
      repuestosDistintos: repuestos.length,
      unidades: repuestos.reduce((s, r) => s + r.cantidad, 0),
      ventaTotal: repuestos.reduce((s, r) => s + r.ventaTotal, 0),
      ventaConCosto,
      costoTotal,
      utilidad: ventaConCosto - costoTotal,
      margenPct: ventaConCosto > 0 ? ((ventaConCosto - costoTotal) / ventaConCosto) * 100 : 0,
      lineasTotal: repuestos.reduce((s, r) => s + r.detalle.length, 0),
      lineasConCosto: repuestos.reduce((s, r) => s + r.detalle.filter((d) => d.costo !== null).length, 0),
    };

    res.json({ rango: { start, end }, resumen, repuestos });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getReportesOperaciones = async (req: Request, res: Response): Promise<void> => {
  try {
    const { start, end } = req.query;
    const startStr = (start as string) || bogotaToday();
    const endStr   = (end   as string) || bogotaToday();

    // ── Validación de formato y valor de fechas ───────────────────────────────
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    const isValidDate = (s: string) =>
      dateRe.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

    if (!isValidDate(startStr) || !isValidDate(endStr)) {
      res.status(400).json({ error: 'Los parámetros start y end deben tener formato YYYY-MM-DD con valores válidos' });
      return;
    }

    // ── Zona horaria America/Bogota (UTC-5, sin DST) ─────────────────────────
    const { startISO, endExclusiveISO } = bogotaDayBounds(startStr, endStr);

    // ── 1. Query unificada a taller_ingresos_tiempos ──────────────────────────
    // Una sola lectura sirve para armar promediosGlobales Y el detalle por ingreso.
    const { data: tiemposRaw, error: tError } = await supabase
      .from('taller_ingresos_tiempos')
      .select('ingreso_id, estado, duracion_minutos')
      .eq('empresa_id', req.empresa_id)
      .gte('created_at', startISO)
      .lt('created_at', endExclusiveISO);

    if (tError) throw tError;

    // ── 2. Derivar promediosGlobales y agrupación por ingreso_id ─────────────
    const agrupadoGlobal: Record<string, number[]> = {};
    const porIngreso: Record<string, Record<string, number>> = {};

    (tiemposRaw || []).forEach((r: any) => {
      // Promedios globales
      if (!agrupadoGlobal[r.estado]) agrupadoGlobal[r.estado] = [];
      agrupadoGlobal[r.estado].push(r.duracion_minutos);

      // Detalle por ingreso
      if (!porIngreso[r.ingreso_id]) porIngreso[r.ingreso_id] = {};
      porIngreso[r.ingreso_id][r.estado] =
        (porIngreso[r.ingreso_id][r.estado] || 0) + r.duracion_minutos;
    });

    const promediosGlobales = Object.keys(agrupadoGlobal).map(estado => ({
      estado,
      promedio: Math.round(
        agrupadoGlobal[estado].reduce((a, b) => a + b, 0) / agrupadoGlobal[estado].length
      ),
      total: agrupadoGlobal[estado].length,
    }));

    // ── 3. Obtener placas, estado e items_factura de las órdenes ─────────────
    const ingresoIds = Object.keys(porIngreso);
    let detalleVehiculos: any[] = [];
    let resumen = { totalOrdenes: 0, ordenesFacturadas: 0, facturacionTotal: 0, ticketPromedio: 0 };

    if (ingresoIds.length > 0) {
      const { data: ingresosData, error: iError } = await supabase
        .from('taller_ingresos')
        .select('id, estado, updated_at, items_factura, taller_vehiculos(placa)')
        .eq('empresa_id', req.empresa_id)
        .in('id', ingresoIds);

      if (iError) throw iError;

      // ── 4. Obtener fechas reales de entrega vía bitácora ──────────────────
      // Solo para las órdenes entregadas (Opción A: entrega dentro del período).
      const entregadasIds = (ingresosData || [])
        .filter((ing: any) => ing.estado === 'entregado')
        .map((ing: any) => ing.id);

      let bitacoraMap: Record<string, string> = {};

      if (entregadasIds.length > 0) {
        const { data: bitRows, error: bitError } = await supabase
          .from('taller_ingresos_bitacora')
          .select('ingreso_id, created_at')
          .eq('empresa_id', req.empresa_id)
          .eq('tipo_evento', 'entrega')
          .in('ingreso_id', entregadasIds)
          .order('created_at', { ascending: true }); // primera entrega por ingreso

        if (bitError) throw bitError;

        (bitRows || []).forEach((b: any) => {
          // Solo guarda la primera entrega por ingreso
          if (!bitacoraMap[b.ingreso_id]) {
            bitacoraMap[b.ingreso_id] = toBogotaDateStr(b.created_at);
          }
        });
      }

      // ── 5. Construir detalleVehiculos y calcular resumen ─────────────────
      const ingresoMap: Record<string, any> = {};
      (ingresosData || []).forEach((ing: any) => {
        ingresoMap[ing.id] = ing;
      });

      let totalOrdenes     = 0;
      let ordenesFacturadas = 0;
      let facturacionTotal  = 0;

      detalleVehiculos = ingresoIds.flatMap(ingresoId => {
        const ing = ingresoMap[ingresoId];

        // Ingreso sin registro en taller_ingresos (huérfano): ignorar completamente
        if (!ing) return [];

        const estado = ing.estado as string;
        const placa  = ing?.taller_vehiculos?.placa ?? 'N/A';

        // Canceladas: aparecen en la tabla con — pero no suman al resumen
        if (estado === 'cancelado') {
          return [{ id: ingresoId, placa, tiempos: porIngreso[ingresoId], totalFacturado: null }];
        }

        totalOrdenes++;

        // ¿La orden fue entregada Y dentro del período consultado?
        let totalFacturado: number | null = null;
        if (estado === 'entregado') {
          const total       = sumarItemsFactura(ing.items_factura);
          const fechaEntrega = bitacoraMap[ingresoId] ?? toBogotaDateStr(ing.updated_at);
          const enRango      = fechaEntrega >= startStr && fechaEntrega <= endStr;

          if (enRango && total > 0) {
            totalFacturado     = total;
            ordenesFacturadas++;
            facturacionTotal  += total;
          }
        }

        return [{ id: ingresoId, placa, tiempos: porIngreso[ingresoId], totalFacturado }];
      });

      resumen = {
        totalOrdenes,
        ordenesFacturadas,
        facturacionTotal,
        ticketPromedio: ordenesFacturadas > 0
          ? Math.round(facturacionTotal / ordenesFacturadas)
          : 0,
      };
    }

    res.json({ promediosGlobales, detalleVehiculos, resumen });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};


export const asignarTecnicos = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { tecnicos_ids } = req.body;

    if (!Array.isArray(tecnicos_ids)) {
      res.status(400).json({ error: 'tecnicos_ids debe ser un arreglo de IDs.' });
      return;
    }

    // Verificar que ninguna fila de esta orden ya esté liquidada.
    // Si existe al menos una, rechazar: borrar y recrear filas borraría el rastro
    // del pago y volvería a generarse deuda para esos técnicos.
    // Se captura el error explícitamente para fallar cerrado: si la consulta
    // falla, filasLiquidadas quedaría null y el delete podría ejecutarse.
    const { data: filasLiquidadas, error: errorLiquidadas } = await supabase
      .from('taller_ingresos_tecnicos')
      .select('id')
      .eq('ingreso_id', id)
      .eq('estado', 'liquidado')
      .limit(1);

    if (errorLiquidadas) throw errorLiquidadas;

    if (filasLiquidadas && filasLiquidadas.length > 0) {
      res.status(400).json({
        error: 'No es posible reasignar técnicos: esta orden ya tiene comisiones liquidadas y pagadas.',
      });
      return;
    }

    // Borrar asignaciones previas (solo si ninguna está liquidada)
    const { error: deleteError } = await supabase
      .from('taller_ingresos_tecnicos')
      .delete()
      .eq('ingreso_id', id);

    if (deleteError) throw deleteError;

    // Insertar nuevas asignaciones si hay
    if (tecnicos_ids.length > 0) {
      const inserts = tecnicos_ids.map((tecnicoId: string) => ({
        ingreso_id: id,
        tecnico_id: tecnicoId
      }));

      const { error: insertError } = await supabase
        .from('taller_ingresos_tecnicos')
        .insert(inserts);

      if (insertError) throw insertError;

      // Obtener nombres de los técnicos para la bitácora
      const { data: tecnicosData } = await supabase
        .from('taller_tecnicos')
        .select('nombre')
        .in('id', tecnicos_ids);

      const nombresTecnicos = (tecnicosData || []).map((t: any) => t.nombre).join(', ');

      await registrarEventoBitacora(
        req.empresa_id!,
        id as string,
        'asignacion_tecnicos',
        'Técnicos Asignados',
        `Asignado a: ${nombresTecnicos || 'Sin nombre'}`,
        { tecnicos_ids, nombres: nombresTecnicos }
      );

      // Si la orden ya está en estado 'entregado', calcular comisiones inmediatamente
      try {
        const { data: ordenActual } = await supabase
          .from('taller_ingresos')
          .select('estado, items_factura')
          .eq('id', id)
          .single();

        if (ordenActual?.estado === 'entregado') {
          const itemsFactura = ordenActual.items_factura || [];
          const totalManoObra = itemsFactura
            .filter((item: any) => item.tipo === 'mano_obra')
            .reduce((acc: number, item: any) => acc + (item.total || 0), 0);

          const PORCENTAJE_GLOBAL_MO = 50;
          const numTecnicos = tecnicos_ids.length;
          const porcentajePorTecnico = PORCENTAJE_GLOBAL_MO / numTecnicos;
          const comisionPorTecnico = Math.round(totalManoObra * (porcentajePorTecnico / 100));

          await supabase
            .from('taller_ingresos_tecnicos')
            .update({
              monto_comision: comisionPorTecnico,
              porcentaje_aplicado: porcentajePorTecnico
            })
            .eq('ingreso_id', id);

          console.log(`[asignarTecnicos] Comisiones calculadas para orden entregada: ${porcentajePorTecnico}% = $${comisionPorTecnico} x ${numTecnicos} técnicos`);
        }
      } catch (comisionErr: any) {
        console.error('[asignarTecnicos] Error recalculando comisiones:', comisionErr.message);
      }
    } else {
      // Si vaciaron la asignación
      await registrarEventoBitacora(
        req.empresa_id!,
        id as string,
        'asignacion_tecnicos',
        'Técnicos Desasignados',
        'Se removieron todos los técnicos de esta orden.',
        { tecnicos_ids: [] }
      );
    }

    res.json({ success: true, message: 'Técnicos asignados correctamente.' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
// POST /api/ingresos/:id/rediagnosticar
// Devuelve el vehículo de en_reparacion a diagnostico,
// guardando el tiempo acumulado en reparación antes de cambiar.
export const rediagnosticarIngreso = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // 1. Obtener estado actual
    const { data: current, error: fetchError } = await supabase
      .from('taller_ingresos')
      .select('estado, estado_desde')
      .eq('empresa_id', req.empresa_id)
      .eq('id', id)
      .single();

    if (fetchError || !current) {
      res.status(404).json({ error: 'Ingreso no encontrado.' });
      return;
    }

    if (current.estado !== 'en_reparacion') {
      res.status(400).json({ error: 'El ingreso no está en estado de reparación.' });
      return;
    }

    // 2. Calcular tiempo de reparación transcurrido y guardarlo en taller_ingresos_tiempos
    const estadoDesde = current.estado_desde ? new Date(current.estado_desde).getTime() : Date.now();
    const duracionMinutos = Math.round((Date.now() - estadoDesde) / 60000);

    const { error: tiempoError } = await supabase
      .from('taller_ingresos_tiempos')
      .insert({
        ingreso_id: id,
        empresa_id: req.empresa_id,
        estado: 'en_reparacion',
        duracion_minutos: duracionMinutos,
      });

    if (tiempoError) {
      console.error('[rediagnosticar] Error guardando tiempo de reparación:', tiempoError);
    }

    // 3. Volver a diagnóstico con nuevo estado_desde
    const ahora = new Date().toISOString();
    const { data, error: updateError } = await supabase
      .from('taller_ingresos')
      .update({ estado: 'diagnostico', estado_desde: ahora })
      .eq('estado', 'en_reparacion')
      .eq('empresa_id', req.empresa_id)
      .eq('id', id)
      .select()
      .single();

    if (updateError) throw updateError;

    // Registrar rediagnóstico en la bitácora
    await registrarEventoBitacora(
      req.empresa_id!,
      id as string,
      'rediagnostico',
      'Rediagnóstico Iniciado 🔄',
      `El vehículo volvió a diagnóstico desde reparación. Tiempo previo en reparación: ${duracionMinutos} min.`,
      { duracion_minutos_reparacion: duracionMinutos }
    );

    res.json({ success: true, ingreso: data });
  } catch (error: any) {
    console.error('[rediagnosticar] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
};

// ─── GET /api/ingresos/:id/bitacora ───────────────────────────────────────────
export const getBitacora = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const limit  = Math.min(parseInt(req.query.limit  as string || '50', 10), 100);
    const offset = parseInt(req.query.offset as string || '0',  10);

    // Verify the ingreso belongs to this empresa (strict tenant isolation)
    const { data: ingreso, error: ingresoError } = await supabase
      .from('taller_ingresos')
      .select('id, empresa_id')
      .eq('empresa_id', req.empresa_id)
      .eq('id', id)
      .single();

    if (ingresoError || !ingreso) {
      res.status(404).json({ error: 'Ingreso no encontrado.' });
      return;
    }

    const { data, error, count } = await supabase
      .from('taller_ingresos_bitacora')
      .select('*', { count: 'exact' })
      .eq('empresa_id', req.empresa_id)
      .eq('ingreso_id', id)
      .order('created_at', { ascending: req.query.orden !== 'recientes' })
      .order('id', { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    res.json({ eventos: data || [], total: count || 0, limit, offset });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * POST /api/ingresos/:id/renting-sync
 * Crea el gasto correspondiente en AllAtYou Renting a partir de una orden entregada.
 * - Re-valida elegibilidad (tenant y cédula del propietario).
 * - Exige estado 'entregado'.
 * - Toma la placa inmutable de la base de datos.
 * - Valida estructura del payload enviado desde el modal.
 * - Ejecuta reclamo atómico optimista y dispara el gasto en Renting.
 */
/**
 * Carga la orden con aislamiento de tenant y valida que pueda sincronizarse con Renting
 * (estado entregado, flota autorizada, placa presente). Devuelve la placa o el error HTTP a responder.
 */
async function validarOrdenRenting(
  empresaId: string,
  ingresoId: string
): Promise<{ placa: string } | { status: number; error: string }> {
  const { data: ingreso, error: fetchErr } = await supabase
    .from('taller_ingresos')
    .select('id, estado, renting_sync_at, taller_vehiculos(placa, taller_clientes(documento))')
    .eq('empresa_id', empresaId)
    .eq('id', ingresoId)
    .single();

  if (fetchErr || !ingreso) {
    return { status: 404, error: 'Orden no encontrada en este taller' };
  }

  if (ingreso.estado !== 'entregado') {
    return { status: 400, error: 'Solo se pueden sincronizar con Renting órdenes que se encuentren en estado entregado.' };
  }

  // Re-validar elegibilidad multi-tenant y de propietario (Fail-Closed)
  const clienteDoc = (ingreso.taller_vehiculos as any)?.taller_clientes?.documento;
  if (!evaluarAplicaRenting(empresaId, clienteDoc)) {
    return { status: 403, error: 'Acceso denegado: Esta orden no pertenece a la flota autorizada para sincronización con Renting.' };
  }

  // La placa es tomada directamente de la DB (inmutable)
  const placa = (ingreso.taller_vehiculos as any)?.placa;
  if (!placa) {
    return { status: 400, error: 'La orden no tiene un vehículo con placa asociado' };
  }

  return { placa };
}

/**
 * GET /api/ingresos/:id/renting-leasing
 * Indica si el vehículo de la orden tiene leasing activo en Renting y su fondo de mantenimiento disponible.
 */
export const getRentingLeasingInfo = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.empresa_id) {
      res.status(401).json({ error: 'Sesión sin empresa identificada' });
      return;
    }

    const orden = await validarOrdenRenting(req.empresa_id, req.params.id as string);
    if ('error' in orden) {
      res.status(orden.status).json({ error: orden.error });
      return;
    }

    res.json(await consultarLeasingRenting(orden.placa));
  } catch (err: any) {
    console.error('[getRentingLeasingInfo] Error:', err.message);
    res.status(502).json({ error: 'No se pudo consultar el leasing en Renting' });
  }
};

export const syncIngresoToRenting = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { date, description, items, apply_to_leasing, leasing_excess_method, leasing_advance_installments, leasing_advance_start_date } = req.body || {};

    if (!req.empresa_id) {
      res.status(401).json({ error: 'Sesión sin empresa identificada' });
      return;
    }

    // 1. Validaciones del body
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({ error: 'La fecha debe tener formato YYYY-MM-DD' });
      return;
    }

    if (typeof description !== 'string' || !description.trim()) {
      res.status(400).json({ error: 'La descripción del gasto es obligatoria' });
      return;
    }

    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'Debes incluir al menos un ítem con monto mayor a cero' });
      return;
    }

    for (const it of items) {
      if (!it || typeof it.item !== 'string' || !it.item.trim()) {
        res.status(400).json({ error: 'Cada ítem debe tener una descripción válida' });
        return;
      }
      if (typeof it.amount !== 'number' || !isFinite(it.amount) || it.amount <= 0) {
        res.status(400).json({ error: `El ítem "${it.item}" debe tener un monto numérico mayor a cero` });
        return;
      }
    }

    // 2. Validar campos de leasing (descuento del fondo de mantenimiento)
    let leasing: LeasingSyncOptions | undefined;
    if (apply_to_leasing === true) {
      if (leasing_excess_method !== 'cash' && leasing_excess_method !== 'advance') {
        res.status(400).json({ error: 'El método para cubrir el excedente del leasing debe ser "cash" o "advance"' });
        return;
      }
      const cuotas = Number(leasing_advance_installments ?? 10);
      if (!Number.isInteger(cuotas) || cuotas < 1 || cuotas > 60) {
        res.status(400).json({ error: 'El número de cuotas del anticipo debe estar entre 1 y 60' });
        return;
      }
      const inicioAnticipo = leasing_advance_start_date ?? date;
      if (typeof inicioAnticipo !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(inicioAnticipo)) {
        res.status(400).json({ error: 'La fecha de primer cobro del anticipo debe tener formato YYYY-MM-DD' });
        return;
      }
      leasing = { excessMethod: leasing_excess_method, advanceInstallments: cuotas, advanceStartDate: inicioAnticipo };
    }

    // 3. Validar orden: tenant, estado entregado, flota autorizada y placa inmutable desde la DB
    const orden = await validarOrdenRenting(req.empresa_id, id as string);
    if ('error' in orden) {
      res.status(orden.status).json({ error: orden.error });
      return;
    }
    const placaDb = orden.placa;

    // 4. Ejecutar reclamo atómico y llamada a Renting
    const result = await procesarSincronizacionRenting({
      ingresoId: id as string,
      empresaId: req.empresa_id,
      placa: placaDb,
      date,
      description,
      items,
      leasing
    });

    if (!result.ok) {
      res.status(409).json({ error: result.message });
      return;
    }

    // Registrar en bitácora local
    await registrarEventoBitacora(
      req.empresa_id,
      id as string,
      'nota',
      'Gasto Sincronizado en Renting',
      `Se crearon ${result.expenseIds?.length || 0} gastos en AllAtYou Renting Hub. Placa: ${placaDb}`,
      { expense_ids: result.expenseIds, aplica_leasing: Boolean(leasing), debit_note_error: result.debitNoteError ?? null }
    );

    res.json({
      ok: true,
      message: 'Gasto registrado exitosamente en AllAtYou Renting',
      expense_ids: result.expenseIds,
      debit_note_error: result.debitNoteError ?? null
    });
  } catch (err: any) {
    console.error('[syncIngresoToRenting] Error:', err.message);
    res.status(500).json({ error: err.message || 'Error al sincronizar gasto con Renting' });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// SEGUIMIENTO PERIÓDICO (4/6/10h) Y REPORTE POST-MORTEM SEMANAL / MENSUAL
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/ingresos/:id/seguimiento
 * Registra un check-in rápido de avance del vehículo (cada 4h/6h/10h o manual),
 * opcionalmente reprograma la fecha estimada de salida y deja traza en bitácora.
 */
export const registrarSeguimiento = async (req: Request, res: Response): Promise<void> => {
  try {
    const empresa_id = req.empresa_id;
    const { id } = req.params;
    if (!empresa_id) {
      res.status(401).json({ error: 'No autorizado' });
      return;
    }

    const { estado_avance, nota, nueva_fecha_entrega_estimada, motivo_reprogramacion } = req.body || {};
    if (!estado_avance || typeof estado_avance !== 'string') {
      res.status(400).json({ error: 'El campo estado_avance es obligatorio.' });
      return;
    }

    const archivos = Array.isArray(req.files) ? req.files : [];
    const eventoId = req.body?.evento_id;
    if (archivos.length && (typeof eventoId !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(eventoId))) {
      res.status(400).json({ error: 'No se pudo identificar este avance.' });
      return;
    }

    const { data: current, error: fetchError } = await supabase
      .from('taller_ingresos')
      .select('id, estado, fecha_entrega_estimada, reprogramaciones_count')
      .eq('empresa_id', empresa_id)
      .eq('id', id)
      .single();

    if (fetchError || !current) {
      res.status(404).json({ error: 'Orden de ingreso no encontrada.' });
      return;
    }

    const nowIso = new Date().toISOString();
    const updatePayload: Record<string, any> = {
      ultima_actualizacion_estado: nowIso,
      motivo_demora_actual: nota ? `${estado_avance}: ${String(nota).trim()}` : estado_avance
    };

    let reprogramo = false;
    if (nueva_fecha_entrega_estimada) {
      const prevMs = current.fecha_entrega_estimada ? new Date(current.fecha_entrega_estimada).getTime() : null;
      const nextMs = new Date(nueva_fecha_entrega_estimada).getTime();
      if (Number.isNaN(nextMs)) {
        res.status(400).json({ error: 'La nueva fecha estimada de entrega no es válida.' });
        return;
      }
      updatePayload.fecha_entrega_estimada = new Date(nextMs).toISOString();
      if (prevMs === null || Math.abs(nextMs - prevMs) > 60000) {
        reprogramo = true;
        if (prevMs !== null) {
          updatePayload.reprogramaciones_count = (current.reprogramaciones_count || 0) + 1;
        }
      }
    }

    const fechaNuevaTxt = updatePayload.fecha_entrega_estimada
      ? new Date(updatePayload.fecha_entrega_estimada).toLocaleString('es-CO', {
          timeZone: 'America/Bogota',
          day: '2-digit',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit'
        })
      : null;

    const descripcion = [
      `Estado reportado: ${estado_avance}`,
      nota ? `Nota: ${String(nota).trim()}` : null,
      fechaNuevaTxt ? `Nueva salida estimada: ${fechaNuevaTxt}` : null,
      motivo_reprogramacion ? `Motivo ajuste: ${String(motivo_reprogramacion).trim()}` : null
    ]
      .filter(Boolean)
      .join(' | ');

    const tipoEvento = reprogramo && current.fecha_entrega_estimada ? 'reprogramacion' : 'seguimiento';
    const titulo = tipoEvento === 'reprogramacion'
        ? `Seguimiento y Reprogramación: ${estado_avance}`
        : `Seguimiento de Avance: ${estado_avance}`;
    const metadata = {
        estado_avance,
        nota: nota ? String(nota).trim() : null,
        estado_orden: current.estado,
        fecha_anterior: current.fecha_entrega_estimada || null,
        fecha_nueva: updatePayload.fecha_entrega_estimada || null,
        motivo_reprogramacion: motivo_reprogramacion || null
    };

    if (archivos.length) {
      const db = seguimientoDb();
      const repetido = await db.query(
        'SELECT 1 FROM public.taller_ingresos_bitacora WHERE id = $1 AND empresa_id = $2 AND ingreso_id = $3',
        [eventoId, empresa_id, id]);
      if (repetido.rowCount) {
        res.json({ ok: true });
        return;
      }
      const evidencias = await comprimirEvidencias(archivos);
      const tx = await db.connect();
      try {
        await tx.query('BEGIN');
        const evento = await tx.query(`INSERT INTO public.taller_ingresos_bitacora
          (id, empresa_id, ingreso_id, tipo_evento, titulo, descripcion, metadata)
          VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO NOTHING`,
          [eventoId, empresa_id, id, tipoEvento, titulo, descripcion, metadata]);

        if (!evento.rowCount) {
          const existe = await tx.query(
            'SELECT 1 FROM public.taller_ingresos_bitacora WHERE id = $1 AND empresa_id = $2 AND ingreso_id = $3',
            [eventoId, empresa_id, id]);
          await tx.query('ROLLBACK');
          if (existe.rowCount) res.json({ ok: true });
          else res.status(409).json({ error: 'Vuelve a abrir el formulario para registrar este avance.' });
          return;
        }

        const actualizacion = await tx.query(`UPDATE public.taller_ingresos SET
          ultima_actualizacion_estado = $1, motivo_demora_actual = $2,
          fecha_entrega_estimada = COALESCE($3, fecha_entrega_estimada),
          reprogramaciones_count = COALESCE($4, reprogramaciones_count)
          WHERE empresa_id = $5 AND id = $6
            AND ($3::timestamptz IS NULL OR fecha_entrega_estimada IS NOT DISTINCT FROM $7::timestamptz)`,
          [new Date().toISOString(), updatePayload.motivo_demora_actual, updatePayload.fecha_entrega_estimada ?? null,
            updatePayload.reprogramaciones_count ?? null, empresa_id, id, current.fecha_entrega_estimada]);
        if (!actualizacion.rowCount) {
          await tx.query('ROLLBACK');
          res.status(409).json({ error: 'La orden cambió. Vuelve a abrir el formulario y revisa la fecha de entrega.' });
          return;
        }

        for (const [posicion, evidencia] of evidencias.entries()) {
          await tx.query(`INSERT INTO ${evidenciasTabla}
            (id, evento_id, empresa_id, ingreso_id, posicion, tipo, contenido) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [randomUUID(), eventoId, empresa_id, id, posicion, evidencia.tipo, evidencia.contenido]);
        }
        await tx.query('COMMIT');
        res.json({ ok: true });
      } catch (error) {
        await tx.query('ROLLBACK');
        throw error;
      } finally {
        tx.release();
      }
      return;
    }

    const { data: updated, error: updateError } = await supabase
      .from('taller_ingresos').update(updatePayload).eq('empresa_id', empresa_id).eq('id', id).select().single();
    if (updateError) throw updateError;
    await registrarEventoBitacora(empresa_id, id as string, tipoEvento, titulo, descripcion, metadata);

    res.json({ ok: true, ingreso: updated });
  } catch (error: any) {
    if (error instanceof EvidenciaInvalida) {
      res.status(400).json({ error: error.message });
      return;
    }
    console.error('[registrarSeguimiento] Error:', error.message);
    res.status(500).json({ error: 'No se pudo guardar el seguimiento.' });
  } finally {
    res.locals.liberarCargaEvidencias?.();
  }
};

/**
 * GET /api/ingresos/config/seguimiento
 * Obtiene el intervalo de actualización periódica configurado para el taller (4, 6 u 10 horas).
 */
export const getConfigSeguimiento = async (req: Request, res: Response): Promise<void> => {
  try {
    const empresa_id = req.empresa_id;
    if (!empresa_id) {
      res.status(401).json({ error: 'No autorizado' });
      return;
    }

    const { data, error } = await supabase
      .from('taller_empresas')
      .select('intervalo_seguimiento_horas')
      .eq('id', empresa_id)
      .single();

    if (error) throw error;
    res.json({ intervalo_seguimiento_horas: data?.intervalo_seguimiento_horas || 6 });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * PUT /api/ingresos/config/seguimiento
 * Actualiza el intervalo de seguimiento periódico del taller (4, 6 o 10 horas).
 */
export const updateConfigSeguimiento = async (req: Request, res: Response): Promise<void> => {
  try {
    const empresa_id = req.empresa_id;
    if (!empresa_id) {
      res.status(401).json({ error: 'No autorizado' });
      return;
    }

    const horas = Number(req.body?.intervalo_seguimiento_horas);
    if (![4, 6, 10].includes(horas)) {
      res.status(400).json({ error: 'El intervalo permitido es 4, 6 o 10 horas.' });
      return;
    }

    const { data, error } = await supabase
      .from('taller_empresas')
      .update({ intervalo_seguimiento_horas: horas })
      .eq('id', empresa_id)
      .select('intervalo_seguimiento_horas')
      .single();

    if (error) throw error;
    res.json({ ok: true, intervalo_seguimiento_horas: data?.intervalo_seguimiento_horas || horas });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * GET /api/ingresos/reportes/postmortem?start=YYYY-MM-DD&end=YYYY-MM-DD&limit=30
 * Reporte semanal o mensual de vehículos entregados que más tardaron, con desglose por etapa,
 * cumplimiento de promesa de salida y motivos registrados en bitácora.
 */
export const getReportePostmortem = async (req: Request, res: Response): Promise<void> => {
  try {
    const empresa_id = req.empresa_id;
    if (!empresa_id) {
      res.status(401).json({ error: 'No autorizado' });
      return;
    }

    const { start, end, limit } = req.query;
    const startStr = (start as string) || bogotaToday();
    const endStr = (end as string) || bogotaToday();
    const maxLimit = Math.min(100, Math.max(5, Number(limit) || 30));

    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    const isValidDate = (s: string) =>
      dateRe.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

    if (!isValidDate(startStr) || !isValidDate(endStr)) {
      res.status(400).json({ error: 'Los parámetros start y end deben tener formato YYYY-MM-DD con valores válidos' });
      return;
    }

    const { startISO, endExclusiveISO } = bogotaDayBounds(startStr, endStr);

    // 1. Obtener todas las órdenes del período (activas, entregadas y canceladas)
    const { data: ordenesQueryRaw, error: errEnt } = await supabase
      .from('taller_ingresos')
      .select(`
        id, estado, fecha_ingreso, updated_at, fecha_entrega_estimada,
        reprogramaciones_count, motivo_demora_actual, motivo_visita,
        taller_vehiculos(placa, marca, linea, taller_clientes(nombre_completo))
      `)
      .eq('empresa_id', empresa_id)
      .or(`and(updated_at.gte.${startISO},updated_at.lt.${endExclusiveISO}),and(fecha_ingreso.gte.${startISO},fecha_ingreso.lt.${endExclusiveISO})`);

    if (errEnt) throw errEnt;

    const ordenesRaw = ordenesQueryRaw || [];
    if (ordenesRaw.length === 0) {
      res.json({
        resumen: {
          totalOrdenes: 0,
          totalEntregados: 0,
          totalActivos: 0,
          totalCancelados: 0,
          promedioTotalMinutos: 0,
          conPromesaCount: 0,
          cumplimientoPromesaPct: null,
          ordenesDemoradasCount: 0,
          etapaCuelloBotellaPrincipal: null
        },
        cuellosPorEtapa: [],
        ordenes: []
      });
      return;
    }

    const ingresoIds = ordenesRaw.map((o: any) => o.id);

    // 2. Consultar tiempos por etapa y bitácora de seguimiento/reprogramación/entrega en paralelo
    const CHUNK_SIZE = 100;
    const tiemposPorIngreso: Record<string, Record<string, number>> = {};
    const bitacoraPorIngreso: Record<string, any[]> = {};
    const entregaRealMap: Record<string, string> = {};

    for (let i = 0; i < ingresoIds.length; i += CHUNK_SIZE) {
      const chunk = ingresoIds.slice(i, i + CHUNK_SIZE);
      const [{ data: tRows, error: tErr }, { data: bRows, error: bErr }] = await Promise.all([
        supabase
          .from('taller_ingresos_tiempos')
          .select('ingreso_id, estado, duracion_minutos')
          .eq('empresa_id', empresa_id)
          .in('ingreso_id', chunk),
        supabase
          .from('taller_ingresos_bitacora')
          .select('ingreso_id, tipo_evento, titulo, descripcion, created_at')
          .eq('empresa_id', empresa_id)
          .in('tipo_evento', ['entrega', 'seguimiento', 'reprogramacion'])
          .in('ingreso_id', chunk)
          .order('created_at', { ascending: true })
      ]);

      if (tErr) throw tErr;
      if (bErr) throw bErr;

      (tRows || []).forEach((r: any) => {
        if (!tiemposPorIngreso[r.ingreso_id]) tiemposPorIngreso[r.ingreso_id] = {};
        tiemposPorIngreso[r.ingreso_id][r.estado] =
          (tiemposPorIngreso[r.ingreso_id][r.estado] || 0) + (r.duracion_minutos || 0);
      });

      (bRows || []).forEach((b: any) => {
        if (b.tipo_evento === 'entrega') {
          if (!entregaRealMap[b.ingreso_id]) entregaRealMap[b.ingreso_id] = b.created_at;
        } else {
          if (!bitacoraPorIngreso[b.ingreso_id]) bitacoraPorIngreso[b.ingreso_id] = [];
          bitacoraPorIngreso[b.ingreso_id].push({
            tipo: b.tipo_evento,
            titulo: b.titulo,
            descripcion: b.descripcion,
            fecha: b.created_at
          });
        }
      });
    }

    // 3. Construir filas post-mortem
    const etapasAcumuladas: Record<string, { totalMinutos: number; count: number }> = {};

    const ordenesProcesadas = ordenesRaw.map((ing: any) => {
      const etapas = tiemposPorIngreso[ing.id] || {};
      const sumaEtapas = Object.values(etapas).reduce((a, b) => a + b, 0);

      const fechaIngresoMs = new Date(ing.fecha_ingreso).getTime();
      const esEntregado = ing.estado === 'entregado';
      const esCancelado = ing.estado === 'cancelado';
      const fechaFinIso = esEntregado
        ? (entregaRealMap[ing.id] || ing.updated_at)
        : esCancelado
          ? ing.updated_at
          : new Date().toISOString();
      const fechaFinMs = new Date(fechaFinIso).getTime();
      const duracionCalendarioMin = Math.max(0, Math.round((fechaFinMs - fechaIngresoMs) / 60000));
      const duracionTotalMin = (!esEntregado && !esCancelado)
        ? duracionCalendarioMin
        : (sumaEtapas > 0 ? sumaEtapas : duracionCalendarioMin);

      // Detectar cuello de botella individual
      let cuelloEstado: string | null = null;
      let cuelloMinutos = 0;
      Object.entries(etapas).forEach(([estado, mins]) => {
        if (!etapasAcumuladas[estado]) etapasAcumuladas[estado] = { totalMinutos: 0, count: 0 };
        etapasAcumuladas[estado].totalMinutos += mins;
        etapasAcumuladas[estado].count += 1;

        if (mins > cuelloMinutos) {
          cuelloMinutos = mins;
          cuelloEstado = estado;
        }
      });

      // Evaluar promesa de entrega
      let cumplioPromesa: boolean | null = null;
      let desviacionPromesaMinutos: number | null = null;
      if (ing.fecha_entrega_estimada && !esCancelado) {
        const estMs = new Date(ing.fecha_entrega_estimada).getTime();
        const diffMin = Math.round((fechaFinMs - estMs) / 60000);
        if (esEntregado) {
          desviacionPromesaMinutos = diffMin;
          cumplioPromesa = diffMin <= 0;
        } else if (diffMin > 0) {
          // Orden activa ya vencida respecto a su fecha estimada
          desviacionPromesaMinutos = diffMin;
          cumplioPromesa = false;
        }
      }

      const veh = ing.taller_vehiculos;
      const cli = veh?.taller_clientes;

      return {
        ingreso_id: ing.id,
        estado: ing.estado,
        placa: veh?.placa || 'S/P',
        vehiculo: [veh?.marca, veh?.linea].filter(Boolean).join(' ') || 'Vehículo',
        cliente: cli?.nombre_completo || 'Cliente',
        motivo_visita: ing.motivo_visita || '',
        fecha_ingreso: ing.fecha_ingreso,
        fecha_entrega_real: esEntregado ? fechaFinIso : null,
        fecha_entrega_estimada: ing.fecha_entrega_estimada || null,
        duracion_total_minutos: duracionTotalMin,
        desglose_etapas: {
          recepcion: etapas.recepcion || 0,
          diagnostico: etapas.diagnostico || 0,
          cotizacion: etapas.cotizacion || 0,
          esperando_aprobacion: etapas.esperando_aprobacion || 0,
          en_reparacion: etapas.en_reparacion || 0
        },
        cuello_botella_estado: cuelloEstado,
        cuello_botella_minutos: cuelloMinutos,
        cumplio_promesa: cumplioPromesa,
        desviacion_promesa_minutos: desviacionPromesaMinutos,
        reprogramaciones_count: ing.reprogramaciones_count || 0,
        motivo_demora_actual: ing.motivo_demora_actual || null,
        eventos_seguimiento: bitacoraPorIngreso[ing.id] || []
      };
    });

    // 4. Calcular métricas globales del período
    const totalOrdenes = ordenesProcesadas.length;
    const totalEntregados = ordenesProcesadas.filter(o => o.estado === 'entregado').length;
    const totalActivos = ordenesProcesadas.filter(o => o.estado !== 'entregado' && o.estado !== 'cancelado').length;
    const totalCancelados = ordenesProcesadas.filter(o => o.estado === 'cancelado').length;
    const sumaTotalMin = ordenesProcesadas.reduce((acc, o) => acc + o.duracion_total_minutos, 0);
    const promedioTotalMinutos = totalOrdenes > 0 ? Math.round(sumaTotalMin / totalOrdenes) : 0;

    const conPromesa = ordenesProcesadas.filter(o => o.cumplio_promesa !== null);
    const cumplieron = conPromesa.filter(o => o.cumplio_promesa === true).length;
    const cumplimientoPromesaPct = conPromesa.length > 0 ? Math.round((cumplieron / conPromesa.length) * 100) : null;

    const ordenesDemoradasCount = ordenesProcesadas.filter(
      o => o.cumplio_promesa === false || (promedioTotalMinutos > 0 && o.duracion_total_minutos >= promedioTotalMinutos * 1.5)
    ).length;

    const cuellosPorEtapa = Object.entries(etapasAcumuladas)
      .map(([estado, info]) => ({
        estado,
        promedio_minutos: Math.round(info.totalMinutos / info.count),
        total_minutos: info.totalMinutos,
        ordenes: info.count
      }))
      .sort((a, b) => b.promedio_minutos - a.promedio_minutos);

    const etapaCuelloBotellaPrincipal = cuellosPorEtapa[0]?.estado || null;

    // 5. Ordenar por duración total descendente (los que más tardaron primero)
    ordenesProcesadas.sort((a, b) => b.duracion_total_minutos - a.duracion_total_minutos);

    res.json({
      resumen: {
        totalOrdenes,
        totalEntregados,
        totalActivos,
        totalCancelados,
        promedioTotalMinutos,
        conPromesaCount: conPromesa.length,
        cumplimientoPromesaPct,
        ordenesDemoradasCount,
        etapaCuelloBotellaPrincipal
      },
      cuellosPorEtapa,
      ordenes: ordenesProcesadas.slice(0, maxLimit)
    });
  } catch (error: any) {
    console.error('[getReportePostmortem] Error:', error.message);
    res.status(500).json({ error: error.message || 'Error generando reporte post-mortem' });
  }
};

// ─── Helper: Calcular minutos dentro del horario laboral (America/Bogota, UTC-5) ───
interface HorarioLaboralConfig {
  lvStartMin: number;
  lvEndMin: number;
  sabStartMin: number;
  sabEndMin: number;
  domLaboral: boolean;
  domStartMin: number;
  domEndMin: number;
}

function parseHHMM(val: unknown, fallbackMin: number): number {
  if (typeof val !== 'string') return fallbackMin;
  const m = /^(\d{1,2}):(\d{2})$/.exec(val.trim());
  if (!m) return fallbackMin;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return fallbackMin;
  return hh * 60 + mm;
}

function calcularMinutosLaborales(
  startMs: number,
  endMs: number,
  cfg: HorarioLaboralConfig
): number {
  if (endMs <= startMs) return 0;

  const BOGOTA_OFFSET_MS = 5 * 3600000;
  const DAY_MS = 24 * 3600000;

  // Convertir inicio a fecha calendario en Bogotá
  const startBogota = new Date(startMs - BOGOTA_OFFSET_MS);
  let cursorDayUtc = Date.UTC(
    startBogota.getUTCFullYear(),
    startBogota.getUTCMonth(),
    startBogota.getUTCDate(),
    0, 0, 0
  ) + BOGOTA_OFFSET_MS;

  let totalMs = 0;
  // Límite de seguridad (máx 400 días por intervalo)
  let iter = 0;
  while (cursorDayUtc < endMs && iter < 400) {
    iter++;
    const dayBogota = new Date(cursorDayUtc - BOGOTA_OFFSET_MS);
    const dow = dayBogota.getUTCDay(); // 0=Dom, 1..5=Lun..Vie, 6=Sáb

    let winStart = 0;
    let winEnd = 0;
    if (dow >= 1 && dow <= 5) {
      winStart = cfg.lvStartMin;
      winEnd = cfg.lvEndMin;
    } else if (dow === 6) {
      winStart = cfg.sabStartMin;
      winEnd = cfg.sabEndMin;
    } else if (cfg.domLaboral) {
      winStart = cfg.domStartMin;
      winEnd = cfg.domEndMin;
    }

    if (winEnd > winStart) {
      const wStartMs = cursorDayUtc + winStart * 60000;
      const wEndMs = cursorDayUtc + winEnd * 60000;
      const overlap = Math.min(endMs, wEndMs) - Math.max(startMs, wStartMs);
      if (overlap > 0) totalMs += overlap;
    }

    cursorDayUtc += DAY_MS;
  }

  return Math.round(totalMs / 60000);
}

function unirIntervalos(intervalos: Array<[number, number]>): Array<[number, number]> {
  if (intervalos.length === 0) return [];
  const ordenados = [...intervalos].sort((a, b) => a[0] - b[0]);
  const resultado: Array<[number, number]> = [[ordenados[0][0], ordenados[0][1]]];

  for (let i = 1; i < ordenados.length; i++) {
    const [s, e] = ordenados[i];
    const ultimo = resultado[resultado.length - 1];
    if (s <= ultimo[1]) {
      ultimo[1] = Math.max(ultimo[1], e);
    } else {
      resultado.push([s, e]);
    }
  }
  return resultado;
}

function calcularMinutosLaboralesUnidos(
  intervalos: Array<[number, number]>,
  cfg: HorarioLaboralConfig
): number {
  const unidos = unirIntervalos(intervalos);
  return unidos.reduce((acc, [s, e]) => acc + calcularMinutosLaborales(s, e, cfg), 0);
}

/**
 * GET /api/ingresos/reportes/horas-tecnicos?start=YYYY-MM-DD&end=YYYY-MM-DD
 * Calcula las horas trabajadas por cada mecánico (etapas diagnostico + en_reparacion)
 * contando exclusivamente dentro del horario laboral configurado (America/Bogota).
 */
export const getReporteHorasTecnicos = async (req: Request, res: Response): Promise<void> => {
  try {
    const empresa_id = req.empresa_id;
    if (!empresa_id) {
      res.status(401).json({ error: 'No autorizado' });
      return;
    }

    const { start, end, lvStart, lvEnd, sabStart, sabEnd, domLaboral } = req.query;
    const startStr = (start as string) || bogotaToday();
    const endStr = (end as string) || bogotaToday();

    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    const isValidDate = (s: string) =>
      dateRe.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

    if (!isValidDate(startStr) || !isValidDate(endStr)) {
      res.status(400).json({ error: 'Los parámetros start y end deben tener formato YYYY-MM-DD con valores válidos' });
      return;
    }

    const { startISO, endExclusiveISO } = bogotaDayBounds(startStr, endStr);
    const rangeStartMs = new Date(startISO).getTime();
    const ahoraMs = Date.now();
    const rangeEndMs = Math.min(new Date(endExclusiveISO).getTime(), ahoraMs);

    const horarioCfg: HorarioLaboralConfig = {
      lvStartMin: parseHHMM(lvStart, 8 * 60),
      lvEndMin: parseHHMM(lvEnd, 18 * 60),
      sabStartMin: parseHHMM(sabStart, 8 * 60),
      sabEndMin: parseHHMM(sabEnd, 13 * 60),
      domLaboral: String(domLaboral) === 'true',
      domStartMin: 8 * 60,
      domEndMin: 13 * 60
    };

    // 1. Obtener técnicos de la empresa y órdenes potencialmente activas en el rango
    const [{ data: tecnicosRows, error: tecErr }, { data: ordenesRaw, error: ordErr }] = await Promise.all([
      supabase
        .from('taller_tecnicos')
        .select('id, nombre, estado')
        .eq('empresa_id', empresa_id)
        .order('nombre', { ascending: true }),
      supabase
        .from('taller_ingresos')
        .select(`
          id, estado, fecha_ingreso, estado_desde, updated_at,
          taller_vehiculos(placa, marca, linea),
          taller_ingresos_tecnicos(tecnico_id)
        `)
        .eq('empresa_id', empresa_id)
        .neq('estado', 'cancelado')
        .lt('fecha_ingreso', endExclusiveISO)
        .or(`estado.in.(recepcion,diagnostico,cotizacion,esperando_aprobacion,en_reparacion),updated_at.gte.${startISO}`)
    ]);

    if (tecErr) throw tecErr;
    if (ordErr) throw ordErr;

    const ordenesConTecnico = (ordenesRaw || []).filter(
      (o: any) => Array.isArray(o.taller_ingresos_tecnicos) && o.taller_ingresos_tecnicos.length > 0
    );

    // Inicializar acumuladores por técnico
    const mapaTecnicos: Record<string, {
      tecnico_id: string;
      nombre: string;
      estado: string;
      intervalos_total: Array<[number, number]>;
      intervalos_diagnostico: Array<[number, number]>;
      intervalos_reparacion: Array<[number, number]>;
      ordenes_ids: Set<string>;
      ordenes_entregadas_count: number;
      ordenes_activas_count: number;
      detalle_ordenes: any[];
    }> = {};

    (tecnicosRows || []).forEach((t: any) => {
      mapaTecnicos[t.id] = {
        tecnico_id: t.id,
        nombre: t.nombre,
        estado: t.estado || 'activo',
        intervalos_total: [],
        intervalos_diagnostico: [],
        intervalos_reparacion: [],
        ordenes_ids: new Set(),
        ordenes_entregadas_count: 0,
        ordenes_activas_count: 0,
        detalle_ordenes: []
      };
    });

    if (ordenesConTecnico.length > 0 && rangeEndMs > rangeStartMs) {
      const ingresoIds = ordenesConTecnico.map((o: any) => o.id);
      const CHUNK_SIZE = 100;
      const bitacoraPorOrden: Record<string, any[]> = {};

      for (let i = 0; i < ingresoIds.length; i += CHUNK_SIZE) {
        const chunk = ingresoIds.slice(i, i + CHUNK_SIZE);
        const { data: bRows, error: bErr } = await supabase
          .from('taller_ingresos_bitacora')
          .select('ingreso_id, tipo_evento, metadata, created_at')
          .eq('empresa_id', empresa_id)
          .in('tipo_evento', ['creacion', 'cambio_estado', 'cotizacion', 'entrega', 'cancelacion', 'rediagnostico', 'asignacion_tecnicos'])
          .in('ingreso_id', chunk)
          .order('created_at', { ascending: true });

        if (bErr) throw bErr;

        (bRows || []).forEach((b: any) => {
          if (!bitacoraPorOrden[b.ingreso_id]) bitacoraPorOrden[b.ingreso_id] = [];
          bitacoraPorOrden[b.ingreso_id].push(b);
        });
      }

      // 2. Reconstruir intervalos de trabajo (diagnostico / en_reparacion) por orden
      for (const ord of ordenesConTecnico) {
        const eventos = bitacoraPorOrden[ord.id] || [];
        const fechaIngresoMs = new Date(ord.fecha_ingreso).getTime();
        const finOrdenMs = ord.estado === 'entregado'
          ? new Date(ord.updated_at).getTime()
          : ahoraMs;

        // Detectar primera asignación de técnicos (si existe en bitácora)
        const eventoAsig = eventos.find((e: any) => e.tipo_evento === 'asignacion_tecnicos');
        const inicioAsignacionMs = eventoAsig ? new Date(eventoAsig.created_at).getTime() : fechaIngresoMs;

        // Extraer transiciones de estado desde bitácora
        const transiciones = eventos.filter((e: any) => e.metadata && e.metadata.estado_nuevo);

        interface SegmentoEstado {
          estado: string;
          startMs: number;
          endMs: number;
        }
        const segmentos: SegmentoEstado[] = [];

        if (transiciones.length > 0) {
          let estadoActual = transiciones[0].metadata.estado_anterior || 'recepcion';
          let cursorMs = fechaIngresoMs;

          for (const tr of transiciones) {
            const trMs = new Date(tr.created_at).getTime();
            if (trMs > cursorMs) {
              segmentos.push({ estado: estadoActual, startMs: cursorMs, endMs: trMs });
            }
            estadoActual = tr.metadata.estado_nuevo;
            cursorMs = trMs;
          }
          if (finOrdenMs > cursorMs) {
            segmentos.push({ estado: ord.estado || estadoActual, startMs: cursorMs, endMs: finOrdenMs });
          }
        } else {
          // Sin bitácora de transiciones: usar estado actual desde estado_desde o fecha_ingreso
          const desdeMs = ord.estado_desde ? new Date(ord.estado_desde).getTime() : fechaIngresoMs;
          segmentos.push({ estado: ord.estado, startMs: desdeMs, endMs: finOrdenMs });
        }

        // Calcular minutos laborales en diagnostico y en_reparacion dentro del rango solicitado
        let minDiag = 0;
        let minRep = 0;
        const ordenIntervalosTotal: Array<[number, number]> = [];
        const ordenIntervalosDiag: Array<[number, number]> = [];
        const ordenIntervalosRep: Array<[number, number]> = [];

        for (const seg of segmentos) {
          if (seg.estado !== 'diagnostico' && seg.estado !== 'en_reparacion') continue;
          const segStart = Math.max(seg.startMs, rangeStartMs, Math.min(inicioAsignacionMs, seg.endMs));
          const segEnd = Math.min(seg.endMs, rangeEndMs);
          if (segEnd <= segStart) continue;

          const mins = calcularMinutosLaborales(segStart, segEnd, horarioCfg);
          if (mins <= 0) continue;

          ordenIntervalosTotal.push([segStart, segEnd]);
          if (seg.estado === 'diagnostico') {
            minDiag += mins;
            ordenIntervalosDiag.push([segStart, segEnd]);
          }
          if (seg.estado === 'en_reparacion') {
            minRep += mins;
            ordenIntervalosRep.push([segStart, segEnd]);
          }
        }

        const totalOrdenMin = minDiag + minRep;
        if (totalOrdenMin <= 0) continue;

        const veh = (ord as any).taller_vehiculos;
        const placa = veh?.placa || 'S/P';
        const vehiculoNombre = [veh?.marca, veh?.linea].filter(Boolean).join(' ') || 'Vehículo';

        for (const rel of (ord as any).taller_ingresos_tecnicos) {
          const tec = mapaTecnicos[rel.tecnico_id];
          if (!tec) continue;

          tec.intervalos_total.push(...ordenIntervalosTotal);
          tec.intervalos_diagnostico.push(...ordenIntervalosDiag);
          tec.intervalos_reparacion.push(...ordenIntervalosRep);

          if (!tec.ordenes_ids.has(ord.id)) {
            tec.ordenes_ids.add(ord.id);
            if (ord.estado === 'entregado') tec.ordenes_entregadas_count += 1;
            else tec.ordenes_activas_count += 1;

            tec.detalle_ordenes.push({
              ingreso_id: ord.id,
              placa,
              vehiculo: vehiculoNombre,
              estado_actual: ord.estado,
              minutos_laborales: totalOrdenMin,
              minutos_diagnostico: minDiag,
              minutos_reparacion: minRep,
              fecha_ingreso: ord.fecha_ingreso
            });
          }
        }
      }
    }

    const tecnicosResultado = Object.values(mapaTecnicos)
      .map((t) => {
        const minTotalUnido = calcularMinutosLaboralesUnidos(t.intervalos_total, horarioCfg);
        const minDiagUnido = calcularMinutosLaboralesUnidos(t.intervalos_diagnostico, horarioCfg);
        const minRepUnido = calcularMinutosLaboralesUnidos(t.intervalos_reparacion, horarioCfg);

        return {
          tecnico_id: t.tecnico_id,
          nombre: t.nombre,
          estado: t.estado,
          minutos_laborales_total: minTotalUnido,
          horas_laborales_total: Number((minTotalUnido / 60).toFixed(1)),
          minutos_diagnostico: minDiagUnido,
          minutos_reparacion: minRepUnido,
          ordenes_count: t.ordenes_ids.size,
          ordenes_entregadas_count: t.ordenes_entregadas_count,
          ordenes_activas_count: t.ordenes_activas_count,
          detalle_ordenes: t.detalle_ordenes.sort((a, b) => b.minutos_laborales - a.minutos_laborales)
        };
      })
      .sort((a, b) => b.minutos_laborales_total - a.minutos_laborales_total);

    const totalMinutosGlobal = tecnicosResultado.reduce((acc, t) => acc + t.minutos_laborales_total, 0);
    const tecnicosConHoras = tecnicosResultado.filter((t) => t.minutos_laborales_total > 0);
    const ordenesUnicas = new Set<string>();
    tecnicosResultado.forEach((t) => t.detalle_ordenes.forEach((o) => ordenesUnicas.add(o.ingreso_id)));

    res.json({
      resumen: {
        totalTecnicosConRegistro: tecnicosConHoras.length,
        totalTecnicos: tecnicosResultado.length,
        totalHorasLaborales: Number((totalMinutosGlobal / 60).toFixed(1)),
        promedioHorasPorTecnico: tecnicosConHoras.length > 0
          ? Number(((totalMinutosGlobal / 60) / tecnicosConHoras.length).toFixed(1))
          : 0,
        totalOrdenesAtendidas: ordenesUnicas.size
      },
      tecnicos: tecnicosResultado
    });
  } catch (error: any) {
    console.error('[getReporteHorasTecnicos] Error:', error.message);
    res.status(500).json({ error: error.message || 'Error calculando horas trabajadas por mecánico' });
  }
};

/**
 * GET /api/ingresos/reportes/ingresos-diarios?start=YYYY-MM-DD&end=YYYY-MM-DD
 * Agrupa la cantidad de vehículos ingresados (fecha_ingreso en America/Bogota)
 * por fecha exacta y por día de la semana (Lunes a Domingo) para detectar días pico y valle.
 */
export const getReporteIngresosDiarios = async (req: Request, res: Response): Promise<void> => {
  try {
    const empresa_id = req.empresa_id;
    if (!empresa_id) {
      res.status(401).json({ error: 'No autorizado' });
      return;
    }

    const { start, end } = req.query;
    const startStr = (start as string) || bogotaToday();
    const endStr = (end as string) || bogotaToday();

    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    const isValidDate = (s: string) =>
      dateRe.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

    if (!isValidDate(startStr) || !isValidDate(endStr)) {
      res.status(400).json({ error: 'Los parámetros start y end deben tener formato YYYY-MM-DD con valores válidos' });
      return;
    }

    const { startISO, endExclusiveISO } = bogotaDayBounds(startStr, endStr);

    const { data: ingresosRaw, error } = await supabase
      .from('taller_ingresos')
      .select('id, fecha_ingreso, estado, taller_vehiculos(placa, marca, linea)')
      .eq('empresa_id', empresa_id)
      .neq('estado', 'cancelado')
      .gte('fecha_ingreso', startISO)
      .lt('fecha_ingreso', endExclusiveISO)
      .order('fecha_ingreso', { ascending: true });

    if (error) throw error;

    // Agrupar ingresos por fecha YYYY-MM-DD en America/Bogota (con placa para el detalle del día)
    type IngresoDia = { id: string; placa: string; vehiculo: string; estado: string; hora: string };
    const ingresosPorFecha: Record<string, IngresoDia[]> = {};
    (ingresosRaw || []).forEach((row: any) => {
      const f = toBogotaDateStr(row.fecha_ingreso);
      const v = Array.isArray(row.taller_vehiculos) ? row.taller_vehiculos[0] : row.taller_vehiculos;
      (ingresosPorFecha[f] = ingresosPorFecha[f] || []).push({
        id: row.id,
        placa: v?.placa || 'SIN PLACA',
        vehiculo: [v?.marca, v?.linea].filter(Boolean).join(' '),
        estado: row.estado,
        hora: new Date(row.fecha_ingreso).toLocaleTimeString('es-CO', {
          timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit', hour12: false
        })
      });
    });

    // Índices 0..6 mapeados a Lun..Dom para mostrar Lunes primero
    const DIAS_SEMANA = [
      { dow: 1, dia: 'Lunes', diaCorto: 'Lun' },
      { dow: 2, dia: 'Martes', diaCorto: 'Mar' },
      { dow: 3, dia: 'Miércoles', diaCorto: 'Mié' },
      { dow: 4, dia: 'Jueves', diaCorto: 'Jue' },
      { dow: 5, dia: 'Viernes', diaCorto: 'Vie' },
      { dow: 6, dia: 'Sábado', diaCorto: 'Sáb' },
      { dow: 0, dia: 'Domingo', diaCorto: 'Dom' }
    ];
    const DOW_CORTO: Record<number, string> = {
      0: 'Dom', 1: 'Lun', 2: 'Mar', 3: 'Mié', 4: 'Jue', 5: 'Vie', 6: 'Sáb'
    };

    const acumDow: Record<number, { totalIngresos: number; diasEnRango: number }> = {
      0: { totalIngresos: 0, diasEnRango: 0 },
      1: { totalIngresos: 0, diasEnRango: 0 },
      2: { totalIngresos: 0, diasEnRango: 0 },
      3: { totalIngresos: 0, diasEnRango: 0 },
      4: { totalIngresos: 0, diasEnRango: 0 },
      5: { totalIngresos: 0, diasEnRango: 0 },
      6: { totalIngresos: 0, diasEnRango: 0 }
    };

    // Recorrer cada día calendario del rango [startStr, endStr] en UTC neutro (YYYY-MM-DD)
    const porFecha: Array<{ fecha: string; label: string; diaSemana: string; cantidad: number; ingresos: IngresoDia[] }> = [];
    const cursor = new Date(`${startStr}T12:00:00Z`);
    const endDateObj = new Date(`${endStr}T12:00:00Z`);

    let guard = 0;
    while (cursor <= endDateObj && guard < 400) {
      guard++;
      const yyyyMmDd = cursor.toISOString().slice(0, 10);
      const dow = cursor.getUTCDay();
      const ingresosDia = ingresosPorFecha[yyyyMmDd] || [];
      const cantidad = ingresosDia.length;

      acumDow[dow].totalIngresos += cantidad;
      acumDow[dow].diasEnRango += 1;

      const [, mm, dd] = yyyyMmDd.split('-');
      porFecha.push({
        fecha: yyyyMmDd,
        label: `${dd}/${mm}`,
        diaSemana: DOW_CORTO[dow],
        cantidad,
        ingresos: ingresosDia
      });

      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    const porDiaSemana = DIAS_SEMANA.map((d) => {
      const info = acumDow[d.dow];
      const promedioPorDia = info.diasEnRango > 0
        ? Number((info.totalIngresos / info.diasEnRango).toFixed(1))
        : 0;
      return {
        dia: d.dia,
        diaCorto: d.diaCorto,
        dow: d.dow,
        totalIngresos: info.totalIngresos,
        diasEnRango: info.diasEnRango,
        promedioPorDia
      };
    });

    const totalIngresos = porFecha.reduce((acc, p) => acc + p.cantidad, 0);
    const totalDias = porFecha.length || 1;
    const promedioDiario = Number((totalIngresos / totalDias).toFixed(1));

    // Evaluar día más fuerte y más flojo (excluir Domingo si tuvo 0 ingresos para no sesgar días no laborales)
    const tieneActividadDomingo = acumDow[0].totalIngresos > 0;
    const candidatos = porDiaSemana.filter((d) => d.diasEnRango > 0 && (tieneActividadDomingo || d.dow !== 0));

    let diaMasFuerte = null;
    let diaMasFlojo = null;
    if (candidatos.length > 0 && totalIngresos > 0) {
      const ordenados = [...candidatos].sort((a, b) => b.promedioPorDia - a.promedioPorDia || b.totalIngresos - a.totalIngresos);
      diaMasFuerte = ordenados[0];
      diaMasFlojo = ordenados[ordenados.length - 1];
    }

    res.json({
      resumen: {
        totalIngresos,
        totalDias: porFecha.length,
        promedioDiario,
        diaMasFuerte,
        diaMasFlojo
      },
      porDiaSemana,
      porFecha
    });
  } catch (error: any) {
    console.error('[getReporteIngresosDiarios] Error:', error.message);
    res.status(500).json({ error: error.message || 'Error calculando ingresos diarios' });
  }
};

/**
 * GET /api/ingresos/catalogo-items?q=&tipo=&marca=&linea=&limit=
 * Retorna sugerencias de repuestos y mano de obra aprendidas de órdenes del taller.
 */
export const getCatalogoItems = async (req: Request, res: Response): Promise<void> => {
  try {
    const empresa_id = req.empresa_id;
    if (!empresa_id) {
      res.status(401).json({ error: 'No autorizado' });
      return;
    }

    const q = typeof req.query.q === 'string' ? req.query.q : undefined;
    const tipoRaw = typeof req.query.tipo === 'string' ? req.query.tipo : undefined;
    const tipo = tipoRaw === 'repuesto' || tipoRaw === 'mano_obra' ? tipoRaw : undefined;
    const marca = typeof req.query.marca === 'string' ? req.query.marca : undefined;
    const linea = typeof req.query.linea === 'string' ? req.query.linea : undefined;
    const limitRaw = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : 50;
    const limit = Number.isFinite(limitRaw) ? limitRaw : 50;

    const items = await obtenerSugerenciasCatalogoTaller({
      empresaId: empresa_id,
      q,
      tipo,
      marca,
      linea,
      limit,
    });

    res.json({ items });
  } catch (error: any) {
    console.error('[getCatalogoItems] Error:', error.message);
    res.status(500).json({ error: error.message || 'Error consultando catálogo de ítems' });
  }
};
