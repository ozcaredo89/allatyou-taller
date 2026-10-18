import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import {
  Calendar, DollarSign, TrendingUp, TrendingDown, AlertTriangle,
  Loader2, BarChart3, Clock, Activity, PieChart as PieChartIcon,
  Receipt, ArrowRight, ExternalLink, Car, Search, X,
  ChevronDown, ChevronUp, Wrench, Package
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

interface FacturaItem {
  id?: string;
  tipo?: string;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  total: number;
}

interface OrdenIngresoItem {
  id: string;
  fecha_entrega: string;
  placa: string;
  marca: string;
  linea: string;
  cliente: string;
  telefono?: string;
  motivo_visita?: string;
  total: number;
  total_mano_obra: number;
  total_repuestos: number;
  items_count: number;
  items: FacturaItem[];
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

  // ── Drill-down Modal Ingresos (Período o Día) ──
  const [isIngresosModalOpen, setIsIngresosModalOpen] = useState(false);
  const [ingresosOrdenes, setIngresosOrdenes] = useState<OrdenIngresoItem[]>([]);
  const [isIngresosLoading, setIsIngresosLoading] = useState(false);
  const [ingresosError, setIngresosError] = useState<string | null>(null);
  const [ingresosSearch, setIngresosSearch] = useState('');
  const [ingresosFiltroTipo, setIngresosFiltroTipo] = useState<'todos' | 'con_mano_obra' | 'con_repuestos'>('todos');
  const [expandedOrdenId, setExpandedOrdenId] = useState<string | null>(null);
  const [modalIngresosRango, setModalIngresosRango] = useState<{ start: string; end: string; esDiaEspecifico?: boolean }>({ start: '', end: '' });
  const ingresosAbortControllerRef = useRef<AbortController | null>(null);

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

  // ── Drill-down Ingresos: fetch de órdenes para el período o día actual ──
  const fetchIngresosDetalle = async (start: string, end: string, fechaPuntual?: string) => {
    if (ingresosAbortControllerRef.current) ingresosAbortControllerRef.current.abort();
    const controller = new AbortController();
    ingresosAbortControllerRef.current = controller;

    setIngresosOrdenes([]);
    setIngresosError(null);
    setIsIngresosLoading(true);

    try {
      const query = fechaPuntual ? `fecha=${fechaPuntual}` : `start=${start}&end=${end}`;
      const res = await api.get(`/ingresos/reportes/finanzas/detalle?${query}`, {
        signal: controller.signal,
      });
      setIngresosOrdenes(res.data.ordenes || []);
    } catch (err: any) {
      if (err?.code === 'ERR_CANCELED' || err?.name === 'AbortError' || err?.name === 'CanceledError') return;
      setIngresosError('No se pudo cargar el detalle de ingresos. Intenta de nuevo.');
    } finally {
      setIsIngresosLoading(false);
    }
  };

  const abrirModalIngresos = () => {
    const { start, end } = getFechaRango();
    setModalIngresosRango({ start, end, esDiaEspecifico: start === end });
    setIngresosSearch('');
    setIngresosFiltroTipo('todos');
    setExpandedOrdenId(null);
    setIsIngresosModalOpen(true);
    fetchIngresosDetalle(start, end);
  };

  const handleBarClick = (data: any) => {
    if (!data || !data.total || data.total === 0) return;
    setModalIngresosRango({ start: data.fecha, end: data.fecha, esDiaEspecifico: true });
    setIngresosSearch('');
    setIngresosFiltroTipo('todos');
    setExpandedOrdenId(null);
    setIsIngresosModalOpen(true);
    fetchIngresosDetalle(data.fecha, data.fecha, data.fecha);
  };

  const closeIngresosModal = () => {
    ingresosAbortControllerRef.current?.abort();
    setIsIngresosModalOpen(false);
    setExpandedOrdenId(null);
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
        closeIngresosModal();
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

  const filteredIngresos = ingresosOrdenes.filter((orden) => {
    if (ingresosFiltroTipo === 'con_mano_obra' && orden.total_mano_obra <= 0) return false;
    if (ingresosFiltroTipo === 'con_repuestos' && orden.total_repuestos <= 0) return false;

    if (!ingresosSearch.trim()) return true;
    const q = ingresosSearch.toLowerCase().trim();
    const placa = (orden.placa || '').toLowerCase();
    const cliente = (orden.cliente || '').toLowerCase();
    const vehiculo = `${orden.marca || ''} ${orden.linea || ''}`.toLowerCase();
    const motivo = (orden.motivo_visita || '').toLowerCase();
    const itemsMatch = (orden.items || []).some(it => (it.descripcion || '').toLowerCase().includes(q));

    return placa.includes(q) || cliente.includes(q) || vehiculo.includes(q) || motivo.includes(q) || itemsMatch;
  });

  const totalFiltradoIngresos = filteredIngresos.reduce((acc, o) => acc + Number(o.total || 0), 0);
  const totalFiltradoMO = filteredIngresos.reduce((acc, o) => acc + Number(o.total_mano_obra || 0), 0);
  const totalFiltradoRep = filteredIngresos.reduce((acc, o) => acc + Number(o.total_repuestos || 0), 0);

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
        <div className="flex items-center gap-2 bg-white border border-slate-200 p-2 rounded-xl shadow-sm w-full sm:w-auto">
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
                <div className="bg-white p-6 rounded-2xl border border-indigo-100 shadow-sm flex flex-col justify-between hover:border-indigo-200 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl shrink-0"><DollarSign size={24} /></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider">{t('reportes.ingresos_totales')}</p>
                        <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-medium whitespace-nowrap">
                          {filtroBadge}
                        </span>
                      </div>
                      <p className="text-2xl font-bold text-slate-900">{formatearDinero(totalPeriodo)}</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={abrirModalIngresos}
                    className="mt-3 pt-2.5 border-t border-indigo-50 flex items-center justify-between text-xs font-semibold text-indigo-600 hover:text-indigo-700 active:text-indigo-800 transition group cursor-pointer w-full text-left"
                    title={t('reportes.ver_items_ingresos', 'Ver detalle de ingresos')}
                  >
                    <span className="flex items-center gap-1.5 group-hover:underline underline-offset-2">
                      <DollarSign size={14} className="text-indigo-500 shrink-0" />
                      <span>{t('reportes.ver_items_ingresos', 'Ver detalle de ingresos')}</span>
                    </span>
                    <span className="inline-flex items-center gap-1 text-[11px] bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-lg group-hover:bg-indigo-100 transition-colors shrink-0">
                      <span>{t('reportes.ver_detalle', 'Ver detalle')}</span>
                      <ArrowRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
                    </span>
                  </button>
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
                      <span>{t('reportes.ver_detalle', 'Ver detalle')}</span>
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

      {/* ═══════ MODAL DRILL-DOWN INGRESOS ═══════ */}
      {isIngresosModalOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={closeIngresosModal}
        >
          <div
            className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[92vh] sm:max-h-[88vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* ── Header ── */}
            <div className="p-4 sm:p-6 border-b border-slate-100 flex items-start justify-between gap-4 shrink-0 bg-slate-50/70">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider flex items-center gap-1.5">
                    <DollarSign size={14} />
                    {modalIngresosRango.esDiaEspecifico ? t('reportes.detalle_dia', 'Detalle del día') : t('reportes.ingresos_totales', 'Ingresos Totales')}
                  </span>
                  <span className="text-[10px] bg-indigo-100 text-indigo-700 font-semibold px-2 py-0.5 rounded-full">
                    {modalIngresosRango.esDiaEspecifico ? t('reportes.dia_especifico', 'Día Específico') : filtroBadge}
                  </span>
                  {!isIngresosLoading && !ingresosError && (
                    <span className="text-xs text-slate-500 font-medium">
                      ({ingresosOrdenes.length} {ingresosOrdenes.length === 1 ? t('reportes.orden_singular', 'orden') : t('reportes.orden_plural', 'órdenes')})
                    </span>
                  )}
                </div>
                <h2 className="text-lg sm:text-xl font-bold text-slate-900 mt-1">
                  {modalIngresosRango.esDiaEspecifico
                    ? `${t('reportes.detalle_dia', 'Detalle del día')} - ${formatearFecha(modalIngresosRango.start)}`
                    : t('reportes.desglose_ingresos', 'Desglose de Ingresos Facturados')}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5 font-medium">
                  {modalIngresosRango.start === modalIngresosRango.end
                    ? `${t('reportes.desde', 'Fecha')}: ${formatearFecha(modalIngresosRango.start)}`
                    : `${t('reportes.desde', 'Desde')}: ${formatearFecha(modalIngresosRango.start)} - ${t('reportes.hasta', 'Hasta')}: ${formatearFecha(modalIngresosRango.end)}`}
                </p>
              </div>

              <button
                onClick={closeIngresosModal}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition shrink-0"
                title={t('reportes.cerrar', 'Cerrar')}
                aria-label={t('reportes.cerrar', 'Cerrar')}
              >
                <X size={20} />
              </button>
            </div>

            {/* ── Subheader con métricas rápidas (Mano de obra vs Repuestos) ── */}
            {!isIngresosLoading && !ingresosError && ingresosOrdenes.length > 0 && (
              <div className="px-4 py-2.5 sm:px-6 bg-slate-50/50 border-b border-slate-100 flex flex-wrap items-center gap-3 shrink-0">
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-slate-400 font-medium">{t('reportes.facturado_label', 'Facturado:')}</span>
                  <span className="font-bold text-slate-800">{formatearDinero(totalFiltradoIngresos)}</span>
                </div>
                <div className="h-3 w-px bg-slate-200 hidden sm:block" />
                <div className="flex items-center gap-1.5 text-xs text-indigo-700 bg-indigo-50/80 px-2.5 py-1 rounded-lg">
                  <Wrench size={13} className="text-indigo-600" />
                  <span className="font-medium">{t('reportes.mano_obra', 'Mano de Obra')}:</span>
                  <span className="font-bold">{formatearDinero(totalFiltradoMO)}</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-cyan-800 bg-cyan-50/80 px-2.5 py-1 rounded-lg">
                  <Package size={13} className="text-cyan-600" />
                  <span className="font-medium">{t('reportes.repuestos', 'Repuestos')}:</span>
                  <span className="font-bold">{formatearDinero(totalFiltradoRep)}</span>
                </div>
              </div>
            )}

            {/* ── Filtros y Búsqueda (si hay órdenes) ── */}
            {!isIngresosLoading && !ingresosError && ingresosOrdenes.length > 0 && (
              <div className="px-4 py-3 sm:px-6 bg-white border-b border-slate-100 flex flex-col sm:flex-row gap-2 shrink-0">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input
                    type="text"
                    value={ingresosSearch}
                    onChange={(e) => setIngresosSearch(e.target.value)}
                    placeholder={t('reportes.buscar_ingresos_placeholder', 'Buscar por placa, cliente, vehículo o ítem...')}
                    className="w-full pl-9 pr-8 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
                  />
                  {ingresosSearch && (
                    <button
                      onClick={() => setIngresosSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                <div className="flex gap-1.5 overflow-x-auto pb-1 sm:pb-0 shrink-0">
                  <button
                    onClick={() => setIngresosFiltroTipo('todos')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition whitespace-nowrap ${
                      ingresosFiltroTipo === 'todos'
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {t('reportes.todas', 'Todas')} ({ingresosOrdenes.length})
                  </button>
                  <button
                    onClick={() => setIngresosFiltroTipo('con_mano_obra')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition whitespace-nowrap ${
                      ingresosFiltroTipo === 'con_mano_obra'
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <Wrench size={12} />
                    <span>{t('reportes.con_mano_obra', 'Con M.O.')}</span>
                  </button>
                  <button
                    onClick={() => setIngresosFiltroTipo('con_repuestos')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition whitespace-nowrap ${
                      ingresosFiltroTipo === 'con_repuestos'
                        ? 'bg-cyan-700 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <Package size={12} />
                    <span>{t('reportes.con_repuestos', 'Con Repuestos')}</span>
                  </button>
                </div>
              </div>
            )}

            {/* ── Contenido / Lista ── */}
            <div className="overflow-y-auto flex-1 p-4 sm:p-6">
              {/* Cargando */}
              {isIngresosLoading && (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                  <Loader2 className="animate-spin mb-3 text-indigo-600" size={36} />
                  <p className="text-sm font-medium text-slate-600">{t('reportes.cargando_ingresos', 'Cargando órdenes facturadas...')}</p>
                </div>
              )}

              {/* Error */}
              {ingresosError && !isIngresosLoading && (
                <div className="flex flex-col items-center justify-center py-12 text-red-500 gap-3">
                  <p className="text-sm text-center font-medium">{ingresosError}</p>
                  <button
                    onClick={() => fetchIngresosDetalle(modalIngresosRango.start, modalIngresosRango.end, modalIngresosRango.esDiaEspecifico ? modalIngresosRango.start : undefined)}
                    className="px-4 py-2 text-sm font-semibold bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition"
                  >
                    {t('reportes.reintentar', 'Intentar de nuevo')}
                  </button>
                </div>
              )}

              {/* Vacío general */}
              {!isIngresosLoading && !ingresosError && ingresosOrdenes.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                  <div className="p-4 bg-slate-50 rounded-2xl mb-3">
                    <DollarSign className="opacity-40 text-slate-500" size={40} />
                  </div>
                  <p className="text-sm font-semibold text-slate-600">{t('reportes.sin_ingresos_periodo', 'No hay ingresos facturados en este período')}</p>
                  <p className="text-xs text-slate-400 mt-1">{t('reportes.sin_ingresos_periodo_desc', 'Las órdenes completadas y entregadas aparecerán listadas aquí.')}</p>
                </div>
              )}

              {/* Sin resultados de búsqueda */}
              {!isIngresosLoading && !ingresosError && ingresosOrdenes.length > 0 && filteredIngresos.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                  <Search className="opacity-30 mb-2" size={32} />
                  <p className="text-sm font-semibold text-slate-600">{t('reportes.sin_coincidencias_ingresos', 'No se encontraron órdenes que coincidan con la búsqueda')}</p>
                  <button
                    onClick={() => { setIngresosSearch(''); setIngresosFiltroTipo('todos'); }}
                    className="mt-2 text-xs font-semibold text-indigo-600 hover:underline"
                  >
                    {t('reportes.limpiar_filtros', 'Limpiar filtros')}
                  </button>
                </div>
              )}

              {/* Lista con datos */}
              {!isIngresosLoading && !ingresosError && filteredIngresos.length > 0 && (
                <>
                  {/* Vista Desktop (Tabla enriquecida) */}
                  <div className="hidden sm:block overflow-hidden border border-slate-200/80 rounded-xl bg-white shadow-sm">
                    <table className="w-full text-left text-xs sm:text-sm">
                      <thead>
                        <tr className="bg-slate-50/80 border-b border-slate-200/80 text-slate-500 text-[11px] uppercase tracking-wider font-semibold">
                          <th className="py-2.5 px-3.5">{t('reportes.col_fecha_entrega', 'Fecha Entrega')}</th>
                          <th className="py-2.5 px-3">{t('reportes.col_vehiculo', 'Vehículo')}</th>
                          <th className="py-2.5 px-3">{t('reportes.col_cliente', 'Cliente')}</th>
                          <th className="py-2.5 px-3">{t('reportes.col_composicion', 'Composición Factura')}</th>
                          <th className="py-2.5 px-3.5 text-right">{t('reportes.col_total_facturado', 'Total Facturado')}</th>
                          <th className="py-2.5 px-3 text-center">{t('reportes.col_acciones', 'Acciones')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredIngresos.map((orden) => {
                          const isExpanded = expandedOrdenId === orden.id;
                          return (
                            <React.Fragment key={orden.id}>
                              <tr className={`hover:bg-slate-50/70 transition-colors ${isExpanded ? 'bg-indigo-50/30' : ''}`}>
                                <td className="py-3 px-3.5 text-slate-500 whitespace-nowrap text-xs font-medium">
                                  {formatearFecha(orden.fecha_entrega)}
                                </td>
                                <td className="py-3 px-3 whitespace-nowrap">
                                  <div className="flex items-center gap-2">
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold tracking-wider">
                                      <Car size={13} className="text-amber-700" />
                                      {orden.placa}
                                    </span>
                                    {(orden.marca || orden.linea) && (
                                      <span className="text-xs text-slate-500 font-medium">
                                        {orden.marca} {orden.linea}
                                      </span>
                                    )}
                                  </div>
                                  {orden.motivo_visita && (
                                    <p className="text-[11px] text-slate-400 mt-1 max-w-xs truncate" title={orden.motivo_visita}>
                                      {orden.motivo_visita}
                                    </p>
                                  )}
                                </td>
                                <td className="py-3 px-3">
                                  <p className="font-semibold text-slate-800">{orden.cliente}</p>
                                  {orden.telefono && (
                                    <p className="text-[11px] text-slate-400 mt-0.5">{orden.telefono}</p>
                                  )}
                                </td>
                                <td className="py-3 px-3 whitespace-nowrap">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    {orden.total_mano_obra > 0 && (
                                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded border border-indigo-100">
                                        <Wrench size={10} />
                                        {t('reportes.con_mano_obra', 'M.O.')}: {formatearDinero(orden.total_mano_obra)}
                                      </span>
                                    )}
                                    {orden.total_repuestos > 0 && (
                                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-cyan-50 text-cyan-800 px-2 py-0.5 rounded border border-cyan-100">
                                        <Package size={10} />
                                        {t('reportes.repuestos', 'Rep')}: {formatearDinero(orden.total_repuestos)}
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="py-3 px-3.5 text-right font-bold text-emerald-700 text-sm whitespace-nowrap">
                                  {formatearDinero(orden.total)}
                                </td>
                                <td className="py-3 px-3 text-center whitespace-nowrap">
                                  <div className="flex items-center justify-center gap-1.5">
                                    {orden.items && orden.items.length > 0 && (
                                      <button
                                        type="button"
                                        onClick={() => setExpandedOrdenId(isExpanded ? null : orden.id)}
                                        className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg border transition ${
                                          isExpanded
                                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                                        }`}
                                        title={isExpanded ? t('reportes.ocultar_items', 'Ocultar ítems') : t('reportes.ver_items', { count: orden.items.length })}
                                      >
                                        <span>{isExpanded ? t('reportes.ocultar_items', 'Ocultar ítems') : t('reportes.ver_items', { count: orden.items.length })}</span>
                                        {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                      </button>
                                    )}
                                    <Link
                                      to={`/${currentSlug}/historial/${orden.id}`}
                                      onClick={closeIngresosModal}
                                      className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 border border-transparent hover:border-indigo-100 transition"
                                      title={t('reportes.ver_orden', 'Ver orden')}
                                    >
                                      <ExternalLink size={15} />
                                    </Link>
                                  </div>
                                </td>
                              </tr>

                              {/* Fila desplegada con ítems de la factura */}
                              {isExpanded && orden.items && (
                                <tr>
                                  <td colSpan={6} className="bg-slate-50/90 px-6 py-3.5 border-b border-indigo-100">
                                    <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-2">
                                      <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-100 pb-2">
                                        <span>{t('reportes.detalle_items_cobrados', { count: orden.items.length })}</span>
                                        <span className="text-slate-400 font-normal">{t('reportes.orden_num', { id: orden.id.slice(0, 8) })}</span>
                                      </div>
                                      <div className="divide-y divide-slate-100 text-xs">
                                        {orden.items.map((it, iIdx) => (
                                          <div key={it.id || iIdx} className="py-2 flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-2 min-w-0 flex-1">
                                              <span
                                                className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase shrink-0 ${
                                                  it.tipo === 'mano_obra'
                                                    ? 'bg-indigo-100 text-indigo-700'
                                                    : 'bg-cyan-100 text-cyan-800'
                                                }`}
                                              >
                                                {it.tipo === 'mano_obra' ? t('reportes.con_mano_obra', 'M.O.') : t('reportes.repuesto_item', 'Repuesto')}
                                              </span>
                                              <span className="font-medium text-slate-800 truncate">{it.descripcion}</span>
                                            </div>
                                            <div className="flex items-center gap-4 text-right shrink-0">
                                              <span className="text-slate-400">
                                                {it.cantidad} × {formatearDinero(it.precio_unitario)}
                                              </span>
                                              <span className="font-bold text-slate-800 w-24">
                                                {formatearDinero(it.total)}
                                              </span>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Vista Móvil (Tarjetas táctiles) */}
                  <div className="block sm:hidden space-y-3">
                    {filteredIngresos.map((orden) => {
                      const isExpanded = expandedOrdenId === orden.id;
                      return (
                        <div
                          key={orden.id}
                          className={`p-3.5 bg-slate-50 border rounded-xl space-y-2.5 transition ${
                            isExpanded ? 'border-indigo-300 bg-indigo-50/20' : 'border-slate-100 hover:border-slate-200'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-medium text-slate-400">{formatearFecha(orden.fecha_entrega)}</span>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold tracking-wider">
                              <Car size={12} className="text-amber-700" />
                              {orden.placa}
                            </span>
                          </div>

                          <div>
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-semibold text-slate-800">{orden.cliente}</p>
                              <span className="text-xs font-medium text-slate-500">
                                {orden.marca} {orden.linea}
                              </span>
                            </div>
                            {orden.motivo_visita && (
                              <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{orden.motivo_visita}</p>
                            )}
                          </div>

                          <div className="flex items-center justify-between pt-2 border-t border-slate-200/60">
                            <div className="flex items-center gap-1.5 text-[11px]">
                              {orden.total_mano_obra > 0 && (
                                <span className="bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded font-medium">
                                  {t('reportes.con_mano_obra', 'M.O.')}: {formatearDinero(orden.total_mano_obra)}
                                </span>
                              )}
                              {orden.total_repuestos > 0 && (
                                <span className="bg-cyan-50 text-cyan-800 px-1.5 py-0.5 rounded font-medium">
                                  {t('reportes.repuestos', 'Rep')}: {formatearDinero(orden.total_repuestos)}
                                </span>
                              )}
                            </div>
                            <span className="text-sm font-bold text-emerald-700">
                              {formatearDinero(orden.total)}
                            </span>
                          </div>

                          <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 gap-2">
                            {orden.items && orden.items.length > 0 && (
                              <button
                                type="button"
                                onClick={() => setExpandedOrdenId(isExpanded ? null : orden.id)}
                                className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 py-1"
                              >
                                <span>{isExpanded ? t('reportes.ocultar_items', 'Ocultar ítems') : t('reportes.ver_items', { count: orden.items.length })}</span>
                                {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                              </button>
                            )}
                            <Link
                              to={`/${currentSlug}/historial/${orden.id}`}
                              onClick={closeIngresosModal}
                              className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 px-2.5 py-1 rounded-lg"
                            >
                              <span>{t('reportes.ver_orden', 'Ver orden')}</span>
                              <ExternalLink size={12} />
                            </Link>
                          </div>

                          {/* Lista desplegada mobile */}
                          {isExpanded && orden.items && (
                            <div className="pt-2 border-t border-indigo-100 bg-white p-3 rounded-lg space-y-2 text-xs">
                              <p className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">{t('reportes.detalle_items_cobrados', { count: orden.items.length })}</p>
                              {orden.items.map((it, idx) => (
                                <div key={it.id || idx} className="flex items-start justify-between gap-2 border-b border-slate-50 pb-1.5 last:border-0 last:pb-0">
                                  <div className="min-w-0">
                                    <span className="text-[10px] text-slate-400 block uppercase font-medium">
                                      {it.tipo === 'mano_obra' ? t('reportes.mano_obra', 'Mano de Obra') : t('reportes.repuesto_item', 'Repuesto')}
                                    </span>
                                    <span className="font-medium text-slate-800">{it.descripcion}</span>
                                    <span className="text-[11px] text-slate-400 block">{it.cantidad} × {formatearDinero(it.precio_unitario)}</span>
                                  </div>
                                  <span className="font-bold text-slate-800 shrink-0">{formatearDinero(it.total)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* ── Footer con total y acciones ── */}
            {!isIngresosLoading && !ingresosError && ingresosOrdenes.length > 0 && (
              <div className="border-t border-slate-100 p-4 sm:px-6 bg-slate-50 sm:rounded-b-2xl flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
                <div className="flex items-center justify-between w-full sm:w-auto sm:gap-3">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    {ingresosSearch || ingresosFiltroTipo !== 'todos'
                      ? t('reportes.total_filtrado_ingresos', 'Total filtrado:')
                      : t('reportes.total_periodo_ingresos', 'Total facturado período:')}
                  </span>
                  <span className="text-base sm:text-lg font-bold text-emerald-700">
                    {formatearDinero(totalFiltradoIngresos)}
                  </span>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                  <button
                    onClick={closeIngresosModal}
                    className="flex-1 sm:flex-none px-5 py-2 text-xs font-semibold text-white bg-slate-900 rounded-xl hover:bg-slate-800 transition shadow-sm"
                  >
                    {t('reportes.cerrar', 'Cerrar')}
                  </button>
                </div>
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
            className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[90vh] sm:max-h-[85vh] overflow-hidden"
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
                  <div className="flex gap-1.5 overflow-x-auto pb-1 sm:pb-0 shrink-0">
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
