import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Car, TrendingUp, TrendingDown, CalendarDays, Loader2, AlertTriangle } from 'lucide-react';
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
}

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
            <p className="text-xs text-slate-500">Cantidad exacta de vehículos recibidos por fecha calendario.</p>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={porFecha} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
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
                <Bar dataKey="cantidad" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReporteIngresosDiarios;
