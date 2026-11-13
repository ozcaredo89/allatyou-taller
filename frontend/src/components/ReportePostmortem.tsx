import React, { useEffect, useState } from 'react';
import { AlertTriangle, Clock, CheckCircle2, XCircle, Loader2, TrendingDown, Layers, CalendarClock, ChevronDown, ChevronUp } from 'lucide-react';
import api from '../services/api';

interface ReportePostmortemProps {
  startDate: string;
  endDate: string;
}

interface CuelloEtapa {
  estado: string;
  promedio_minutos: number;
  total_minutos: number;
  ordenes: number;
}

interface EventoSeguimiento {
  tipo: string;
  titulo: string;
  descripcion: string;
  fecha: string;
}

interface OrdenPostmortem {
  ingreso_id: string;
  placa: string;
  vehiculo: string;
  cliente: string;
  motivo_visita: string;
  fecha_ingreso: string;
  fecha_entrega_real: string;
  fecha_entrega_estimada: string | null;
  duracion_total_minutos: number;
  desglose_etapas: Record<string, number>;
  cuello_botella_estado: string | null;
  cuello_botella_minutos: number;
  cumplio_promesa: boolean | null;
  desviacion_promesa_minutos: number | null;
  reprogramaciones_count: number;
  motivo_demora_actual: string | null;
  eventos_seguimiento: EventoSeguimiento[];
}

interface PostmortemResponse {
  resumen: {
    totalEntregados: number;
    promedioTotalMinutos: number;
    conPromesaCount: number;
    cumplimientoPromesaPct: number | null;
    ordenesDemoradasCount: number;
    etapaCuelloBotellaPrincipal: string | null;
  };
  cuellosPorEtapa: CuelloEtapa[];
  ordenes: OrdenPostmortem[];
}

const ETIQUETA_ESTADO: Record<string, string> = {
  recepcion: 'Recepción',
  diagnostico: 'Diagnóstico',
  cotizacion: 'Cotización',
  esperando_aprobacion: 'Esperando Aprobación',
  en_reparacion: 'En Reparación'
};

const formatDuracion = (minutos: number): string => {
  if (!minutos || minutos <= 0) return '0m';
  const dias = Math.floor(minutos / 1440);
  const horas = Math.floor((minutos % 1440) / 60);
  const mins = minutos % 60;
  if (dias > 0) return `${dias}d ${horas}h`;
  if (horas > 0) return `${horas}h ${mins}m`;
  return `${mins}m`;
};

const ReportePostmortem: React.FC<ReportePostmortemProps> = ({ startDate, endDate }) => {
  const [data, setData] = useState<PostmortemResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!startDate || !endDate) return;
    const controller = new AbortController();

    const cargar = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await api.get(`/ingresos/reportes/postmortem?start=${startDate}&end=${endDate}&limit=40`, {
          signal: controller.signal
        });
        setData(res.data);
      } catch (err: any) {
        if (err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') return;
        setError(err?.response?.data?.error || 'No se pudo cargar el reporte post-mortem.');
      } finally {
        setLoading(false);
      }
    };

    cargar();
    return () => controller.abort();
  }, [startDate, endDate]);

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-12 flex flex-col items-center justify-center text-slate-500">
        <Loader2 size={32} className="animate-spin text-indigo-600 mb-3" />
        <p className="text-sm font-medium">Analizando tiempos de entrega y cuellos de botella...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-red-700 flex items-center gap-3">
        <AlertTriangle size={20} />
        <span className="text-sm font-medium">{error}</span>
      </div>
    );
  }

  if (!data || data.resumen.totalEntregados === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
        <Clock size={40} className="mx-auto text-slate-300 mb-3" />
        <h3 className="text-base font-bold text-slate-800">Sin entregas registradas en este período</h3>
        <p className="text-sm text-slate-500 mt-1">
          Selecciona otro rango semanal o mensual para analizar los vehículos que más tardaron.
        </p>
      </div>
    );
  }

  const { resumen, cuellosPorEtapa, ordenes } = data;

  return (
    <div className="space-y-6">
      {/* KPIs Post-Mortem */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Tiempo Promedio Total</p>
          <p className="text-2xl font-extrabold text-slate-900 mt-1">{formatDuracion(resumen.promedioTotalMinutos)}</p>
          <p className="text-xs text-slate-500 mt-1">{resumen.totalEntregados} vehículos entregados</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Cumplimiento de Promesa</p>
          <p className="text-2xl font-extrabold text-emerald-700 mt-1">
            {resumen.cumplimientoPromesaPct !== null ? `${resumen.cumplimientoPromesaPct}%` : 'Sin datos'}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {resumen.conPromesaCount > 0
              ? `De ${resumen.conPromesaCount} con fecha estimada`
              : 'Define fecha estimada al diagnosticar'}
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Órdenes Demoradas</p>
          <p className="text-2xl font-extrabold text-red-600 mt-1">{resumen.ordenesDemoradasCount}</p>
          <p className="text-xs text-slate-500 mt-1">Vencieron promesa o +1.5x promedio</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Cuello de Botella Principal</p>
          <p className="text-xl font-extrabold text-amber-700 mt-1">
            {resumen.etapaCuelloBotellaPrincipal
              ? ETIQUETA_ESTADO[resumen.etapaCuelloBotellaPrincipal] || resumen.etapaCuelloBotellaPrincipal
              : '—'}
          </p>
          <p className="text-xs text-slate-500 mt-1">Etapa con mayor promedio de espera</p>
        </div>
      </div>

      {/* Desglose de cuellos por etapa */}
      {cuellosPorEtapa.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Layers size={18} className="text-indigo-600" />
            <h3 className="font-bold text-slate-900 text-base">Tiempo promedio por etapa del taller</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {cuellosPorEtapa.map((c) => (
              <div key={c.estado} className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <p className="text-xs font-semibold text-slate-500">{ETIQUETA_ESTADO[c.estado] || c.estado}</p>
                <p className="text-lg font-extrabold text-slate-900 mt-0.5">{formatDuracion(c.promedio_minutos)}</p>
                <p className="text-[11px] text-slate-400">{c.ordenes} órdenes</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ranking de carros que más tardaron */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingDown size={18} className="text-red-600" />
            <div>
              <h3 className="font-bold text-slate-900 text-base">Ranking Post-Mortem: Carros que más tardaron</h3>
              <p className="text-xs text-slate-500">Ordenados de mayor a menor duración total para detectar causas raíz y mejorar procesos.</p>
            </div>
          </div>
        </div>

        <div className="divide-y divide-slate-100">
          {ordenes.map((ord, idx) => {
            const isExpanded = expandedId === ord.ingreso_id;
            const superoPromedio = resumen.promedioTotalMinutos > 0 && ord.duracion_total_minutos >= resumen.promedioTotalMinutos * 1.5;

            return (
              <div key={ord.ingreso_id} className="p-4 hover:bg-slate-50/70 transition-colors">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-extrabold shrink-0 ${
                      idx < 3 ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'
                    }`}>
                      #{idx + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-extrabold text-slate-900 text-sm tracking-wide">{ord.placa}</span>
                        <span className="text-xs text-slate-600">{ord.vehiculo}</span>
                        <span className="text-xs text-slate-400">· {ord.cliente}</span>
                      </div>
                      <p className="text-xs text-slate-500 truncate max-w-xl mt-0.5">
                        {ord.motivo_visita || 'Sin motivo registrado'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${
                      superoPromedio
                        ? 'bg-red-50 text-red-700 border-red-200'
                        : 'bg-slate-100 text-slate-800 border-slate-200'
                    }`}>
                      Total: {formatDuracion(ord.duracion_total_minutos)}
                    </span>

                    {ord.cuello_botella_estado && (
                      <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                        Mayor demora: {ETIQUETA_ESTADO[ord.cuello_botella_estado] || ord.cuello_botella_estado} ({formatDuracion(ord.cuello_botella_minutos)})
                      </span>
                    )}

                    {ord.cumplio_promesa === true && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <CheckCircle2 size={13} /> A tiempo
                      </span>
                    )}
                    {ord.cumplio_promesa === false && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-red-50 text-red-700 border border-red-200">
                        <XCircle size={13} /> +{formatDuracion(ord.desviacion_promesa_minutos || 0)} tarde
                      </span>
                    )}
                    {ord.reprogramaciones_count > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                        <CalendarClock size={12} /> {ord.reprogramaciones_count} reprog.
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : ord.ingreso_id)}
                      className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200/60"
                      title="Ver desglose y bitácora de seguimiento"
                    >
                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
                      <p className="font-bold text-slate-700 mb-2">Desglose por etapa</p>
                      <div className="space-y-1">
                        {Object.entries(ord.desglose_etapas).map(([est, mins]) => (
                          <div key={est} className="flex justify-between text-slate-600">
                            <span>{ETIQUETA_ESTADO[est] || est}</span>
                            <span className="font-semibold text-slate-900">{formatDuracion(mins)}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
                      <p className="font-bold text-slate-700 mb-2">Historial de seguimiento y reprogramaciones</p>
                      {ord.eventos_seguimiento.length > 0 ? (
                        <ul className="space-y-1.5">
                          {ord.eventos_seguimiento.map((ev, i) => (
                            <li key={i} className="text-slate-600">
                              <span className="font-semibold text-slate-800">{ev.titulo}:</span> {ev.descripcion}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-slate-400 italic">
                          {ord.motivo_demora_actual
                            ? `Último reporte: ${ord.motivo_demora_actual}`
                            : 'Sin reportes de seguimiento registrados durante esta orden.'}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ReportePostmortem;
