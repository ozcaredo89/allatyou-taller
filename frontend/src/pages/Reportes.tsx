import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import {
  Calendar, DollarSign, TrendingUp, TrendingDown, AlertTriangle,
  Loader2, BarChart3, Clock, Activity, PieChart as PieChartIcon
} from 'lucide-react';
import api from '../services/api';

type TabType = 'financiero' | 'operativo';
type OpSubView = 'total' | 'detalle';

interface FinanzasKpis {
  facturadoHoy: number;
  promedioDiarioHistorico: number;
  totalPeriodo: number;
  totalGastos: number;
  utilidadBruta: number;
  margenPct: number;
}

interface GastoPorCategoria {
  nombre: string;
  color: string;
  total: number;
}

const Reportes: React.FC = () => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabType>('financiero');

  // ── Financiero ──
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState('mes');
  const [chartData, setChartData] = useState<any[]>([]);
  const [kpis, setKpis] = useState<FinanzasKpis>({
    facturadoHoy: 0, promedioDiarioHistorico: 0, totalPeriodo: 0,
    totalGastos: 0, utilidadBruta: 0, margenPct: 0,
  });
  const [gastosPorCategoria, setGastosPorCategoria] = useState<GastoPorCategoria[]>([]);

  // ── Operativo ──
  const [opLoading, setOpLoading] = useState(false);
  const [opSubView, setOpSubView] = useState<OpSubView>('total');
  const [opData, setOpData] = useState<{ promediosGlobales: any[]; detalleVehiculos: any[] }>({ promediosGlobales: [], detalleVehiculos: [] });

  useEffect(() => { cargarFinanciero(); }, [filtro]);
  useEffect(() => { if (activeTab === 'operativo') cargarOperativo(); }, [activeTab, filtro]);

  const getFechaRango = () => {
    const hoy = new Date();
    const end = hoy.toISOString().split('T')[0];
    let start = end;
    if (filtro === 'semana') {
      const d = new Date(); d.setDate(hoy.getDate() - 6);
      start = d.toISOString().split('T')[0];
    } else if (filtro === 'mes') {
      const d = new Date(); d.setDate(hoy.getDate() - 29);
      start = d.toISOString().split('T')[0];
    }
    return { start, end };
  };

  const cargarFinanciero = async () => {
    try {
      setLoading(true);
      const { start, end } = getFechaRango();
      const res = await api.get(`/ingresos/reportes/finanzas?start=${start}&end=${end}`);
      setChartData(res.data.chartData || []);
      setKpis(res.data.kpis || {});
      setGastosPorCategoria(res.data.gastosPorCategoria || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const cargarOperativo = async () => {
    try {
      setOpLoading(true);
      const { start, end } = getFechaRango();
      const res = await api.get(`/ingresos/reportes/operaciones?start=${start}&end=${end}`);
      setOpData(res.data);
    } catch (err) { console.error(err); }
    finally { setOpLoading(false); }
  };

  const formatearDinero = (monto: number) =>
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(monto);
  const formatearTiempo = (mins: number): string => {
    if (mins < 1) return '<1m';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const { facturadoHoy, promedioDiarioHistorico, totalPeriodo, totalGastos, utilidadBruta, margenPct } = kpis;
  const horaActual = new Date().getHours();
  const showAlertaTermometro = horaActual >= 15 && facturadoHoy < (promedioDiarioHistorico * 0.6);

  const margenColor = margenPct >= 40 ? 'text-emerald-600' : margenPct >= 20 ? 'text-amber-600' : 'text-red-600';
  const margenBg = margenPct >= 40 ? 'bg-emerald-50' : margenPct >= 20 ? 'bg-amber-50' : 'bg-red-50';

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      {/* Tabs */}
      <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab('financiero')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition ${activeTab === 'financiero' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          <DollarSign size={16} /> {t('reportes.tab_financiero')}
        </button>
        <button
          onClick={() => setActiveTab('operativo')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition ${activeTab === 'operativo' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          <Activity size={16} /> {t('reportes.tab_operativo')}
        </button>
      </div>

      {/* ═══════ TAB FINANCIERO ═══════ */}
      {activeTab === 'financiero' && (
        <>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{t('reportes.title')}</h1>
              <p className="text-slate-500">{t('reportes.subtitle')}</p>
            </div>
            <select
              value={filtro} onChange={(e) => setFiltro(e.target.value)}
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
              {/* ── KPI Cards Row 1: Ingresos ── */}
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

              {/* ── KPI Cards Row 2: Rentabilidad ── */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-2xl border border-red-100 shadow-sm flex items-center gap-4">
                  <div className="p-3 bg-red-50 text-red-500 rounded-xl"><TrendingDown size={24} /></div>
                  <div>
                    <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider">{t('reportes.total_gastos')}</p>
                    <p className="text-2xl font-bold text-red-600">{formatearDinero(totalGastos)}</p>
                  </div>
                </div>
                <div className={`bg-white p-6 rounded-2xl border shadow-sm flex items-center gap-4 ${utilidadBruta >= 0 ? 'border-emerald-100' : 'border-red-200'}`}>
                  <div className={`p-3 rounded-xl ${utilidadBruta >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                    {utilidadBruta >= 0 ? <TrendingUp size={24} /> : <TrendingDown size={24} />}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider">{t('reportes.utilidad_bruta')}</p>
                    <p className={`text-2xl font-bold ${utilidadBruta >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                      {formatearDinero(utilidadBruta)}
                    </p>
                  </div>
                </div>
                <div className={`p-6 rounded-2xl border shadow-sm flex items-center gap-4 ${margenBg} ${margenPct >= 40 ? 'border-emerald-200' : margenPct >= 20 ? 'border-amber-200' : 'border-red-200'}`}>
                  <div className={`p-3 rounded-xl bg-white ${margenColor}`}>
                    <PieChartIcon size={24} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider">{t('reportes.margen')}</p>
                    <p className={`text-2xl font-bold ${margenColor}`}>{margenPct}%</p>
                    <p className="text-xs text-slate-400">
                      {margenPct >= 40 ? '✅ Saludable' : margenPct >= 20 ? '⚠️ Mejorable' : '🔴 Crítico'}
                    </p>
                  </div>
                </div>
              </div>

              {/* ── Gráficos ── */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Gráfico de barras de ingresos */}
                <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4">{t('reportes.ingresos_periodo')}</h3>
                  {chartData && chartData.length > 0 ? (
                    <div className="h-64 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData}>
                          <XAxis dataKey="fecha" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                          <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" tickFormatter={(v) => `$${(v / 1000)}k`} />
                          <Tooltip cursor={{ fill: '#f1f5f9' }} formatter={(v: any) => [formatearDinero(v), t('reportes.grafico_tooltip')]} labelFormatter={(l) => `Fecha: ${l}`} />
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

                {/* Gráfico de dona: gastos por categoría */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4">{t('reportes.gastos_categoria')}</h3>
                  {gastosPorCategoria.length > 0 ? (
                    <div className="h-64 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={gastosPorCategoria}
                            dataKey="total"
                            nameKey="nombre"
                            cx="50%"
                            cy="45%"
                            outerRadius={75}
                            innerRadius={40}
                          >
                            {gastosPorCategoria.map((entry, idx) => (
                              <Cell key={idx} fill={entry.color || '#6366f1'} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(v: any) => formatearDinero(v)} />
                          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="h-64 flex flex-col justify-center items-center text-slate-400">
                      <PieChartIcon className="opacity-20 mb-3" size={48} />
                      <p className="text-sm text-center">{t('reportes.sin_gastos')}</p>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* ═══════ TAB OPERATIVO ═══════ */}
      {activeTab === 'operativo' && (
        <>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{t('reportes.op_title')}</h1>
              <p className="text-slate-500">{t('reportes.op_subtitle')}</p>
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg w-full sm:w-auto">
                <button
                  onClick={() => setOpSubView('total')}
                  className={`flex-1 sm:flex-none px-4 py-2 rounded-md text-xs font-bold transition ${opSubView === 'total' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'}`}
                >{t('reportes.op_total')}</button>
                <button
                  onClick={() => setOpSubView('detalle')}
                  className={`flex-1 sm:flex-none px-4 py-2 rounded-md text-xs font-bold transition ${opSubView === 'detalle' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'}`}
                >{t('reportes.op_detalle')}</button>
              </div>
              <select
                value={filtro} onChange={(e) => setFiltro(e.target.value)}
                className="border border-slate-200 bg-white rounded-lg px-4 py-2 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none w-full sm:w-48"
              >
                <option value="hoy">{t('reportes.filtro_hoy')}</option>
                <option value="semana">{t('reportes.filtro_semana')}</option>
                <option value="mes">{t('reportes.filtro_mes')}</option>
              </select>
            </div>
          </div>

          {opLoading ? (
            <div className="flex justify-center items-center h-64"><Loader2 className="animate-spin w-8 h-8 text-indigo-600" /></div>
          ) : (
            <>
              {opSubView === 'total' && (
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  {opData.promediosGlobales.length > 0 ? (
                    <div className="h-80 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={opData.promediosGlobales} layout="vertical" margin={{ left: 20 }}>
                          <XAxis type="number" tick={{ fontSize: 12 }} stroke="#94a3b8" tickFormatter={(v) => formatearTiempo(v)} />
                          <YAxis type="category" dataKey="estado" tick={{ fontSize: 12 }} stroke="#94a3b8" width={120} tickFormatter={(v) => t(`estado.${v}`) || v} />
                          <Tooltip cursor={{ fill: '#f1f5f9' }} formatter={(value: any) => [formatearTiempo(value), t('reportes.op_tiempo_promedio')]} labelFormatter={(label) => t(`estado.${label}`) || label} />
                          <Bar dataKey="promedio" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="h-64 flex flex-col justify-center items-center text-slate-400">
                      <Clock className="opacity-20 mb-3" size={48} />
                      <p>{t('reportes.sin_datos')}</p>
                    </div>
                  )}
                </div>
              )}

              {opSubView === 'detalle' && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  {opData.detalleVehiculos.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="text-left px-6 py-3 font-semibold text-slate-500 uppercase text-xs tracking-wider">{t('reportes.op_placa')}</th>
                            {['recepcion', 'diagnostico', 'en_reparacion', 'cotizacion'].map(e => (
                              <th key={e} className="text-center px-4 py-3 font-semibold text-slate-500 uppercase text-xs tracking-wider">{t(`estado.${e}`)}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {opData.detalleVehiculos.map((v: any, idx: number) => (
                            <tr key={idx} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition">
                              <td className="px-6 py-3 font-bold text-slate-800">{v.placa}</td>
                              {['recepcion', 'diagnostico', 'en_reparacion', 'cotizacion'].map(e => (
                                <td key={e} className="text-center px-4 py-3 text-slate-600">
                                  {v.tiempos[e] ? formatearTiempo(v.tiempos[e]) : '—'}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="h-64 flex flex-col justify-center items-center text-slate-400">
                      <Clock className="opacity-20 mb-3" size={48} />
                      <p>{t('reportes.sin_datos')}</p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
};

export default Reportes;
