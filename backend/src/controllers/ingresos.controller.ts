import { Request, Response } from 'express';
import { supabase } from '../config/supabase';
import { toBogotaDateStr, bogotaToday, getBogotaRange, bogotaDayBounds } from '../utils/dateUtils';
import { sumarItemsFactura } from '../utils/facturaUtils';
import {
  sincronizarPreciosOrdenEntregada,
  eliminarPreciosOrdenEntregada
} from '../services/catalog.service';
import {
  evaluarAplicaRenting,
  procesarSincronizacionRenting
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
    const { data, error } = await supabase
      .from('taller_ingresos')
      .select('*, taller_vehiculos(*, taller_clientes(*)), taller_ingresos_tecnicos(taller_tecnicos(id, nombre))')
      .eq('empresa_id', req.empresa_id)
      .in('estado', ['recepcion', 'diagnostico', 'cotizacion', 'esperando_aprobacion', 'en_reparacion']);
      
    if (error) throw error;

    // Calcular promedios SLA por estado para esta empresa
    const { data: tiempos } = await supabase
      .from('taller_ingresos_tiempos')
      .select('estado, duracion_minutos')
      .eq('empresa_id', req.empresa_id);

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

    const ingresosConRenting = (data || []).map((ing: any) => ({
      ...ing,
      aplica_renting: evaluarAplicaRenting(req.empresa_id, ing.taller_vehiculos?.taller_clientes?.documento)
    }));

    res.json({ ingresos: ingresosConRenting, promediosSLA });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
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
    res.json({ ...data, aplica_renting: aplicaRenting });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const updateIngreso = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const body = req.body;
    
    console.log(`[updateIngreso] id=${id} empresa_id=${req.empresa_id} body_keys=${Object.keys(body).join(',')}`);

    // 1. Obtener estado actual para SLA y comisiones
    const { data: current, error: fetchError } = await supabase
      .from('taller_ingresos')
      .select('estado, estado_desde, items_factura, vehiculo_id, motivo_visita, kilometraje, nivel_gasolina, fecha_ingreso, renting_sync_at, taller_vehiculos(id, marca, linea, modelo_anio, color, placa, cliente_id, taller_clientes(id, documento, nombre_completo, telefono))')
      .eq('empresa_id', req.empresa_id)
      .eq('id', id)
      .single();

    if (fetchError) {
      console.error('[updateIngreso] Error fetching current state:', fetchError);
    }

    // 2. Si viene un cambio de estado, registrar la transición SLA
    if (body.estado && current && current.estado !== body.estado) {
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

      // Resetear estado_desde para el nuevo estado
      body.estado_desde = new Date().toISOString();
    }

    // 3. ── AUTOMATISMO DE COMISIONES (MODELO PORCENTAJE) ──────────────────
    // Calcular y guardar comisiones por MO si pasa a entregado, o si ya estaba entregado y se están editando los ítems
    const isTransitioningToEntregado = body.estado === 'entregado' && current?.estado !== 'entregado';
    const isAlreadyEntregadoAndEditingItems = current?.estado === 'entregado' && body.items_factura !== undefined && body.estado !== 'cancelado';

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
    } else if (body.estado === 'cancelado' && current?.estado === 'entregado') {
      if (req.empresa_id) {
        eliminarPreciosOrdenEntregada(req.empresa_id, id as string).catch(err => {
          console.error('[updateIngreso] Error eliminando precios de orden cancelada:', err);
        });
      }
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
      ...camposIngreso
    } = body;

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

    // 3. Ejecutar update principal en taller_ingresos
    const { data, error } = await supabase
      .from('taller_ingresos')
      .update(camposIngreso)
      .eq('empresa_id', req.empresa_id)
      .eq('id', id)
      .select('*, taller_vehiculos(*, taller_clientes(*)), taller_ingresos_tecnicos(taller_tecnicos(id, nombre))')
      .single();

    if (error) {
      console.error('[updateIngreso] Supabase error:', JSON.stringify(error));
      throw error;
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

    const chartData = Object.keys(chartDataMap).sort().map(fecha => ({
      fecha,
      total: chartDataMap[fecha],
    }));

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

    const promedioDiarioHistorico =
      diasUnicos.size > 0 ? totalHistorico / diasUnicos.size : 0;

    // ── 3. Gastos ejecutados en el mismo período ─────────────────
    const { data: gastosData, error: gastosError } = await supabase
      .from('taller_gastos')
      .select(`
        monto, fecha,
        taller_categorias_gastos(id, nombre, color)
      `)
      .eq('empresa_id', req.empresa_id)
      .gte('fecha', startStr)
      .lte('fecha', endStr);

    if (gastosError) {
      console.error('[getReportesFinanzas] Error fetching gastos:', gastosError.message);
      throw gastosError;
    }

    const gastos = gastosData || [];
    let totalGastos = 0;
    const gastosPorCategoriaMap: Record<string, { nombre: string; color: string; total: number }> = {};

    gastos.forEach((g: any) => {
      totalGastos += Number(g.monto || 0);
      const cat = g.taller_categorias_gastos;
      if (cat) {
        if (!gastosPorCategoriaMap[cat.id]) {
          gastosPorCategoriaMap[cat.id] = { nombre: cat.nombre, color: cat.color, total: 0 };
        }
        gastosPorCategoriaMap[cat.id].total += Number(g.monto || 0);
      } else {
        if (!gastosPorCategoriaMap['sin_categoria']) {
          gastosPorCategoriaMap['sin_categoria'] = { nombre: 'Sin categoría', color: '#6b7280', total: 0 };
        }
        gastosPorCategoriaMap['sin_categoria'].total += Number(g.monto || 0);
      }
    });

    const gastosPorCategoria = Object.values(gastosPorCategoriaMap)
      .sort((a, b) => b.total - a.total);

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
        totalGastos,
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

    // Ordenar de más reciente a más antigua, y por monto mayor
    ordenes.sort((a, b) => b.fecha_entrega.localeCompare(a.fecha_entrega) || b.total - a.total);

    res.json({
      rango: { start: startStr, end: endStr },
      fecha: startStr === endStr ? startStr : undefined,
      totalPeriodo,
      totalManoObra,
      totalRepuestos,
      totalOrdenes: ordenes.length,
      ordenes,
    });
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
          return [{ placa, tiempos: porIngreso[ingresoId], totalFacturado: null }];
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

        return [{ placa, tiempos: porIngreso[ingresoId], totalFacturado }];
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
      .order('created_at', { ascending: true })
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
export const syncIngresoToRenting = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { date, description, items } = req.body || {};

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

    // 2. Consultar orden desde la base de datos con aislamiento estricto de tenant
    const { data: ingreso, error: fetchErr } = await supabase
      .from('taller_ingresos')
      .select('id, estado, renting_sync_at, taller_vehiculos(placa, taller_clientes(documento))')
      .eq('empresa_id', req.empresa_id)
      .eq('id', id)
      .single();

    if (fetchErr || !ingreso) {
      res.status(404).json({ error: 'Orden no encontrada en este taller' });
      return;
    }

    // 3. Exigir que la orden esté en estado entregado
    if (ingreso.estado !== 'entregado') {
      res.status(400).json({ error: 'Solo se pueden sincronizar con Renting órdenes que se encuentren en estado entregado.' });
      return;
    }

    // 4. Re-validar elegibilidad multi-tenant y de propietario (Fail-Closed)
    const clienteDoc = (ingreso.taller_vehiculos as any)?.taller_clientes?.documento;
    if (!evaluarAplicaRenting(req.empresa_id, clienteDoc)) {
      res.status(403).json({ error: 'Acceso denegado: Esta orden no pertenece a la flota autorizada para sincronización con Renting.' });
      return;
    }

    // 5. La placa es tomada directamente de la DB (inmutable)
    const placaDb = (ingreso.taller_vehiculos as any)?.placa;
    if (!placaDb) {
      res.status(400).json({ error: 'La orden no tiene un vehículo con placa asociado' });
      return;
    }

    // 6. Ejecutar reclamo atómico y llamada a Renting
    const result = await procesarSincronizacionRenting({
      ingresoId: id as string,
      empresaId: req.empresa_id,
      placa: placaDb,
      date,
      description,
      items
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
      { expense_ids: result.expenseIds }
    );

    res.json({
      ok: true,
      message: 'Gasto registrado exitosamente en AllAtYou Renting',
      expense_ids: result.expenseIds
    });
  } catch (err: any) {
    console.error('[syncIngresoToRenting] Error:', err.message);
    res.status(500).json({ error: err.message || 'Error al sincronizar gasto con Renting' });
  }
};
