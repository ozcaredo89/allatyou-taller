import { Request, Response } from 'express';
import { supabase } from '../config/supabase';
import { toBogotaDateStr, bogotaToday, getBogotaRange, bogotaDayBounds } from '../utils/dateUtils';
import { sumarItemsFactura } from '../utils/facturaUtils';
import {
  sincronizarPreciosOrdenEntregada,
  eliminarPreciosOrdenEntregada
} from '../services/catalog.service';

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

    res.json({ ingresos: data || [], promediosSLA });
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
    res.json(data || []);
  } catch (error: any) {
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
      .select('*, taller_vehiculos(*, taller_clientes(*))')
      .eq('empresa_id', req.empresa_id)
      .eq('id', id)
      .single();
      
    if (error) throw error;
    res.json(data);
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
      .select('estado, estado_desde, items_factura, vehiculo_id, taller_vehiculos(marca, linea, modelo_anio, placa)')
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

        // Si totalManoObra es >= 0, recalcular (incluso si bajó a 0 hay que actualizar a 0)
        // Consultar técnicos asignados a este ingreso
        const { data: pivoteRows } = await supabase
          .from('taller_ingresos_tecnicos')
          .select('id')
          .eq('ingreso_id', id);

        const numTecnicos = pivoteRows?.length ?? 0;

        if (numTecnicos > 0) {
          const porcentajePorTecnico = PORCENTAJE_GLOBAL_MO / numTecnicos;
          const comisionPorTecnico = Math.round(totalManoObra * (porcentajePorTecnico / 100));

          // Actualizar monto_comision Y porcentaje_aplicado para cada fila pivote
          const updatePromises = (pivoteRows || []).map((row: any) =>
            supabase
              .from('taller_ingresos_tecnicos')
              .update({
                monto_comision: comisionPorTecnico,
                porcentaje_aplicado: porcentajePorTecnico
              })
              .eq('id', row.id)
          );
          await Promise.all(updatePromises);
          console.log(`[updateIngreso] Comisiones recalculadas: ${porcentajePorTecnico}% = $${comisionPorTecnico} x ${numTecnicos} técnicos (MO: $${totalManoObra})`);
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
    // ───────────────────────────────────────────────────────────────────

    const { data, error } = await supabase
      .from('taller_ingresos')
      .update(body)
      .eq('empresa_id', req.empresa_id)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[updateIngreso] Supabase error:', JSON.stringify(error));
      throw error;
    }
    res.json(data);
  } catch (error: any) {
    console.error('[updateIngreso] Caught error:', error.message);
    res.status(500).json({ error: error.message });
  }
};

export const getReportesFinanzas = async (req: Request, res: Response): Promise<void> => {
  try {
    const { start, end } = req.query;

    // ── Determinar rango de fechas en zona America/Bogota ──────────
    let startStr: string;
    let endStr: string;
    if (start && end) {
      startStr = start as string;
      endStr = end as string;
    } else {
      // Fallback: últimos 30 días calculados en zona Bogotá
      const range = getBogotaRange('mes');
      startStr = range.startStr;
      endStr = range.endStr;
    }

    const hoyStr = bogotaToday();

    // ── 1. Obtener todos los ingresos entregados ─────────────────
    // Traemos también el id para cruzar con la bitácora.
    const { data: todos, error } = await supabase
      .from('taller_ingresos')
      .select('id, updated_at, items_factura')
      .eq('empresa_id', req.empresa_id)
      .eq('estado', 'entregado');
    if (error) throw error;

    const ingresos = todos || [];
    const ingresoIds = ingresos.map((i: any) => i.id);

    // ── 2. Obtener fechas reales de entrega desde la bitácora ────
    // taller_ingresos_bitacora (evento 'entrega') es la fuente de
    // verdad: inmune a ediciones posteriores del registro.
    // Fallback: si un ingreso no tiene evento en bitácora (registros
    // anteriores a la implementación), usaremos su updated_at.
    let bitacoraMap: Record<string, string> = {};

    if (ingresoIds.length > 0) {
      const { data: bitRows } = await supabase
        .from('taller_ingresos_bitacora')
        .select('ingreso_id, created_at')
        .eq('empresa_id', req.empresa_id)
        .eq('tipo_evento', 'entrega')
        .in('ingreso_id', ingresoIds)
        .order('created_at', { ascending: true }); // primera entrega por ingreso

      (bitRows || []).forEach((b: any) => {
        // Solo guarda la primera entrega por ingreso (por si hay re-entregas)
        if (!bitacoraMap[b.ingreso_id]) {
          bitacoraMap[b.ingreso_id] = toBogotaDateStr(b.created_at);
        }
      });
    }

    // ── 3. Calcular métricas históricas y del período ────────────
    let totalHistorico = 0;
    const diasUnicos = new Set<string>();
    let facturadoHoy = 0;

    const chartDataMap: Record<string, number> = {};
    let totalPeriodo = 0;

    ingresos.forEach((ing: any) => {
      const total = (ing.items_factura || []).reduce(
        (acc: number, item: any) => acc + (item.total || 0), 0
      );
      if (total <= 0) return;

      // Fecha de entrega: bitácora con fallback a updated_at
      const dia = bitacoraMap[ing.id] ?? toBogotaDateStr(ing.updated_at);

      totalHistorico += total;
      diasUnicos.add(dia);
      if (dia === hoyStr) facturadoHoy += total;

      // Filtrar para el período y gráfico
      if (dia >= startStr && dia <= endStr) {
        chartDataMap[dia] = (chartDataMap[dia] || 0) + total;
        totalPeriodo += total;
      }
    });

    const promedioDiarioHistorico =
      diasUnicos.size > 0 ? totalHistorico / diasUnicos.size : 0;

    const chartData = Object.keys(chartDataMap).sort().map(fecha => ({
      fecha,
      total: chartDataMap[fecha],
    }));

    // ── 4. Gastos ejecutados en el mismo período ─────────────────
    // taller_gastos.fecha es una columna DATE explícita (YYYY-MM-DD),
    // por lo que no tiene issues de timezone.
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

    // ── 5. Cálculos de rentabilidad ──────────────────────────────
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
    const { fecha } = req.query;

    // Validar param
    if (!fecha || typeof fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      res.status(400).json({ error: 'Se requiere el param fecha en formato YYYY-MM-DD' });
      return;
    }

    // ── Timezone America/Bogota (UTC-5, sin DST) ─────────────────
    // "fecha 00:00:00 COT" = "fecha 05:00:00 UTC"
    // "fecha 24:00:00 COT" = "(fecha+1) 05:00:00 UTC"
    const startDate = new Date(fecha + 'T05:00:00.000Z');
    const endDate   = new Date(startDate.getTime() + 24 * 60 * 60 * 1000);
    const startISO  = startDate.toISOString();
    const endISOStr = endDate.toISOString();

    // ── Paso 1: Buscar en la bitácora los ingresos entregados ESE día ──
    // taller_ingresos_bitacora es la fuente de verdad para la fecha de
    // entrega real — inmune a ediciones posteriores del registro.
    const { data: bitacoraEntregas, error: bitError } = await supabase
      .from('taller_ingresos_bitacora')
      .select('ingreso_id')
      .eq('empresa_id', req.empresa_id)
      .eq('tipo_evento', 'entrega')
      .gte('created_at', startISO)
      .lt('created_at', endISOStr);

    if (bitError) throw bitError;

    // Deduplicar IDs: un ingreso puede tener múltiples eventos 'entrega'
    // (ej: re-entrega por garantía). Usamos el ID único para no inflar el monto.
    const ingresosEntregadosIds = [...new Set(
      (bitacoraEntregas || []).map((b: any) => b.ingreso_id)
    )];

    if (ingresosEntregadosIds.length === 0) {
      res.json({ fecha, totalDia: 0, detalle: [] });
      return;
    }

    // ── Paso 2: Traer los datos de esos ingresos específicos ──────
    const { data, error } = await supabase
      .from('taller_ingresos')
      .select('id, items_factura, taller_vehiculos(placa)')
      .eq('empresa_id', req.empresa_id)
      .in('id', ingresosEntregadosIds);

    if (error) throw error; // Error real de DB → superficie como 500, no como empty state
    const ingresos = data || [];

    // ── Agrupar por placa, sumar montos ──────────────────────────
    // Fallback usa el id del ingreso como clave para evitar fusionar
    // vehículos huérfanos distintos (sin placa) bajo la misma entrada.
    const byPlaca: Record<string, { placa: string; total: number }> = {};
    let totalDia = 0;

    ingresos.forEach((ing: any) => {
      const placa = ing.taller_vehiculos?.placa || null;
      const key   = placa ?? `sin-placa-${ing.id}`;
      const label = placa ?? 'Vehículo no registrado';
      const total = (ing.items_factura || []).reduce((acc: number, item: any) => acc + (item.total || 0), 0);

      if (!byPlaca[key]) byPlaca[key] = { placa: label, total: 0 };
      byPlaca[key].total += total;
      totalDia += total;
    });

    const detalle = Object.values(byPlaca)
      .sort((a, b) => b.total - a.total);

    res.json({ fecha, totalDia, detalle });
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

    // Borrar asignaciones previas
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
