import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Calendar, DollarSign, TrendingUp, AlertTriangle, Loader2, BarChart3 } from 'lucide-react';
import api from '../services/api';

const Reportes: React.FC = () => {
  const { t } = useTranslation();
  
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState('mes');
  const [data, setData] = useState({
    chartData: [],
    kpis: { facturadoHoy: 0, promedioDiarioHistorico: 0, totalPeriodo: 0 }
  });

  useEffect(() => {
    cargarDatos();
  }, [filtro]);

  const cargarDatos = async () => {
    try {
      setLoading(true);
      let start = '';
      let end = new Date().toISOString().split('T')[0];
      const hoy = new Date();
      
      if (filtro === 'hoy') {
        start = end;
      } else if (filtro === 'semana') {
        const hace7Dias = new Date();
        hace7Dias.setDate(hoy.getDate() - 6); // Ultimos 7 dias (incluyendo hoy)
        start = hace7Dias.toISOString().split('T')[0];
      } else if (filtro === 'mes') {
        const hace30Dias = new Date();
        hace30Dias.setDate(hoy.getDate() - 29); // Ultimos 30 dias
        start = hace30Dias.toISOString().split('T')[0];
      }
      
      const endpoint = start ? `/ingresos/reportes/finanzas?start=${start}&end=${end}` : '/ingresos/reportes/finanzas';
      
      const res = await api.get(endpoint);
      setData(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const formatearDinero = (monto: number) => {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(monto);
  };

  const { facturadoHoy, promedioDiarioHistorico, totalPeriodo } = data.kpis;
  const horaActual = new Date().getHours();
  // Alerta termometro si son mas de las 3pm y facturadoHoy < 60% del promedioHistoricoDiario
  const showAlertaTermometro = horaActual >= 15 && facturadoHoy < (promedioDiarioHistorico * 0.6);

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('reportes.title')}</h1>
          <p className="text-slate-500">{t('reportes.subtitle')}</p>
        </div>
        
        <select 
          value={filtro} 
          onChange={(e) => setFiltro(e.target.value)}
          className="border border-slate-200 bg-white rounded-lg px-4 py-2 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none w-full md:w-48"
        >
          <option value="hoy">{t('reportes.filtro_hoy')}</option>
          <option value="semana">{t('reportes.filtro_semana')}</option>
          <option value="mes">{t('reportes.filtro_mes')}</option>
        </select>
      </div>

      {showAlertaTermometro && (
        <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex items-start gap-3 text-amber-800 shadow-sm">
          <AlertTriangle className="mt-0.5 shrink-0" size={20} />
          <p className="text-sm font-medium leading-relaxed">
            {t('reportes.alerta_termometro')
              .replace('${{hoy}}', formatearDinero(facturadoHoy))
              .replace('${{promedio}}', formatearDinero(promedioDiarioHistorico))}
          </p>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center items-center h-64"><Loader2 className="animate-spin w-8 h-8 text-indigo-600" /></div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
              <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl"><DollarSign size={24} /></div>
              <div>
                <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider">{t('reportes.ingresos_totales')}</p>
                <p className="text-2xl font-bold text-slate-900">{formatearDinero(totalPeriodo)}</p>
              </div>
            </div>
            
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
              <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl"><TrendingUp size={24} /></div>
              <div>
                <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider">{t('reportes.hoy')}</p>
                <p className="text-2xl font-bold text-slate-900">{formatearDinero(facturadoHoy)}</p>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
              <div className="p-3 bg-slate-50 text-slate-600 rounded-xl"><Calendar size={24} /></div>
              <div>
                <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider">{t('reportes.promedio_diario')}</p>
                <p className="text-2xl font-bold text-slate-900">{formatearDinero(promedioDiarioHistorico)}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            {data.chartData && data.chartData.length > 0 ? (
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.chartData}>
                    <XAxis dataKey="fecha" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                    <YAxis 
                      tick={{ fontSize: 12 }} 
                      stroke="#94a3b8" 
                      tickFormatter={(value) => `$${(value / 1000)}k`}
                    />
                    <Tooltip 
                      cursor={{ fill: '#f1f5f9' }}
                      formatter={(value: any) => [formatearDinero(value), t('reportes.grafico_tooltip')]}
                      labelFormatter={(label) => `Fecha: ${label}`}
                    />
                    <Bar dataKey="total" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 flex flex-col justify-center items-center text-slate-400">
                <BarChart3 className="opacity-20 mb-3" size={48} />
                <p>{t('reportes.sin_datos')}</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default Reportes;
