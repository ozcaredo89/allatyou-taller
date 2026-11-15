import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Car, TrendingUp, TrendingDown, CalendarDays, Loader2, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import api from '../services/api';

interface ReporteIngresosDiariosProps {
  startDate: string;
  endDate: string;
}

interface DiaSemanaItem {
  dia: string;
  diaCorto: string;
  dow: number;
  totalIngresos: number;
  diasEnRango: number;
  promedioPorDia: number;
}

interface FechaItem {
  fecha: string;
  label: string;
  diaSemana: string;
  cantidad: number;
  ingresos?: IngresoDia[];
}

interface IngresoDia {
  id: string;
  placa: string;
  vehiculo: string;
  estado: string;
  hora: string;
}

const ESTADOS: Record<string, { label: string; cls: string }> = {
  recepcion: { label: 'Recepción', cls: 'bg-slate-100 text-slate-700' },
  diagnostico: { label: 'Diagnóstico', cls: 'bg-sky-50 text-sky-700' },
  cotizacion: { label: 'Cotización', cls: 'bg-violet-50 text-violet-700' },
  esperando_aprobacion: { label: 'Esp. aprobación', cls: 'bg-amber-50 text-amber-700' },
  en_reparacion: { label: 'En reparación', cls: 'bg-indigo-50 text-indigo-700' },
  entregado: { label: 'Entregado', cls: 'bg-emerald-50 text-emerald-700' }
};

interface IngresosDiariosResponse {
  resumen: {
    totalIngresos: number;
    totalDias: number;
    promedioDiario: number;
    diaMasFuerte: DiaSemanaItem | null;
    diaMasFlojo: DiaSemanaItem | null;
  };
  porDiaSemana: DiaSemanaItem[];
  porFecha: FechaItem[];
}

const ReporteIngresosDiarios: React.FC<ReporteIngresosDiariosProps> = ({ startDate, endDate }) => {
  const [data, setData] = useState<IngresosDiariosResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [metricaSemana, setMetricaSemana] = useState<'promedioPorDia' | 'totalIngresos'>('promedioPorDia');
  const [diaIdx, setDiaIdx] = useState<number>(-1);
  const { slug } = useParams<{ slug: string }>();

  useEffect(() => {
    if (!startDate || !endDate) return;
    const controller = new AbortController();

    const cargar = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await api.get(`/ingresos/reportes/ingresos-diarios?start=${startDate}&end=${endDate}`, {
          signal: controller.signal
        });
        setData(res.data);
        // Por defecto se abre el último día con ingresos del rango
        const fechas: FechaItem[] = res.data?.porFecha || [];
        let ultimo = -1;
        fechas.forEach((f, i) => { if (f.cantidad > 0) ultimo = i; });
        setDiaIdx(ultimo);
      } catch (err: any) {
        if (err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') return;
        setError(err?.response?.data?.error || 'No se pudo cargar el reporte de ingresos diarios.');
      } finally {
        setLoading(false);
      }
    };

    cargar();
    return () => controller.abort();
  }, [startDate, endDate]);

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 flex flex-col items-center justify-center text-slate-500">
        <Loader2 size={28} className="animate-spin text-indigo-600 mb-2" />
        <p className="text-sm font-medium">Analizando ingresos de vehículos por día...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-5 text-red-700 flex items-center gap-3">
        <AlertTriangle size={18} />
        <span className="text-sm font-medium">{error}</span>
      </div>
    );
  }

  if (!data) return null;

  const { resumen, porDiaSemana, porFecha } = data;
  const dowFuerte = resumen.diaMasFuerte?.dow;
  const dowFlojo = resumen.diaMasFlojo?.dow;
  const diaSel: FechaItem | undefined = porFecha[diaIdx];
  const ingresosDia = diaSel?.ingresos || [];

  return (
    <div className="space-y-5">
      {/* KPIs de Demanda */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Vehículos Ingresados</p>
          <p className="text-2xl font-extrabold text-indigo-700 mt-1 flex items-center gap-2">
            <Car size={20} className="text-indigo-500" />
            {resumen.totalIngresos}
          </p>
          <p className="text-xs text-slate-500 mt-1">En {resumen.totalDias} días analizados</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Promedio Diario</p>
          <p className="text-2xl font-extrabold text-slate-900 mt-1">{resumen.promedioDiario} carros/día</p>
          <p className="text-xs text-slate-500 mt-1">Basado en fecha de recepción</p>
        </div>

        <div className="bg-white rounded-2xl border border-emerald-200 bg-emerald-50/30 p-5 shadow-sm">
          <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wider flex items-center gap-1">
            <TrendingUp size={13} /> Día Más Fuerte
          </p>
          <p className="text-2xl font-extrabold text-emerald-800 mt-1">
            {resumen.diaMasFuerte ? resumen.diaMasFuerte.dia : '—'}
          </p>
          <p className="text-xs text-emerald-700/80 mt-1">
            {resumen.diaMasFuerte
              ? `Prom. ${resumen.diaMasFuerte.promedioPorDia}/día (${resumen.diaMasFuerte.totalIngresos} total)`
              : 'Sin datos en el rango'}
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-amber-200 bg-amber-50/30 p-5 shadow-sm">
          <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider flex items-center gap-1">
            <TrendingDown size={13} /> Día Más Flojo (Oportunidad)
          </p>
          <p className="text-2xl font-extrabold text-amber-800 mt-1">
            {resumen.diaMasFlojo ? resumen.diaMasFlojo.dia : '—'}
          </p>
          <p className="text-xs text-amber-700/80 mt-1">
            {resumen.diaMasFlojo
              ? `Prom. ${resumen.diaMasFlojo.promedioPorDia}/día (${resumen.diaMasFlojo.totalIngresos} total)`
              : 'Sin datos en el rango'}
          </p>
        </div>
      </div>

      {/* Gráficas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Por Día de la Semana */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div>
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <CalendarDays size={17} className="text-indigo-600" />
                Patrón por Día de la Semana
              </h3>
              <p className="text-xs text-slate-500">Identifica días pico (verde) y días valle para ofertas (ámbar).</p>
            </div>
            <div className="flex bg-slate-100 p-0.5 rounded-lg text-xs">
              <button
                type="button"
                onClick={() => setMetricaSemana('promedioPorDia')}
                className={`px-2.5 py-1 rounded-md font-semibold transition cursor-pointer ${
                  metricaSemana === 'promedioPorDia' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'
                }`}
              >
                Promedio
              </button>
              <button
                type="button"
                onClick={() => setMetricaSemana('totalIngresos')}
                className={`px-2.5 py-1 rounded-md font-semibold transition cursor-pointer ${
                  metricaSemana === 'totalIngresos' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'
                }`}
              >
                Total
              </button>
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={porDiaSemana} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <XAxis dataKey="diaCorto" tick={{ fontSize: 12, fill: '#475569' }} />
                <YAxis allowDecimals={metricaSemana === 'promedioPorDia'} tick={{ fontSize: 12, fill: '#64748b' }} />
                <Tooltip
                  formatter={(value: any) => [
                    `${value} ${metricaSemana === 'promedioPorDia' ? 'carros/día' : 'carros'}`,
                    metricaSemana === 'promedioPorDia' ? 'Promedio' : 'Total'
                  ]}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.dia || ''}
                  contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                />
                <Bar dataKey={metricaSemana} radius={[6, 6, 0, 0]}>
                  {porDiaSemana.map((entry) => {
                    let fill = '#4f46e5';
                    if (resumen.totalIngresos > 0) {
                      if (entry.dow === dowFuerte) fill = '#10b981';
                      else if (entry.dow === dowFlojo) fill = '#f59e0b';
                    }
                    return <Cell key={entry.diaCorto} fill={fill} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Evolución Día por Día */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="mb-4">
            <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
              <TrendingUp size={17} className="text-indigo-600" />
              Ingresos Día a Día
            </h3>
            <p className="text-xs text-slate-500">Toca un día para ver las placas recibidas y abrir cada servicio.</p>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={porFecha}
                margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
                style={{ cursor: 'pointer' }}
                onClick={(state: any) => {
                  const idx = Number(state?.activeTooltipIndex);
                  if (state?.activeTooltipIndex != null && Number.isInteger(idx) && porFecha[idx]) setDiaIdx(idx);
                }}
              >
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#475569' }} interval="preserveStartEnd" />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <Tooltip
                  formatter={(value: any) => [`${value} vehículos`, 'Ingresos']}
                  labelFormatter={(_, payload) => {
                    const p = payload?.[0]?.payload;
                    return p ? `${p.diaSemana} ${p.fecha}` : '';
                  }}
                  contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                />
                <Bar dataKey="cantidad" radius={[4, 4, 0, 0]}>
                  {porFecha.map((f, i) => (
                    <Cell key={f.fecha} fill={i === diaIdx ? '#312e81' : '#6366f1'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Detalle del día seleccionado: placas con enlace al servicio */}
          {diaSel && (
            <div className="mt-4 border-t border-slate-100 pt-3">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setDiaIdx((i) => Math.max(0, i - 1))}
                  disabled={diaIdx <= 0}
                  aria-label="Día anterior"
                  className="h-11 w-11 shrink-0 flex items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 transition cursor-pointer disabled:opacity-30 disabled:pointer-events-none"
                >
                  <ChevronLeft size={20} />
                </button>
                <div className="text-center min-w-0">
                  <p className="text-sm font-bold text-slate-900">{diaSel.diaSemana} {diaSel.label}</p>
                  <p className="text-xs text-slate-500">
                    {diaSel.cantidad === 1 ? '1 vehículo' : `${diaSel.cantidad} vehículos`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDiaIdx((i) => Math.min(porFecha.length - 1, i + 1))}
                  disabled={diaIdx >= porFecha.length - 1}
                  aria-label="Día siguiente"
                  className="h-11 w-11 shrink-0 flex items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 transition cursor-pointer disabled:opacity-30 disabled:pointer-events-none"
                >
                  <ChevronRight size={20} />
                </button>
              </div>

              {ingresosDia.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-4">Sin vehículos recibidos este día.</p>
              ) : (
                <ul className="mt-2 divide-y divide-slate-100 max-h-72 overflow-y-auto">
                  {ingresosDia.map((ing) => {
                    const est = ESTADOS[ing.estado] || { label: ing.estado, cls: 'bg-slate-100 text-slate-700' };
                    return (
                      <li key={ing.id}>
                        <Link
                          to={`/${slug}/historial/${ing.id}`}
                          className="flex items-center gap-3 min-h-12 py-2 px-1 rounded-lg hover:bg-indigo-50/60 transition"
                        >
                          <span className="font-mono text-sm font-bold text-indigo-700 shrink-0">{ing.placa}</span>
                          <span className="text-xs text-slate-600 truncate min-w-0 flex-1">
                            {ing.vehiculo || '—'} · {ing.hora}
                          </span>
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap shrink-0 ${est.cls}`}>
                            {est.label}
                          </span>
                          <ChevronRight size={16} className="text-slate-400 shrink-0" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReporteIngresosDiarios;
