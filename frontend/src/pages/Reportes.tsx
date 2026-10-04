import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import {
  Calendar, DollarSign, TrendingUp, TrendingDown, AlertTriangle,
  Loader2, BarChart3, Clock, Activity, PieChart as PieChartIcon,
  Receipt, ArrowRight, ExternalLink, Car, Search, X
} from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { getBogotaRange, bogotaToday } from '../utils/dateUtils';

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

interface GastoItem {
  id: string;
  fecha: string;
  descripcion: string;
  monto: number;
  proveedor?: string | null;
  comprobante_url?: string | null;
  tipo?: string;
  notas?: string | null;
  taller_categorias_gastos?: {
    id: string;
    nombre: string;
    color: string;
    icono?: string;
  } | null;
  taller_ingresos?: {
    id: string;
    estado?: string;
    taller_vehiculos?: {
      placa: string;
      marca?: string;
      linea?: string;
    } | null;
  } | null;
}

const Reportes: React.FC = () => {
  const { t } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  const { empresaSlug } = useAuth();
  const currentSlug = slug || empresaSlug || 'eurofrenos';

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
  const [opData, setOpData] = useState<{
    promediosGlobales: any[];
    detalleVehiculos: any[];
    resumen: { totalOrdenes: number; ordenesFacturadas: number; facturacionTotal: number; ticketPromedio: number };
  }>({
    promediosGlobales: [],
    detalleVehiculos: [],
    resumen: { totalOrdenes: 0, ordenesFacturadas: 0, facturacionTotal: 0, ticketPromedio: 0 },
  });

  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  // ── Drill-down Modal Ingresos ──
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<{ placa: string; total: number }[]>([]);
  const [detailTotal, setDetailTotal] = useState(0);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // ── Drill-down Modal Gastos ──
  const [isGastosModalOpen, setIsGastosModalOpen] = useState(false);
  const [gastosItems, setGastosItems] = useState<GastoItem[]>([]);
  const [isGastosLoading, setIsGastosLoading] = useState(false);
  const [gastosError, setGastosError] = useState<string | null>(null);
  const [gastosSearch, setGastosSearch] = useState('');
  const [gastosSelectedCat, setGastosSelectedCat] = useState('todos');
  const gastosAbortControllerRef = useRef<AbortController | null>(null);

  const getFechaRango = (): { start: string; end: string } => {
    if (filtro === 'hoy') {
      const hoy = bogotaToday();
      return { start: hoy, end: hoy };
    }
    if (filtro === 'ayer' || filtro === 'semana' || filtro === 'mes') {
      return getBogotaRange(filtro);
    }
    // personalizado
    const hoy = bogotaToday();
    return {
      start: customStart || hoy,
      end: customEnd || hoy,
    };
  };

  useEffect(() => { cargarFinanciero(); }, [filtro, customStart, customEnd]);
  useEffect(() => { if (activeTab === 'operativo') cargarOperativo(); }, [activeTab, filtro, customStart, customEnd]);

  // ── Drill-down Ingresos: fetch separado para que el retry lo pueda llamar directo ──
  const fetchDetalle = async (fecha: string) => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setDetailData([]);
    setDetailError(null);
    setIsDetailLoading(true);

    try {
      const res = await api.get(`/ingresos/reportes/finanzas/detalle?fecha=${fecha}`, {
        signal: controller.signal,
      });
      setDetailData(res.data.detalle || []);
      setDetailTotal(res.data.totalDia || 0);
    } catch (err: any) {
      if (err?.code === 'ERR_CANCELED' || err?.name === 'AbortError' || err?.name === 'CanceledError') return;
      setDetailError('No se pudo cargar el detalle. Intenta de nuevo.');
    } finally {
      setIsDetailLoading(false);
    }
  };

  const handleBarClick = (data: any) => {
    if (!data || !data.total || data.total === 0) return;
    setSelectedDate(data.fecha);
    fetchDetalle(data.fecha);
  };

  const closeModal = () => {
    abortControllerRef.current?.abort();
    setSelectedDate(null);
  };

  // ── Drill-down Gastos: fetch de ítems para el período actual ──
  const fetchGastosDetalle = async () => {
    if (gastosAbortControllerRef.current) gastosAbortControllerRef.current.abort();
    const controller = new AbortController();
    gastosAbortControllerRef.current = controller;

    setGastosItems([]);
    setGastosError(null);
    setIsGastosLoading(true);

    try {
      const { start, end } = getFechaRango();
      const res = await api.get(`/gastos?desde=${start}&hasta=${end}&limit=1000`, {
        signal: controller.signal,
      });
      setGastosItems(res.data.gastos || []);
    } catch (err: any) {
      if (err?.code === 'ERR_CANCELED' || err?.name === 'AbortError' || err?.name === 'CanceledError') return;
      setGastosError('No se pudieron cargar los ítems de gastos. Intenta de nuevo.');
    } finally {
      setIsGastosLoading(false);
    }
  };

  const abrirModalGastos = () => {
    setGastosSearch('');
    setGastosSelectedCat('todos');
    setIsGastosModalOpen(true);
    fetchGastosDetalle();
  };

  const closeGastosModal = () => {
    gastosAbortControllerRef.current?.abort();
    setIsGastosModalOpen(false);
  };

  // Cerrar modales con Esc
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeModal();
        closeGastosModal();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const formatearFecha = (fechaStr: string) => {
    if (!fechaStr) return '';
    try {
      const parts = fechaStr.split('-');
      if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
      return fechaStr;
    } catch {
      return fechaStr;
    }
  };

  const categoriasDisponibles = Array.from(
    new Set(gastosItems.map(g => g.taller_categorias_gastos?.nombre || 'Sin categoría'))
  );

  const filteredGastos = gastosItems.filter((item) => {
    const itemCat = item.taller_categorias_gastos?.nombre || 'Sin categoría';
    const matchesCat = gastosSelectedCat === 'todos' || itemCat === gastosSelectedCat;
    if (!matchesCat) return false;

    if (!gastosSearch.trim()) return true;
    const q = gastosSearch.toLowerCase().trim();
    const desc = (item.descripcion || '').toLowerCase();
    const prov = (item.proveedor || '').toLowerCase();
    const placa = (item.taller_ingresos?.taller_vehiculos?.placa || '').toLowerCase();
    const cat = itemCat.toLowerCase();
    return desc.includes(q) || prov.includes(q) || placa.includes(q) || cat.includes(q);
  });

  const totalFiltradoGastos = filteredGastos.reduce((acc, item) => acc + Number(item.monto || 0), 0);

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
      setOpData({
        promediosGlobales: res.data.promediosGlobales ?? [],
        detalleVehiculos: res.data.detalleVehiculos ?? [],
        resumen: res.data.resumen ?? { totalOrdenes: 0, ordenesFacturadas: 0, facturacionTotal: 0, ticketPromedio: 0 },
      });
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
  const filtroBadge = filtro === 'hoy' ? t('reportes.filtro_hoy')
    : filtro === 'ayer' ? t('reportes.filtro_ayer')
    : filtro === 'semana' ? t('reportes.filtro_semana')
    : filtro === 'mes' ? t('reportes.filtro_mes')
    : '📅';

  const renderFiltros = () => (
    <div className="flex flex-col md:flex-row items-end md:items-center gap-3 w-full md:w-auto">
      <div className="flex bg-slate-100 p-1 rounded-xl w-full sm:w-auto overflow-x-auto no-scrollbar">
        {[
          { id: 'hoy', label: t('reportes.filtro_hoy') },
          { id: 'ayer', label: t('reportes.filtro_ayer') },
          { id: 'semana', label: t('reportes.filtro_semana') },
          { id: 'mes', label: t('reportes.filtro_mes') },
          { id: 'personalizado', label: '📅' }
        ].map(opt => (
          <button
            key={opt.id}
            onClick={() => setFiltro(opt.id)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition whitespace-nowrap ${filtro === opt.id ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      
      {filtro === 'personalizado' && (
        <div className="flex items-center gap-2 bg-white border border-slate-200 p-2 rounded-xl shadow-sm w-full sm:w-auto animate-in fade-in slide-in-from-right-2">
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-slate-400 uppercase ml-1">{t('reportes.desde')}</span>
            <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="text-sm outline-none bg-transparent font-medium text-slate-700 px-1" />
          </div>
          <div className="w-px h-8 bg-slate-200 mx-1"></div>
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-slate-400 uppercase ml-1">{t('reportes.hasta')}</span>
            <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="text-sm outline-none bg-transparent font-medium text-slate-700 px-1" />
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
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
            {renderFiltros()}
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
                  <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl shrink-0"><DollarSign size={24} /></div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider">{t('reportes.ingresos_totales')}</p>
                      <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-medium whitespace-nowrap">
                        {filtroBadge}
                      </span>
                    </div>
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
                <div className="bg-white p-6 rounded-2xl border border-red-100 shadow-sm flex flex-col justify-between hover:border-red-200 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-red-50 text-red-500 rounded-xl shrink-0"><TrendingDown size={24} /></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider">{t('reportes.total_gastos')}</p>
                        <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-medium whitespace-nowrap">
                          {filtroBadge}
                        </span>
                      </div>
                      <p className="text-2xl font-bold text-red-600">{formatearDinero(totalGastos)}</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={abrirModalGastos}
                    className="mt-3 pt-2.5 border-t border-red-50 flex items-center justify-between text-xs font-semibold text-red-600 hover:text-red-700 active:text-red-800 transition group cursor-pointer w-full text-left"
                    title={t('reportes.ver_items_gastos', 'Ver ítems del gasto')}
                  >
                    <span className="flex items-center gap-1.5 group-hover:underline underline-offset-2">
                      <Receipt size={14} className="text-red-500 shrink-0" />
                      <span>{t('reportes.ver_items_gastos', 'Ver ítems del gasto')}</span>
                    </span>
                    <span className="inline-flex items-center gap-1 text-[11px] bg-red-50 text-red-600 px-2 py-0.5 rounded-lg group-hover:bg-red-100 transition-colors shrink-0">
                      <span>Ver detalle</span>
                      <ArrowRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
                    </span>
                  </button>
                </div>
                <div className={`bg-white p-6 rounded-2xl border shadow-sm flex items-center gap-4 ${utilidadBruta >= 0 ? 'border-emerald-100' : 'border-red-200'}`}>
                  <div className={`p-3 rounded-xl ${utilidadBruta >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                    {utilidadBruta >= 0 ? <TrendingUp size={24} /> : <TrendingDown size={24} />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider">{t('reportes.utilidad_bruta')}</p>
                      <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-medium whitespace-nowrap">
                        {filtroBadge}
                      </span>
                    </div>
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
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider">{t('reportes.margen')}</p>
                      <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-medium whitespace-nowrap">
                        {filtroBadge}
                      </span>
                    </div>
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
                          <Bar dataKey="total" fill="#4f46e5" radius={[4, 4, 0, 0]} onClick={handleBarClick} cursor="pointer" />
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
              {renderFiltros()}
            </div>
          </div>

          {/* ── KPI Cards Operativo ── */}
          <div className={`grid grid-cols-1 md:grid-cols-3 gap-6 transition-opacity duration-200 ${opLoading ? 'opacity-50 pointer-events-none' : ''}`}>
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
              <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl shrink-0"><Activity size={24} /></div>
              <div>
                <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider">{t('reportes.op_total_ordenes')}</p>
                <p className="text-2xl font-bold text-slate-900">{opData.resumen.totalOrdenes}</p>
              </div>
            </div>
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
              <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl shrink-0"><DollarSign size={24} /></div>
              <div>
                <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider">{t('reportes.op_facturacion_total')}</p>
                <p className="text-2xl font-bold text-slate-900">{formatearDinero(opData.resumen.facturacionTotal)}</p>
              </div>
            </div>
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
              <div className="p-3 bg-violet-50 text-violet-600 rounded-xl shrink-0"><TrendingUp size={24} /></div>
              <div>
                <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider">{t('reportes.op_ticket_promedio')}</p>
                <p className="text-2xl font-bold text-slate-900">{formatearDinero(opData.resumen.ticketPromedio)}</p>
                {opData.resumen.totalOrdenes > 0 && (
                  <p className="text-xs text-slate-400 mt-0.5">
                    {t('reportes.op_ticket_subtitulo', {
                      facturadas: opData.resumen.ordenesFacturadas,
                      total: opData.resumen.totalOrdenes,
                    })}
                  </p>
                )}
              </div>
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
                            <th className="text-right px-6 py-3 font-semibold text-slate-500 uppercase text-xs tracking-wider">{t('reportes.op_col_total')}</th>
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
                              <td className="text-right px-6 py-3">
                                {v.totalFacturado !== null && v.totalFacturado !== undefined
                                  ? <span className="font-semibold text-emerald-700">{formatearDinero(v.totalFacturado)}</span>
                                  : <span className="text-slate-300">—</span>
                                }
                              </td>
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

          {/* Nota aclaratoria */}
          <p className="text-xs text-slate-400 text-center">{t('reportes.op_nota_operativo')}</p>
        </>
      )}

    </div>

      {/* ═══════ MODAL DRILL-DOWN ═══════ */}
      {selectedDate && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={closeModal}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col"
            style={{ maxHeight: '80vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-slate-100 shrink-0">
              <div>
                <p className="text-xs font-bold text-indigo-500 uppercase tracking-widest mb-0.5">{t('reportes.detalle_dia')}</p>
                <h2 className="text-xl font-bold text-slate-900">{selectedDate}</h2>
              </div>
              <button
                onClick={closeModal}
                className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition"
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1 p-6">
              {isDetailLoading && (
                <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                  <Loader2 className="animate-spin mb-3" size={32} />
                  <p className="text-sm">{t('reportes.cargando_detalle')}</p>
                </div>
              )}

              {detailError && !isDetailLoading && (
                <div className="flex flex-col items-center justify-center py-12 text-red-400 gap-3">
                  <p className="text-sm text-center">{detailError}</p>
                  <button
                    onClick={() => selectedDate && fetchDetalle(selectedDate)}
                    className="px-4 py-2 text-sm font-semibold bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition"
                  >
                    {t('reportes.reintentar')}
                  </button>
                </div>
              )}

              {!isDetailLoading && !detailError && detailData.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                  <BarChart3 className="opacity-20 mb-3" size={40} />
                  <p className="text-sm">{t('reportes.sin_datos_dia')}</p>
                </div>
              )}

              {!isDetailLoading && !detailError && detailData.length > 0 && (
                <ul className="space-y-2">
                  {detailData.map((item, idx) => (
                    <li
                      key={idx}
                      className="flex items-center justify-between py-3 px-4 rounded-xl bg-slate-50 hover:bg-indigo-50 transition group"
                    >
                      <span className="font-bold text-slate-700 tracking-wider group-hover:text-indigo-700 transition">
                        {item.placa}
                      </span>
                      <span className="text-sm font-semibold text-indigo-600">
                        {formatearDinero(item.total)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Footer con total */}
            {!isDetailLoading && !detailError && detailData.length > 0 && (
              <div className="border-t border-slate-100 px-6 py-4 flex items-center justify-between shrink-0 bg-slate-50 rounded-b-2xl">
                <span className="text-sm font-bold text-slate-500 uppercase tracking-wider">{t('reportes.total_dia')}</span>
                <span className="text-lg font-bold text-indigo-700">
                  {formatearDinero(detailTotal)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════ MODAL DRILL-DOWN GASTOS ═══════ */}
      {isGastosModalOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={closeGastosModal}
        >
          <div
            className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[90vh] sm:max-h-[85vh] animate-in fade-in slide-in-from-bottom-4 sm:slide-in-from-bottom-2 duration-200 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* ── Header ── */}
            <div className="p-4 sm:p-6 border-b border-slate-100 flex items-start justify-between gap-4 shrink-0 bg-slate-50/70">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-red-600 uppercase tracking-wider flex items-center gap-1.5">
                    <Receipt size={14} />
                    {t('reportes.total_gastos')}
                  </span>
                  <span className="text-[10px] bg-red-100 text-red-700 font-semibold px-2 py-0.5 rounded-full">
                    {filtroBadge}
                  </span>
                  {!isGastosLoading && !gastosError && (
                    <span className="text-xs text-slate-500 font-medium">
                      ({gastosItems.length} {gastosItems.length === 1 ? 'ítem' : 'ítems'})
                    </span>
                  )}
                </div>
                <h2 className="text-lg sm:text-xl font-bold text-slate-900 mt-1">
                  {t('reportes.desglose_gastos', 'Desglose de Ítems de Gastos')}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5 font-medium">
                  {getFechaRango().start === getFechaRango().end
                    ? `Fecha: ${formatearFecha(getFechaRango().start)}`
                    : `Período: ${formatearFecha(getFechaRango().start)} al ${formatearFecha(getFechaRango().end)}`}
                </p>
              </div>

              <button
                onClick={closeGastosModal}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition shrink-0"
                title={t('reportes.cerrar', 'Cerrar')}
                aria-label={t('reportes.cerrar', 'Cerrar')}
              >
                <X size={20} />
              </button>
            </div>

            {/* ── Filtros y Búsqueda (si hay ítems) ── */}
            {!isGastosLoading && !gastosError && gastosItems.length > 0 && (
              <div className="px-4 py-3 sm:px-6 bg-white border-b border-slate-100 flex flex-col sm:flex-row gap-2 shrink-0">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input
                    type="text"
                    value={gastosSearch}
                    onChange={(e) => setGastosSearch(e.target.value)}
                    placeholder={t('reportes.buscar_gastos_placeholder', 'Buscar por descripción, proveedor o placa...')}
                    className="w-full pl-9 pr-8 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition"
                  />
                  {gastosSearch && (
                    <button
                      onClick={() => setGastosSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                {categoriasDisponibles.length > 1 && (
                  <div className="flex gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none shrink-0">
                    <button
                      onClick={() => setGastosSelectedCat('todos')}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition whitespace-nowrap ${
                        gastosSelectedCat === 'todos'
                          ? 'bg-slate-900 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      Todos
                    </button>
                    {categoriasDisponibles.map(cat => (
                      <button
                        key={cat}
                        onClick={() => setGastosSelectedCat(cat)}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition whitespace-nowrap ${
                          gastosSelectedCat === cat
                            ? 'bg-red-600 text-white shadow-sm'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Contenido / Lista ── */}
            <div className="overflow-y-auto flex-1 p-4 sm:p-6">
              {/* Cargando */}
              {isGastosLoading && (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                  <Loader2 className="animate-spin mb-3 text-red-500" size={36} />
                  <p className="text-sm font-medium text-slate-600">{t('reportes.cargando_gastos', 'Cargando ítems de gastos...')}</p>
                </div>
              )}

              {/* Error */}
              {gastosError && !isGastosLoading && (
                <div className="flex flex-col items-center justify-center py-12 text-red-500 gap-3">
                  <p className="text-sm text-center font-medium">{gastosError}</p>
                  <button
                    onClick={fetchGastosDetalle}
                    className="px-4 py-2 text-sm font-semibold bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition"
                  >
                    {t('reportes.reintentar', 'Intentar de nuevo')}
                  </button>
                </div>
              )}

              {/* Vacío general */}
              {!isGastosLoading && !gastosError && gastosItems.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                  <div className="p-4 bg-slate-50 rounded-2xl mb-3">
                    <Receipt className="opacity-40 text-slate-500" size={40} />
                  </div>
                  <p className="text-sm font-semibold text-slate-600">{t('reportes.sin_gastos_periodo', 'No hay gastos registrados en este período')}</p>
                  <p className="text-xs text-slate-400 mt-1">Los gastos registrados en estas fechas se listarán aquí.</p>
                </div>
              )}

              {/* Sin resultados de búsqueda */}
              {!isGastosLoading && !gastosError && gastosItems.length > 0 && filteredGastos.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                  <Search className="opacity-30 mb-2" size={32} />
                  <p className="text-sm font-semibold text-slate-600">{t('reportes.sin_coincidencias_gastos', 'No se encontraron gastos que coincidan con la búsqueda')}</p>
                  <button
                    onClick={() => { setGastosSearch(''); setGastosSelectedCat('todos'); }}
                    className="mt-2 text-xs font-semibold text-red-600 hover:underline"
                  >
                    Limpiar filtros
                  </button>
                </div>
              )}

              {/* Lista con datos */}
              {!isGastosLoading && !gastosError && filteredGastos.length > 0 && (
                <>
                  {/* Vista Desktop (Tabla completa) */}
                  <div className="hidden sm:block overflow-hidden border border-slate-200/80 rounded-xl bg-white shadow-sm">
                    <table className="w-full text-left text-xs sm:text-sm">
                      <thead>
                        <tr className="bg-slate-50/80 border-b border-slate-200/80 text-slate-500 text-[11px] uppercase tracking-wider font-semibold">
                          <th className="py-2.5 px-3.5">Fecha</th>
                          <th className="py-2.5 px-3">Categoría</th>
                          <th className="py-2.5 px-3">Descripción</th>
                          <th className="py-2.5 px-3">Vehículo / Orden</th>
                          <th className="py-2.5 px-3.5 text-right">Monto</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredGastos.map((gasto) => {
                          const catColor = gasto.taller_categorias_gastos?.color || '#6366f1';
                          const placa = gasto.taller_ingresos?.taller_vehiculos?.placa;
                          return (
                            <tr key={gasto.id} className="hover:bg-slate-50/70 transition-colors">
                              <td className="py-3 px-3.5 text-slate-500 whitespace-nowrap text-xs font-medium">
                                {formatearFecha(gasto.fecha)}
                              </td>
                              <td className="py-3 px-3 whitespace-nowrap">
                                <span
                                  className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
                                  style={{
                                    backgroundColor: `${catColor}18`,
                                    color: catColor,
                                  }}
                                >
                                  {gasto.taller_categorias_gastos?.nombre || 'Sin categoría'}
                                </span>
                              </td>
                              <td className="py-3 px-3">
                                <p className="font-semibold text-slate-800 line-clamp-2">{gasto.descripcion}</p>
                                {gasto.proveedor && (
                                  <p className="text-[11px] text-slate-400 mt-0.5">
                                    <span className="font-medium">Proveedor:</span> {gasto.proveedor}
                                  </p>
                                )}
                              </td>
                              <td className="py-3 px-3 whitespace-nowrap">
                                {placa ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold tracking-wider">
                                    <Car size={12} className="text-indigo-600" />
                                    {placa}
                                  </span>
                                ) : (
                                  <span className="text-slate-300 text-xs">—</span>
                                )}
                              </td>
                              <td className="py-3 px-3.5 text-right font-bold text-red-600 whitespace-nowrap">
                                {formatearDinero(gasto.monto)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Vista Móvil (Tarjetas táctiles) */}
                  <div className="block sm:hidden space-y-2.5">
                    {filteredGastos.map((gasto) => {
                      const catColor = gasto.taller_categorias_gastos?.color || '#6366f1';
                      const placa = gasto.taller_ingresos?.taller_vehiculos?.placa;
                      return (
                        <div
                          key={gasto.id}
                          className="p-3 bg-slate-50 border border-slate-100 rounded-xl space-y-2 hover:border-slate-200 transition"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-medium text-slate-400">{formatearFecha(gasto.fecha)}</span>
                            <span
                              className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold"
                              style={{
                                backgroundColor: `${catColor}18`,
                                color: catColor,
                              }}
                            >
                              {gasto.taller_categorias_gastos?.nombre || 'Sin categoría'}
                            </span>
                          </div>

                          <div>
                            <p className="text-sm font-semibold text-slate-800 leading-snug">{gasto.descripcion}</p>
                            {gasto.proveedor && (
                              <p className="text-xs text-slate-500 mt-0.5">
                                <span className="text-slate-400">Prov:</span> {gasto.proveedor}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center justify-between pt-1.5 border-t border-slate-200/60">
                            {placa ? (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-700 text-[11px] font-bold tracking-wider">
                                <Car size={11} className="text-indigo-600" />
                                {placa}
                              </span>
                            ) : (
                              <span />
                            )}
                            <span className="text-sm font-bold text-red-600">
                              {formatearDinero(gasto.monto)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* ── Footer con total y acciones ── */}
            {!isGastosLoading && !gastosError && gastosItems.length > 0 && (
              <div className="border-t border-slate-100 p-4 sm:px-6 bg-slate-50 sm:rounded-b-2xl flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
                <div className="flex items-center justify-between w-full sm:w-auto sm:gap-3">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    {gastosSearch || gastosSelectedCat !== 'todos'
                      ? t('reportes.total_filtrado_gastos', 'Total filtrado:')
                      : t('reportes.total_periodo_gastos', 'Total período:')}
                  </span>
                  <span className="text-base sm:text-lg font-bold text-red-600">
                    {formatearDinero(totalFiltradoGastos)}
                  </span>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                  <Link
                    to={`/${currentSlug}/gastos`}
                    onClick={closeGastosModal}
                    className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-100 transition shadow-sm"
                  >
                    <Receipt size={14} className="text-slate-500" />
                    <span>{t('reportes.ir_a_gastos', 'Ir a Gastos')}</span>
                    <ExternalLink size={12} className="text-slate-400" />
                  </Link>
                  <button
                    onClick={closeGastosModal}
                    className="flex-1 sm:flex-none px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-xl hover:bg-slate-800 transition shadow-sm"
                  >
                    {t('reportes.cerrar', 'Cerrar')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default Reportes;
