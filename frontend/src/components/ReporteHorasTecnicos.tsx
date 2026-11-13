import React, { useEffect, useState } from 'react';
import { Wrench, Clock, Loader2, AlertTriangle, ChevronDown, ChevronUp, Users, Car, Settings2 } from 'lucide-react';
import api from '../services/api';

interface ReporteHorasTecnicosProps {
  startDate: string;
  endDate: string;
}

interface DetalleOrdenTecnico {
  ingreso_id: string;
  placa: string;
  vehiculo: string;
  estado_actual: string;
  minutos_laborales: number;
  minutos_diagnostico: number;
  minutos_reparacion: number;
  fecha_ingreso: string;
}

interface TecnicoHoras {
  tecnico_id: string;
  nombre: string;
  estado: string;
  minutos_laborales_total: number;
  horas_laborales_total: number;
  minutos_diagnostico: number;
  minutos_reparacion: number;
  ordenes_count: number;
  ordenes_entregadas_count: number;
  ordenes_activas_count: number;
  detalle_ordenes: DetalleOrdenTecnico[];
}

interface HorasTecnicosResponse {
  resumen: {
    totalTecnicosConRegistro: number;
    totalTecnicos: number;
    totalHorasLaborales: number;
    promedioHorasPorTecnico: number;
    totalOrdenesAtendidas: number;
  };
  tecnicos: TecnicoHoras[];
}

const formatHorasMin = (minutos: number): string => {
  if (!minutos || minutos <= 0) return '0h';
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
};

const ReporteHorasTecnicos: React.FC<ReporteHorasTecnicosProps> = ({ startDate, endDate }) => {
  const [data, setData] = useState<HorasTecnicosResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Horario laboral configurable (por defecto horario estándar taller Colombia)
  const [lvStart, setLvStart] = useState<string>('08:00');
  const [lvEnd, setLvEnd] = useState<string>('18:00');
  const [sabStart, setSabStart] = useState<string>('08:00');
  const [sabEnd, setSabEnd] = useState<string>('13:00');
  const [domLaboral, setDomLaboral] = useState<boolean>(false);

  useEffect(() => {
    if (!startDate || !endDate) return;
    const controller = new AbortController();

    const cargar = async () => {
      try {
        setLoading(true);
        setError(null);
        const params = new URLSearchParams({
          start: startDate,
          end: endDate,
          lvStart,
          lvEnd,
          sabStart,
          sabEnd,
          domLaboral: String(domLaboral)
        });
        const res = await api.get(`/ingresos/reportes/horas-tecnicos?${params.toString()}`, {
          signal: controller.signal
        });
        setData(res.data);
      } catch (err: any) {
        if (err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') return;
        setError(err?.response?.data?.error || 'No se pudo cargar el reporte de horas por mecánico.');
      } finally {
        setLoading(false);
      }
    };

    cargar();
    return () => controller.abort();
  }, [startDate, endDate, lvStart, lvEnd, sabStart, sabEnd, domLaboral]);

  const maxMinutos = data?.tecnicos?.[0]?.minutos_laborales_total || 1;

  return (
    <div className="space-y-6">
      {/* Configuración de horario laboral */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
            <Settings2 size={15} className="text-indigo-600" />
            <span>Horario laboral aplicado (solo cuenta etapas de Diagnóstico y Reparación):</span>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1">
              <span className="font-semibold text-slate-700">Lun–Vie:</span>
              <input
                type="time"
                value={lvStart}
                onChange={(e) => setLvStart(e.target.value)}
                className="bg-transparent font-medium text-slate-900 outline-none"
              />
              <span>a</span>
              <input
                type="time"
                value={lvEnd}
                onChange={(e) => setLvEnd(e.target.value)}
                className="bg-transparent font-medium text-slate-900 outline-none"
              />
            </div>

            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1">
              <span className="font-semibold text-slate-700">Sáb:</span>
              <input
                type="time"
                value={sabStart}
                onChange={(e) => setSabStart(e.target.value)}
                className="bg-transparent font-medium text-slate-900 outline-none"
              />
              <span>a</span>
              <input
                type="time"
                value={sabEnd}
                onChange={(e) => setSabEnd(e.target.value)}
                className="bg-transparent font-medium text-slate-900 outline-none"
              />
            </div>

            <label className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={domLaboral}
                onChange={(e) => setDomLaboral(e.target.checked)}
                className="rounded border-slate-300 text-indigo-600"
              />
              <span className="font-medium text-slate-700">Incluir domingo (8–13)</span>
            </label>
          </div>
        </div>
      </div>

      {loading && (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 flex flex-col items-center justify-center text-slate-500">
          <Loader2 size={32} className="animate-spin text-indigo-600 mb-3" />
          <p className="text-sm font-medium">Calculando horas laborales trabajadas por cada mecánico...</p>
        </div>
      )}

      {error && !loading && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-red-700 flex items-center gap-3">
          <AlertTriangle size={20} />
          <span className="text-sm font-medium">{error}</span>
        </div>
      )}

      {data && !loading && !error && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Horas Laborales</p>
              <p className="text-2xl font-extrabold text-indigo-700 mt-1">{data.resumen.totalHorasLaborales}h</p>
              <p className="text-xs text-slate-500 mt-1">Suma de todos los mecánicos</p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Promedio / Mecánico</p>
              <p className="text-2xl font-extrabold text-slate-900 mt-1">{data.resumen.promedioHorasPorTecnico}h</p>
              <p className="text-xs text-slate-500 mt-1">Entre {data.resumen.totalTecnicosConRegistro} con actividad</p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Mecánicos Activos</p>
              <p className="text-2xl font-extrabold text-slate-900 mt-1 flex items-center gap-2">
                <Users size={20} className="text-slate-400" />
                {data.resumen.totalTecnicosConRegistro} / {data.resumen.totalTecnicos}
              </p>
              <p className="text-xs text-slate-500 mt-1">Con órdenes en este período</p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Vehículos Atendidos</p>
              <p className="text-2xl font-extrabold text-emerald-700 mt-1 flex items-center gap-2">
                <Car size={20} className="text-emerald-500" />
                {data.resumen.totalOrdenesAtendidas}
              </p>
              <p className="text-xs text-slate-500 mt-1">Órdenes con técnico asignado</p>
            </div>
          </div>

          {/* Lista por mecánico */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
              <Wrench size={18} className="text-indigo-600" />
              <div>
                <h3 className="font-bold text-slate-900 text-base">Horas trabajadas por mecánico</h3>
                <p className="text-xs text-slate-500">Haz clic en un mecánico para ver el detalle por vehículo.</p>
              </div>
            </div>

            {data.tecnicos.length === 0 ? (
              <div className="p-10 text-center text-slate-500 text-sm">
                No hay técnicos registrados en este taller.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {data.tecnicos.map((tec) => {
                  const isExpanded = expandedId === tec.tecnico_id;
                  const pctBar = maxMinutos > 0 ? Math.round((tec.minutos_laborales_total / maxMinutos) * 100) : 0;

                  return (
                    <div key={tec.tecnico_id} className="p-4 hover:bg-slate-50/70 transition-colors">
                      <div
                        className="flex flex-wrap items-center justify-between gap-4 cursor-pointer"
                        onClick={() => setExpandedId(isExpanded ? null : tec.tecnico_id)}
                      >
                        <div className="min-w-[200px] flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 text-sm">{tec.nombre}</span>
                            <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                              {tec.ordenes_count} {tec.ordenes_count === 1 ? 'carro' : 'carros'}
                            </span>
                          </div>
                          <div className="mt-2 w-full max-w-md bg-slate-100 h-2 rounded-full overflow-hidden">
                            <div
                              className="bg-indigo-600 h-full rounded-full transition-all"
                              style={{ width: `${pctBar}%` }}
                            />
                          </div>
                        </div>

                        <div className="flex items-center gap-3 flex-wrap">
                          <div className="text-right">
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-200">
                              <Clock size={13} /> {formatHorasMin(tec.minutos_laborales_total)}
                            </span>
                          </div>

                          <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200">
                            Diag: {formatHorasMin(tec.minutos_diagnostico)}
                          </span>
                          <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-purple-50 text-purple-800 border border-purple-200">
                            Rep: {formatHorasMin(tec.minutos_reparacion)}
                          </span>

                          <button
                            type="button"
                            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
                            title="Ver detalle de vehículos"
                          >
                            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="mt-3 pt-3 border-t border-slate-100">
                          {tec.detalle_ordenes.length === 0 ? (
                            <p className="text-xs text-slate-400 italic">Sin horas laborales registradas en este período.</p>
                          ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                              {tec.detalle_ordenes.map((ord) => (
                                <div
                                  key={ord.ingreso_id}
                                  className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between text-xs"
                                >
                                  <div>
                                    <span className="font-extrabold text-slate-900">{ord.placa}</span>
                                    <span className="text-slate-600 ml-1.5">{ord.vehiculo}</span>
                                    <p className="text-[11px] text-slate-400 mt-0.5 capitalize">
                                      Estado actual: {ord.estado_actual.replace('_', ' ')}
                                    </p>
                                  </div>
                                  <div className="text-right">
                                    <p className="font-bold text-indigo-700">{formatHorasMin(ord.minutos_laborales)}</p>
                                    <p className="text-[11px] text-slate-500">
                                      D: {formatHorasMin(ord.minutos_diagnostico)} · R: {formatHorasMin(ord.minutos_reparacion)}
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default ReporteHorasTecnicos;
