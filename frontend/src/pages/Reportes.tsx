import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import {
  Calendar, DollarSign, TrendingUp, TrendingDown, AlertTriangle,
  Loader2, BarChart3, Clock, Activity, PieChart as PieChartIcon,
  Receipt, ArrowRight, ExternalLink, Car, Search, X,
  ChevronDown, ChevronUp, Wrench, Package, Link2, Check, Download, FileSpreadsheet, FileText, Printer
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

interface ChartDataItem {
  fecha: string;
  total: number;
  [key: string]: unknown;
}

interface BarChartClickState {
  activePayload?: Array<{ payload?: { fecha?: string; total?: number } }>;
  activeLabel?: string;
  [key: string]: unknown;
}

interface OpPromedioGlobal {
  estado: string;
  promedio: number;
}

interface OpDetalleVehiculo {
  id?: string;
  placa: string;
  tiempos: Record<string, number>;
  totalFacturado?: number | null;
}

const Reportes: React.FC = () => {
  const { t } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  const { empresaSlug, empresaNombre } = useAuth();
  const currentSlug = slug || empresaSlug || '';
  const [searchParams, setSearchParams] = useSearchParams();

  const [activeTab, setActiveTab] = useState<TabType>(() => {
    return searchParams.get('tab') === 'operativo' ? 'operativo' : 'financiero';
  });

  // ── Financiero ──
  const [loading, setLoading] = useState(true);
  const [finanzasError, setFinanzasError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState(() => {
    const paramFiltro = searchParams.get('filtro');
    if (paramFiltro && ['hoy', 'ayer', 'semana', 'mes', 'personalizado'].includes(paramFiltro)) {
      return paramFiltro;
    }
    if (searchParams.get('start') || searchParams.get('end')) {
      return 'personalizado';
    }
    return 'mes';
  });
  const [chartData, setChartData] = useState<ChartDataItem[]>([]);
  const [kpis, setKpis] = useState<FinanzasKpis>({
    facturadoHoy: 0, promedioDiarioHistorico: 0, totalPeriodo: 0,
    totalGastos: 0, utilidadBruta: 0, margenPct: 0,
  });
  const [gastosPorCategoria, setGastosPorCategoria] = useState<GastoPorCategoria[]>([]);

  // ── Operativo ──
  const [opLoading, setOpLoading] = useState(false);
  const [opError, setOpError] = useState<string | null>(null);
  const [opSubView, setOpSubView] = useState<OpSubView>('total');
  const [opData, setOpData] = useState<{
    promediosGlobales: OpPromedioGlobal[];
    detalleVehiculos: OpDetalleVehiculo[];
    resumen: { totalOrdenes: number; ordenesFacturadas: number; facturacionTotal: number; ticketPromedio: number };
  }>({
    promediosGlobales: [],
    detalleVehiculos: [],
    resumen: { totalOrdenes: 0, ordenesFacturadas: 0, facturacionTotal: 0, ticketPromedio: 0 },
  });

  const [customStart, setCustomStart] = useState(() => searchParams.get('start') || '');
  const [customEnd, setCustomEnd] = useState(() => searchParams.get('end') || '');

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

  // ── Acciones de Compartir Link (estilo JIRA) y Exportar ──
  const [copiedModalLink, setCopiedModalLink] = useState(false);
  const [copiedGastosLink, setCopiedGastosLink] = useState(false);
  const [copiedOrdenId, setCopiedOrdenId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const [includePhoneInExport, setIncludePhoneInExport] = useState(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [isGastosExportMenuOpen, setIsGastosExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);
  const gastosExportMenuRef = useRef<HTMLDivElement | null>(null);
  const initialDeepLinkHandledRef = useRef(false);
  const pendingScrollOrdenIdRef = useRef<string | null>(null);

  // ── Drill-down Modal Gastos ──
  const [isGastosModalOpen, setIsGastosModalOpen] = useState(false);
  const [gastosItems, setGastosItems] = useState<GastoItem[]>([]);
  const [isGastosLoading, setIsGastosLoading] = useState(false);
  const [gastosError, setGastosError] = useState<string | null>(null);
  const [gastosSearch, setGastosSearch] = useState('');
  const [gastosSelectedCat, setGastosSelectedCat] = useState('todos');
  const gastosAbortControllerRef = useRef<AbortController | null>(null);

  const showToast = (msg: string) => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    setToastMessage(msg);
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage(null);
    }, 2800);
  };

  const finanzasAbortControllerRef = useRef<AbortController | null>(null);
  const opAbortControllerRef = useRef<AbortController | null>(null);

  const isCustomRangeIncomplete =
    filtro === 'personalizado' && (!customStart || !customEnd);

  const isCustomRangeInvalid =
    filtro === 'personalizado' && Boolean(customStart && customEnd && customStart > customEnd);

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

  // Mantener la URL sincronizada con el estado principal (tab, filtro, customStart, customEnd)
  useEffect(() => {
    if (!initialDeepLinkHandledRef.current) return;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (activeTab === 'operativo') {
        next.set('tab', 'operativo');
      } else {
        next.delete('tab');
      }

      if (filtro !== 'mes') {
        next.set('filtro', filtro);
      } else {
        next.delete('filtro');
      }

      if (filtro === 'personalizado') {
        if (customStart) next.set('start', customStart);
        else next.delete('start');
        if (customEnd) next.set('end', customEnd);
        else next.delete('end');
      } else {
        next.delete('start');
        next.delete('end');
      }
      if (next.toString() === prev.toString()) {
        return prev;
      }
      return next;
    }, { replace: true });
  }, [activeTab, filtro, customStart, customEnd, setSearchParams]);

  useEffect(() => {
    if (filtro === 'personalizado' && (isCustomRangeIncomplete || isCustomRangeInvalid)) return;
    cargarFinanciero();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtro, customStart, customEnd, isCustomRangeIncomplete, isCustomRangeInvalid]);

  useEffect(() => {
    if (activeTab === 'operativo') {
      if (filtro === 'personalizado' && (isCustomRangeIncomplete || isCustomRangeInvalid)) return;
      cargarOperativo();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, filtro, customStart, customEnd, isCustomRangeIncomplete, isCustomRangeInvalid]);

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
    } catch (err: unknown) {
      const error = err as { code?: string; name?: string };
      if (error?.code === 'ERR_CANCELED' || error?.name === 'AbortError' || error?.name === 'CanceledError') return;
      setIngresosError(t('reportes.error_cargar_finanzas', 'No se pudo cargar el detalle de ingresos. Intenta de nuevo.'));
    } finally {
      setIsIngresosLoading(false);
    }
  };

  const abrirModalIngresos = () => {
    if (isCustomRangeInvalid) return;
    const { start, end } = getFechaRango();
    setModalIngresosRango({ start, end, esDiaEspecifico: start === end && filtro !== 'personalizado' });
    setIngresosSearch('');
    setIngresosFiltroTipo('todos');
    setExpandedOrdenId(null);
    pendingScrollOrdenIdRef.current = null;
    setIsIngresosModalOpen(true);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('view', 'ingresos');
      next.delete('dia');
      next.delete('orden');
      next.delete('tipo');
      if (filtro !== 'personalizado') {
        next.delete('start');
        next.delete('end');
      }
      if (next.toString() === prev.toString()) {
        return prev;
      }
      return next;
    }, { replace: true });
    fetchIngresosDetalle(start, end);
  };

  const handleBarClick = (data: {
    fecha?: string;
    total?: number;
    payload?: { fecha?: string; total?: number };
    activePayload?: Array<{ payload?: { fecha?: string; total?: number } }>;
    activeLabel?: string;
  } | null | undefined) => {
    const payloadFromChart = data?.activePayload?.[0]?.payload;
    const item = (payloadFromChart?.fecha ? payloadFromChart : (data?.payload?.fecha ? data.payload : data)) as { fecha?: string; total?: number } | undefined;
    const fecha = item?.fecha || data?.activeLabel;
    if (!item || !item.total || item.total === 0 || !fecha) return;
    setModalIngresosRango({ start: fecha, end: fecha, esDiaEspecifico: true });
    setIngresosSearch('');
    setIngresosFiltroTipo('todos');
    setExpandedOrdenId(null);
    pendingScrollOrdenIdRef.current = null;
    setIsIngresosModalOpen(true);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('view', 'ingresos');
      next.set('dia', fecha);
      next.delete('orden');
      next.delete('tipo');
      if (filtro !== 'personalizado') {
        next.delete('start');
        next.delete('end');
      }
      if (next.toString() === prev.toString()) {
        return prev;
      }
      return next;
    }, { replace: true });
    fetchIngresosDetalle(fecha, fecha, fecha);
  };

  const closeIngresosModal = () => {
    ingresosAbortControllerRef.current?.abort();
    setIsIngresosModalOpen(false);
    setExpandedOrdenId(null);
    setIsExportMenuOpen(false);
    pendingScrollOrdenIdRef.current = null;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('view');
      next.delete('dia');
      next.delete('orden');
      next.delete('tipo');
      next.delete('q');
      if (filtro !== 'personalizado') {
        next.delete('start');
        next.delete('end');
      }
      if (next.toString() === prev.toString()) {
        return prev;
      }
      return next;
    }, { replace: true });
  };

  // ── Drill-down Gastos: fetch de ítems para el período actual ──
  const fetchGastosDetalle = async (startOverride?: string, endOverride?: string) => {
    if (gastosAbortControllerRef.current) gastosAbortControllerRef.current.abort();
    const controller = new AbortController();
    gastosAbortControllerRef.current = controller;

    setGastosItems([]);
    setGastosError(null);
    setIsGastosLoading(true);

    try {
      const range = getFechaRango();
      const s = startOverride || range.start;
      const e = endOverride || range.end;
      const res = await api.get(`/gastos?desde=${s}&hasta=${e}&limit=1000`, {
        signal: controller.signal,
      });
      setGastosItems(res.data.gastos || []);
    } catch (err: unknown) {
      const error = err as { code?: string; name?: string };
      if (error?.code === 'ERR_CANCELED' || error?.name === 'AbortError' || error?.name === 'CanceledError') return;
      setGastosError(t('reportes.error_cargar_finanzas', 'No se pudieron cargar los ítems de gastos. Intenta de nuevo.'));
    } finally {
      setIsGastosLoading(false);
    }
  };

  const abrirModalGastos = () => {
    if (isCustomRangeInvalid) return;
    setGastosSearch('');
    setGastosSelectedCat('todos');
    setIsGastosModalOpen(true);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('view', 'gastos');
      next.delete('dia');
      next.delete('orden');
      next.delete('tipo');
      if (filtro !== 'personalizado') {
        next.delete('start');
        next.delete('end');
      }
      if (next.toString() === prev.toString()) {
        return prev;
      }
      return next;
    }, { replace: true });
    fetchGastosDetalle();
  };

  const closeGastosModal = () => {
    gastosAbortControllerRef.current?.abort();
    setIsGastosModalOpen(false);
    setIsGastosExportMenuOpen(false);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('view');
      next.delete('cat');
      if (filtro !== 'personalizado') {
        next.delete('start');
        next.delete('end');
      }
      if (next.toString() === prev.toString()) {
        return prev;
      }
      return next;
    }, { replace: true });
  };

  // Deep-link inicial: abrir automáticamente el detalle de ingresos o gastos si viene en la URL
  useEffect(() => {
    if (initialDeepLinkHandledRef.current) return;
    initialDeepLinkHandledRef.current = true;

    const viewParam = searchParams.get('view');
    const diaParam = searchParams.get('dia');
    const startParam = searchParams.get('start');
    const endParam = searchParams.get('end');
    const ordenParam = searchParams.get('orden');
    const tipoParam = searchParams.get('tipo');
    const catParam = searchParams.get('cat');

    if (viewParam === 'gastos') {
      if (catParam) setGastosSelectedCat(catParam);
      const range = getFechaRango();
      const s = startParam || range.start;
      const e = endParam || range.end;
      setIsGastosModalOpen(true);
      fetchGastosDetalle(s, e);
      return;
    }

    if (viewParam === 'ingresos' || diaParam || ordenParam) {
      if (tipoParam === 'con_mano_obra' || tipoParam === 'con_repuestos') {
        setIngresosFiltroTipo(tipoParam);
      }
      if (ordenParam) {
        setExpandedOrdenId(ordenParam);
        pendingScrollOrdenIdRef.current = ordenParam;
      }

      if (diaParam) {
        setModalIngresosRango({ start: diaParam, end: diaParam, esDiaEspecifico: true });
        setIsIngresosModalOpen(true);
        fetchIngresosDetalle(diaParam, diaParam, diaParam);
      } else {
        const range = getFechaRango();
        const s = startParam || range.start;
        const e = endParam || range.end;
        setModalIngresosRango({ start: s, end: e, esDiaEspecifico: s === e && filtro !== 'personalizado' });
        setIsIngresosModalOpen(true);
        fetchIngresosDetalle(s, e, s === e ? s : undefined);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scroll automático a la orden expandida SOLO cuando viene por link directo (?orden=...)
  // Soporta tanto vista desktop (orden-row-...) como móvil (orden-card-...)
  useEffect(() => {
    const targetId = pendingScrollOrdenIdRef.current;
    if (!isIngresosLoading && isIngresosModalOpen && targetId && ingresosOrdenes.length > 0) {
      pendingScrollOrdenIdRef.current = null;
      window.requestAnimationFrame(() => {
        const rowEl = document.getElementById(`orden-row-${targetId}`);
        const cardEl = document.getElementById(`orden-card-${targetId}`);
        const visibleEl =
          rowEl && rowEl.offsetParent !== null
            ? rowEl
            : cardEl && cardEl.offsetParent !== null
            ? cardEl
            : rowEl || cardEl;
        if (visibleEl) {
          visibleEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });
    }
  }, [isIngresosLoading, isIngresosModalOpen, ingresosOrdenes]);

  // Cerrar menús de exportación al hacer clic fuera
  useEffect(() => {
    if (!isExportMenuOpen && !isGastosExportMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (isExportMenuOpen && exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setIsExportMenuOpen(false);
      }
      if (isGastosExportMenuOpen && gastosExportMenuRef.current && !gastosExportMenuRef.current.contains(e.target as Node)) {
        setIsGastosExportMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isExportMenuOpen, isGastosExportMenuOpen]);

  // Bloquear el scroll de la página de fondo cuando algún modal esté abierto
  useEffect(() => {
    if (isIngresosModalOpen || isGastosModalOpen) {
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prevOverflow;
      };
    }
  }, [isIngresosModalOpen, isGastosModalOpen]);

  // Cerrar primero el menú de exportación con Esc; si no está abierto, cerrar el modal activo
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isExportMenuOpen) {
          e.stopPropagation();
          setIsExportMenuOpen(false);
          return;
        }
        if (isGastosExportMenuOpen) {
          e.stopPropagation();
          setIsGastosExportMenuOpen(false);
          return;
        }
        if (isIngresosModalOpen) closeIngresosModal();
        if (isGastosModalOpen) closeGastosModal();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExportMenuOpen, isGastosExportMenuOpen, isIngresosModalOpen, isGastosModalOpen, filtro]);

  // Navegación por teclado en menús de exportación
  const handleMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>, closeMenu: () => void) => {
    const items = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
    if (items.length === 0) return;
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIdx = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
      items[nextIdx]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIdx = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
      items[prevIdx]?.focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeMenu();
    }
  };

  // ── Funciones para copiar link directo (estilo JIRA) ──
  const copyTextToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
  };

  const buildIngresosShareUrl = (ordenId?: string) => {
    const url = new URL(window.location.href);
    if (currentSlug) url.pathname = `/${currentSlug}/reportes`;
    url.search = '';
    url.searchParams.set('view', 'ingresos');
    if (modalIngresosRango.esDiaEspecifico && modalIngresosRango.start) {
      url.searchParams.set('dia', modalIngresosRango.start);
      if (filtro !== 'mes') url.searchParams.set('filtro', filtro);
    } else {
      url.searchParams.set('filtro', filtro);
      if (filtro === 'personalizado') {
        if (modalIngresosRango.start) url.searchParams.set('start', modalIngresosRango.start);
        if (modalIngresosRango.end) url.searchParams.set('end', modalIngresosRango.end);
      }
    }
    if (ingresosFiltroTipo !== 'todos') {
      url.searchParams.set('tipo', ingresosFiltroTipo);
    }
    // Solo incluir ordenId cuando se solicita explícitamente desde una fila
    if (ordenId) {
      url.searchParams.set('orden', ordenId);
    }
    return url.toString();
  };

  const buildGastosShareUrl = () => {
    const url = new URL(window.location.href);
    if (currentSlug) url.pathname = `/${currentSlug}/reportes`;
    url.search = '';
    url.searchParams.set('view', 'gastos');
    url.searchParams.set('filtro', filtro);
    if (filtro === 'personalizado') {
      const { start, end } = getFechaRango();
      url.searchParams.set('start', start);
      url.searchParams.set('end', end);
    }
    if (gastosSelectedCat !== 'todos') {
      url.searchParams.set('cat', gastosSelectedCat);
    }
    return url.toString();
  };

  const handleCopyModalLink = async () => {
    const shareUrl = buildIngresosShareUrl();
    await copyTextToClipboard(shareUrl);
    setCopiedModalLink(true);
    showToast(t('reportes.link_copiado', '¡Link copiado!'));
    setTimeout(() => setCopiedModalLink(false), 2200);
  };

  const handleCopyGastosLink = async () => {
    const shareUrl = buildGastosShareUrl();
    await copyTextToClipboard(shareUrl);
    setCopiedGastosLink(true);
    showToast(t('reportes.link_copiado', '¡Link copiado!'));
    setTimeout(() => setCopiedGastosLink(false), 2200);
  };

  const handleCopyOrdenLink = async (orden: OrdenIngresoItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const shareUrl = buildIngresosShareUrl(orden.id);
    await copyTextToClipboard(shareUrl);
    setCopiedOrdenId(orden.id);
    showToast(t('reportes.link_orden_copiado', { placa: orden.placa, defaultValue: `¡Link de la orden ${orden.placa} copiado!` }));
    setTimeout(() => setCopiedOrdenId((prev) => (prev === orden.id ? null : prev)), 2200);
  };

  // ── Helper de Impresión / PDF mediante iframe oculto (o pestaña en móvil) ──
  const printHtmlViaIframe = (htmlContent: string) => {
    const isMobile =
      typeof window !== 'undefined' &&
      (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth < 768);

    if (isMobile) {
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.open();
        printWindow.document.write(htmlContent);
        printWindow.document.close();
        setTimeout(() => {
          try {
            printWindow.focus();
            printWindow.print();
          } catch {
            // si el navegador móvil bloquea print() directo, el reporte queda visible en la pestaña
          }
        }, 500);
        return;
      }
    }
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) {
      document.body.removeChild(iframe);
      return;
    }

    doc.open();
    doc.write(htmlContent);
    doc.close();

    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } finally {
        setTimeout(() => {
          if (document.body.contains(iframe)) {
            document.body.removeChild(iframe);
          }
        }, 2000);
      }
    }, 250);
  };

  // ── Funciones de Exportación Ingresos (Excel XML multipágina, CSV, PDF/Imprimir) ──
  const getExportFileBaseName = (prefix = 'reporte-ingresos') => {
    const slugPart = currentSlug || 'taller';
    const startStr = modalIngresosRango.start || bogotaToday();
    const endStr = modalIngresosRango.end || startStr;
    return startStr === endStr
      ? `${prefix}-${slugPart}-${startStr}`
      : `${prefix}-${slugPart}-${startStr}-a-${endStr}`;
  };

  const escapeHtml = (str: string) =>
    String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');

  const exportToCSV = () => {
    setIsExportMenuOpen(false);
    const sep = ';';
    const headers = [
      t('reportes.col_fecha_entrega', 'Fecha Entrega'),
      t('reportes.op_placa', 'Placa'),
      t('reportes.col_vehiculo', 'Vehículo'),
      t('reportes.col_cliente', 'Cliente'),
      ...(includePhoneInExport ? [t('nuevo_ingreso.telefono_label', 'Teléfono')] : []),
      t('reportes.col_motivo', 'Motivo Visita'),
      `${t('reportes.mano_obra', 'Mano de Obra')} (COP)`,
      `${t('reportes.repuestos', 'Repuestos')} (COP)`,
      `${t('reportes.col_total_facturado', 'Total Facturado')} (COP)`,
      t('reportes.col_cantidad', 'Cantidad Ítems'),
      t('reportes.col_resumen_items', 'Resumen de Ítems'),
    ];

    const escapeCell = (val: unknown) => {
      const s = String(val ?? '').replace(/"/g, '""');
      return `"${s}"`;
    };

    const rows = filteredIngresos.map((o) => {
      const itemsDetalle = (o.items || [])
        .map((it) => `[${it.tipo === 'mano_obra' ? t('reportes.mano_obra_corto', 'M.O.') : t('reportes.repuestos_corto', 'Rep')}] ${it.descripcion} (${it.cantidad} x ${it.precio_unitario} = ${it.total})`)
        .join(' | ');
      return [
        formatearFecha(o.fecha_entrega),
        o.placa || '',
        `${o.marca || ''} ${o.linea || ''}`.trim(),
        o.cliente || '',
        ...(includePhoneInExport ? [o.telefono || ''] : []),
        o.motivo_visita || '',
        Number(o.total_mano_obra || 0),
        Number(o.total_repuestos || 0),
        Number(o.total || 0),
        o.items_count || (o.items ? o.items.length : 0),
        itemsDetalle,
      ].map(escapeCell).join(sep);
    });

    const summaryRow = [
      t('reportes.totales_periodo', 'TOTALES DEL PERÍODO'),
      '',
      '',
      `${filteredIngresos.length} ${filteredIngresos.length === 1 ? t('reportes.orden_singular', 'orden') : t('reportes.orden_plural', 'órdenes')}`,
      ...(includePhoneInExport ? [''] : []),
      '',
      totalFiltradoMO,
      totalFiltradoRep,
      totalFiltradoIngresos,
      '',
      '',
    ].map(escapeCell).join(sep);

    const csvContent = '\uFEFF' + [headers.map(escapeCell).join(sep), ...rows, summaryRow].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${getExportFileBaseName('reporte-ingresos')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportToExcel = async () => {
    setIsExportMenuOpen(false);
    try {
      const XLSX = await import('xlsx');
      const sheetOrdenesName = t('reportes.hoja_ordenes', 'Órdenes');
      const sheetItemsName = t('reportes.hoja_items', 'Ítems Cobrados');

      const ordenHeaders = [
        t('reportes.col_fecha_entrega', 'Fecha Entrega'),
        t('reportes.op_placa', 'Placa'),
        t('reportes.col_vehiculo', 'Vehículo'),
        t('reportes.col_cliente', 'Cliente'),
        ...(includePhoneInExport ? [t('nuevo_ingreso.telefono_label', 'Teléfono')] : []),
        t('reportes.col_motivo', 'Motivo Visita'),
        t('reportes.mano_obra', 'Mano de Obra'),
        t('reportes.repuestos', 'Repuestos'),
        t('reportes.col_total_facturado', 'Total Facturado'),
        t('reportes.col_resumen_items', 'Resumen de Ítems'),
      ];

      const ordenRows = filteredIngresos.map((o) => {
        const itemsSummary = (o.items || [])
          .map((it) => `${it.cantidad}x ${it.descripcion} (${formatearDinero(it.total)})`)
          .join(', ');
        return [
          formatearFecha(o.fecha_entrega),
          o.placa || '',
          `${o.marca || ''} ${o.linea || ''}`.trim(),
          o.cliente || '',
          ...(includePhoneInExport ? [o.telefono || ''] : []),
          o.motivo_visita || '',
          Number(o.total_mano_obra || 0),
          Number(o.total_repuestos || 0),
          Number(o.total || 0),
          itemsSummary,
        ];
      });

      const emptyPrefix = Array.from({ length: includePhoneInExport ? 5 : 4 }).map(() => '');
      const summaryRow = [
        `${t('reportes.totales_periodo', 'TOTALES DEL PERÍODO')} (${filteredIngresos.length})`,
        ...emptyPrefix,
        totalFiltradoMO,
        totalFiltradoRep,
        totalFiltradoIngresos,
        '',
      ];

      const itemsHeaders = [
        t('reportes.col_fecha_entrega', 'Fecha Entrega'),
        t('reportes.op_placa', 'Placa'),
        t('reportes.col_cliente', 'Cliente'),
        t('reportes.col_tipo_item', 'Tipo Ítem'),
        t('reportes.col_descripcion', 'Descripción'),
        t('reportes.col_cantidad', 'Cantidad'),
        t('reportes.col_precio_unitario', 'Precio Unitario'),
        t('reportes.col_subtotal', 'Subtotal'),
      ];

      const itemsRows = filteredIngresos.flatMap((o) =>
        (o.items || []).map((it) => [
          formatearFecha(o.fecha_entrega),
          o.placa || '',
          o.cliente || '',
          it.tipo === 'mano_obra' ? t('reportes.mano_obra', 'Mano de Obra') : t('reportes.repuesto_item', 'Repuesto'),
          it.descripcion || '',
          Number(it.cantidad || 1),
          Number(it.precio_unitario || 0),
          Number(it.total || 0),
        ])
      );

      const wb = XLSX.utils.book_new();
      const wsOrdenes = XLSX.utils.aoa_to_sheet([ordenHeaders, ...ordenRows, summaryRow]);
      const wsItems = XLSX.utils.aoa_to_sheet([itemsHeaders, ...itemsRows]);
      XLSX.utils.book_append_sheet(wb, wsOrdenes, sheetOrdenesName);
      XLSX.utils.book_append_sheet(wb, wsItems, sheetItemsName);
      XLSX.writeFile(wb, `${getExportFileBaseName('reporte-ingresos')}.xlsx`);
    } catch (err) {
      console.error('Error al exportar a Excel:', err);
      showToast(t('reportes.error_exportar_excel', 'No se pudo generar el archivo Excel. Verifica tu conexión e intenta de nuevo.'));
    }
  };

  const exportToPDF = () => {
    setIsExportMenuOpen(false);
    const periodoTexto = modalIngresosRango.start === modalIngresosRango.end
      ? `${t('reportes.fecha_unica_label', 'Fecha')}: ${formatearFecha(modalIngresosRango.start)}`
      : t('reportes.periodo_rango_label', { start: formatearFecha(modalIngresosRango.start), end: formatearFecha(modalIngresosRango.end), defaultValue: `Período: ${formatearFecha(modalIngresosRango.start)} al ${formatearFecha(modalIngresosRango.end)}` });

    const rowsHtml = filteredIngresos.map((o) => {
      const itemsHtml = (o.items || []).map((it) => `
        <div class="item-line">
          <span class="badge ${it.tipo === 'mano_obra' ? 'mo' : 'rep'}">${escapeHtml(it.tipo === 'mano_obra' ? t('reportes.mano_obra_corto', 'M.O.') : t('reportes.repuestos_corto', 'Rep'))}</span>
          <span class="item-desc">${escapeHtml(it.descripcion)}</span>
          <span class="item-meta">${it.cantidad} × ${formatearDinero(it.precio_unitario)}</span>
          <span class="item-total">${formatearDinero(it.total)}</span>
        </div>
      `).join('');

      return `
        <tr>
          <td>${escapeHtml(formatearFecha(o.fecha_entrega))}</td>
          <td>
            <div class="placa">${escapeHtml(o.placa)}</div>
            <div class="sub">${escapeHtml(`${o.marca || ''} ${o.linea || ''}`.trim())}</div>
          </td>
          <td>
            <div class="strong">${escapeHtml(o.cliente)}</div>
            ${includePhoneInExport && o.telefono ? `<div class="sub">${escapeHtml(o.telefono)}</div>` : ''}
            ${o.motivo_visita ? `<div class="sub italic">${escapeHtml(o.motivo_visita)}</div>` : ''}
          </td>
          <td class="num">${formatearDinero(o.total_mano_obra)}</td>
          <td class="num">${formatearDinero(o.total_repuestos)}</td>
          <td class="num total-col">${formatearDinero(o.total)}</td>
        </tr>
        ${itemsHtml ? `
          <tr class="items-row">
            <td colspan="6">
              <div class="items-box">${itemsHtml}</div>
            </td>
          </tr>
        ` : ''}
      `;
    }).join('');

    const html = `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8" />
        <title>${escapeHtml(t('reportes.desglose_ingresos', 'Desglose de Ingresos Facturados'))} - ${escapeHtml(empresaNombre || currentSlug.toUpperCase())}</title>
        <style>
          * { box-sizing: border-box; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #0f172a; margin: 24px; font-size: 12px; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #e2e8f0; padding-bottom: 14px; margin-bottom: 16px; }
          .title { font-size: 20px; font-weight: 800; color: #0f172a; margin: 0 0 4px 0; }
          .subtitle { font-size: 12px; color: #64748b; margin: 0; }
          .kpis { display: flex; gap: 12px; margin-bottom: 18px; }
          .kpi { flex: 1; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 14px; background: #f8fafc; }
          .kpi-label { font-size: 10px; text-transform: uppercase; font-weight: 700; color: #64748b; letter-spacing: 0.04em; }
          .kpi-val { font-size: 16px; font-weight: 800; color: #0f172a; margin-top: 2px; }
          .kpi-val.emerald { color: #047857; }
          .kpi-val.indigo { color: #4338ca; }
          .kpi-val.cyan { color: #0e7490; }
          table { width: 100%; border-collapse: collapse; }
          th { background: #f1f5f9; color: #475569; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; padding: 8px 10px; text-align: left; border-bottom: 2px solid #cbd5e1; }
          td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
          .placa { display: inline-block; background: #fffbeb; border: 1px solid #fde68a; color: #78350f; font-weight: 800; padding: 1px 6px; border-radius: 4px; font-size: 11px; }
          .strong { font-weight: 600; color: #1e293b; }
          .sub { font-size: 10px; color: #64748b; margin-top: 2px; }
          .italic { font-style: italic; }
          .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
          .total-col { font-weight: 700; color: #047857; }
          .items-row td { background: #f8fafc; padding: 4px 10px 10px 24px; border-bottom: 1px solid #cbd5e1; }
          .items-box { display: flex; flex-direction: column; gap: 3px; }
          .item-line { display: flex; align-items: center; gap: 8px; font-size: 11px; color: #334155; }
          .badge { font-size: 9px; font-weight: 700; padding: 1px 5px; border-radius: 3px; text-transform: uppercase; }
          .badge.mo { background: #e0e7ff; color: #3730a3; }
          .badge.rep { background: #cffafe; color: #155e75; }
          .item-desc { flex: 1; }
          .item-meta { color: #64748b; font-size: 10px; }
          .item-total { font-weight: 700; min-width: 75px; text-align: right; }
          tfoot td { background: #f1f5f9; font-weight: 800; border-top: 2px solid #0f172a; padding: 10px; }
          @media print {
            body { margin: 10mm; }
            tr { page-break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1 class="title">${escapeHtml(t('reportes.desglose_ingresos', 'Desglose de Ingresos Facturados'))}</h1>
            <p class="subtitle">${escapeHtml(empresaNombre || currentSlug.toUpperCase())} · ${escapeHtml(periodoTexto)}</p>
          </div>
          <div style="text-align:right">
            <div class="subtitle">${escapeHtml(t('reportes.generado_el', 'Generado'))}: ${new Date().toLocaleString('es-CO')}</div>
          </div>
        </div>

        <div class="kpis">
          <div class="kpi">
            <div class="kpi-label">${escapeHtml(t('reportes.op_total_ordenes', 'Órdenes'))}</div>
            <div class="kpi-val">${filteredIngresos.length}</div>
          </div>
          <div class="kpi">
            <div class="kpi-label">${escapeHtml(t('reportes.mano_obra', 'Mano de Obra'))}</div>
            <div class="kpi-val indigo">${formatearDinero(totalFiltradoMO)}</div>
          </div>
          <div class="kpi">
            <div class="kpi-label">${escapeHtml(t('reportes.repuestos', 'Repuestos'))}</div>
            <div class="kpi-val cyan">${formatearDinero(totalFiltradoRep)}</div>
          </div>
          <div class="kpi">
            <div class="kpi-label">${escapeHtml(t('reportes.col_total_facturado', 'Total Facturado'))}</div>
            <div class="kpi-val emerald">${formatearDinero(totalFiltradoIngresos)}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>${escapeHtml(t('reportes.col_fecha_entrega', 'Fecha Entrega'))}</th>
              <th>${escapeHtml(t('reportes.col_vehiculo', 'Vehículo'))}</th>
              <th>${escapeHtml(t('reportes.col_cliente', 'Cliente'))}</th>
              <th class="num">${escapeHtml(t('reportes.mano_obra', 'Mano de Obra'))}</th>
              <th class="num">${escapeHtml(t('reportes.repuestos', 'Repuestos'))}</th>
              <th class="num">${escapeHtml(t('reportes.col_total_facturado', 'Total Facturado'))}</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="3" class="num">${escapeHtml(t('reportes.totales_periodo', 'TOTALES DEL PERÍODO'))} (${filteredIngresos.length})</td>
              <td class="num">${formatearDinero(totalFiltradoMO)}</td>
              <td class="num">${formatearDinero(totalFiltradoRep)}</td>
              <td class="num total-col">${formatearDinero(totalFiltradoIngresos)}</td>
            </tr>
          </tfoot>
        </table>
      </body>
      </html>
    `;

    printHtmlViaIframe(html);
  };

  // ── Funciones de Exportación para el Modal de Gastos ──
  const getGastosExportBaseName = () => {
    const slugPart = currentSlug || 'taller';
    const { start, end } = getFechaRango();
    return start === end
      ? `reporte-gastos-${slugPart}-${start}`
      : `reporte-gastos-${slugPart}-${start}-a-${end}`;
  };

  const exportGastosToCSV = () => {
    setIsGastosExportMenuOpen(false);
    const sep = ';';
    const headers = [
      t('reportes.col_fecha', 'Fecha'),
      t('reportes.col_categoria', 'Categoría'),
      t('reportes.col_descripcion', 'Descripción'),
      t('reportes.proveedor_label', 'Proveedor'),
      t('reportes.col_vehiculo_orden', 'Vehículo / Orden'),
      `${t('reportes.col_monto', 'Monto')} (COP)`,
    ];

    const escapeCell = (val: unknown) => `"${String(val ?? '').replace(/"/g, '""')}"`;

    const rows = filteredGastos.map((g) => [
      formatearFecha(g.fecha),
      g.taller_categorias_gastos?.nombre || t('reportes.sin_categoria', 'Sin categoría'),
      g.descripcion || '',
      g.proveedor || '',
      g.taller_ingresos?.taller_vehiculos?.placa || '',
      Number(g.monto || 0),
    ].map(escapeCell).join(sep));

    const summaryRow = [
      t('reportes.totales_periodo', 'TOTALES DEL PERÍODO'),
      '',
      `${filteredGastos.length} ${filteredGastos.length === 1 ? t('reportes.item_singular', 'ítem') : t('reportes.item_plural', 'ítems')}`,
      '',
      '',
      totalFiltradoGastos,
    ].map(escapeCell).join(sep);

    const csvContent = '\uFEFF' + [headers.map(escapeCell).join(sep), ...rows, summaryRow].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${getGastosExportBaseName()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportGastosToExcel = async () => {
    setIsGastosExportMenuOpen(false);
    try {
      const XLSX = await import('xlsx');
      const sheetGastosName = t('reportes.hoja_gastos', 'Gastos');
      const headers = [
        t('reportes.col_fecha', 'Fecha'),
        t('reportes.col_categoria', 'Categoría'),
        t('reportes.col_descripcion', 'Descripción'),
        t('reportes.proveedor_label', 'Proveedor'),
        t('reportes.col_vehiculo_orden', 'Vehículo / Orden'),
        t('reportes.col_monto', 'Monto'),
      ];

      const rows = filteredGastos.map((g) => [
        formatearFecha(g.fecha),
        g.taller_categorias_gastos?.nombre || t('reportes.sin_categoria', 'Sin categoría'),
        g.descripcion || '',
        g.proveedor || '',
        g.taller_ingresos?.taller_vehiculos?.placa || '',
        Number(g.monto || 0),
      ]);

      const summaryRow = [
        `${t('reportes.totales_periodo', 'TOTALES DEL PERÍODO')} (${filteredGastos.length})`,
        '',
        '',
        '',
        '',
        totalFiltradoGastos,
      ];

      const wb = XLSX.utils.book_new();
      const wsGastos = XLSX.utils.aoa_to_sheet([headers, ...rows, summaryRow]);
      XLSX.utils.book_append_sheet(wb, wsGastos, sheetGastosName);
      XLSX.writeFile(wb, `${getGastosExportBaseName()}.xlsx`);
    } catch (err) {
      console.error('Error al exportar gastos a Excel:', err);
      showToast(t('reportes.error_exportar_excel', 'No se pudo generar el archivo Excel. Verifica tu conexión e intenta de nuevo.'));
    }
  };

  const exportGastosToPDF = () => {
    setIsGastosExportMenuOpen(false);
    const { start, end } = getFechaRango();
    const periodoTexto = start === end
      ? `${t('reportes.fecha_unica_label', 'Fecha')}: ${formatearFecha(start)}`
      : t('reportes.periodo_rango_label', { start: formatearFecha(start), end: formatearFecha(end), defaultValue: `Período: ${formatearFecha(start)} al ${formatearFecha(end)}` });

    const rowsHtml = filteredGastos.map((g) => `
      <tr>
        <td>${escapeHtml(formatearFecha(g.fecha))}</td>
        <td>${escapeHtml(g.taller_categorias_gastos?.nombre || t('reportes.sin_categoria', 'Sin categoría'))}</td>
        <td>
          <div class="strong">${escapeHtml(g.descripcion)}</div>
          ${g.proveedor ? `<div class="sub">${escapeHtml(t('reportes.proveedor_label', 'Proveedor'))}: ${escapeHtml(g.proveedor)}</div>` : ''}
        </td>
        <td>${g.taller_ingresos?.taller_vehiculos?.placa ? `<span class="placa">${escapeHtml(g.taller_ingresos.taller_vehiculos.placa)}</span>` : '—'}</td>
        <td class="num total-col">${formatearDinero(g.monto)}</td>
      </tr>
    `).join('');

    const html = `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8" />
        <title>${escapeHtml(t('reportes.desglose_gastos', 'Desglose de Ítems de Gastos'))} - ${escapeHtml(empresaNombre || currentSlug.toUpperCase())}</title>
        <style>
          * { box-sizing: border-box; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #0f172a; margin: 24px; font-size: 12px; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #e2e8f0; padding-bottom: 14px; margin-bottom: 16px; }
          .title { font-size: 20px; font-weight: 800; color: #0f172a; margin: 0 0 4px 0; }
          .subtitle { font-size: 12px; color: #64748b; margin: 0; }
          table { width: 100%; border-collapse: collapse; }
          th { background: #f1f5f9; color: #475569; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; padding: 8px 10px; text-align: left; border-bottom: 2px solid #cbd5e1; }
          td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
          .placa { display: inline-block; background: #f1f5f9; border: 1px solid #cbd5e1; color: #334155; font-weight: 800; padding: 1px 6px; border-radius: 4px; font-size: 11px; }
          .strong { font-weight: 600; color: #1e293b; }
          .sub { font-size: 10px; color: #64748b; margin-top: 2px; }
          .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
          .total-col { font-weight: 700; color: #dc2626; }
          tfoot td { background: #f1f5f9; font-weight: 800; border-top: 2px solid #0f172a; padding: 10px; }
          @media print {
            body { margin: 10mm; }
            tr { page-break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1 class="title">${escapeHtml(t('reportes.desglose_gastos', 'Desglose de Ítems de Gastos'))}</h1>
            <p class="subtitle">${escapeHtml(empresaNombre || currentSlug.toUpperCase())} · ${escapeHtml(periodoTexto)}</p>
          </div>
          <div style="text-align:right">
            <div class="subtitle">${escapeHtml(t('reportes.generado_el', 'Generado'))}: ${new Date().toLocaleString('es-CO')}</div>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>${escapeHtml(t('reportes.col_fecha', 'Fecha'))}</th>
              <th>${escapeHtml(t('reportes.col_categoria', 'Categoría'))}</th>
              <th>${escapeHtml(t('reportes.col_descripcion', 'Descripción'))}</th>
              <th>${escapeHtml(t('reportes.col_vehiculo_orden', 'Vehículo / Orden'))}</th>
              <th class="num">${escapeHtml(t('reportes.col_monto', 'Monto'))}</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="4" class="num">${escapeHtml(t('reportes.totales_periodo', 'TOTALES DEL PERÍODO'))} (${filteredGastos.length})</td>
              <td class="num total-col">${formatearDinero(totalFiltradoGastos)}</td>
            </tr>
          </tfoot>
        </table>
      </body>
      </html>
    `;

    printHtmlViaIframe(html);
  };

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

  const formatearDiaMes = (fechaStr: string) => {
    if (!fechaStr) return '';
    try {
      const parts = String(fechaStr).split('-');
      if (parts.length === 3) return `${parts[2]}/${parts[1]}`;
      return String(fechaStr);
    } catch {
      return String(fechaStr);
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

  const sinCatLabel = t('reportes.sin_categoria', 'Sin categoría');
  const categoriasDisponibles = Array.from(
    new Set(gastosItems.map(g => g.taller_categorias_gastos?.nombre || sinCatLabel))
  );

  const filteredGastos = gastosItems.filter((item) => {
    const itemCat = item.taller_categorias_gastos?.nombre || sinCatLabel;
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
    if (finanzasAbortControllerRef.current) {
      finanzasAbortControllerRef.current.abort();
    }
    const controller = new AbortController();
    finanzasAbortControllerRef.current = controller;

    try {
      setLoading(true);
      setFinanzasError(null);
      const { start, end } = getFechaRango();
      const res = await api.get(`/ingresos/reportes/finanzas?start=${start}&end=${end}`, {
        signal: controller.signal,
      });
      setChartData(res.data.chartData || []);
      setKpis(res.data.kpis || {
        facturadoHoy: 0, promedioDiarioHistorico: 0, totalPeriodo: 0,
        totalGastos: 0, utilidadBruta: 0, margenPct: 0,
      });
      setGastosPorCategoria(res.data.gastosPorCategoria || []);
    } catch (err: unknown) {
      const error = err as { code?: string; name?: string };
      if (error?.code === 'ERR_CANCELED' || error?.name === 'AbortError' || error?.name === 'CanceledError') return;
      console.error(err);
      setFinanzasError(t('reportes.error_cargar_finanzas', 'No se pudieron cargar los datos financieros. Verifica tu conexión e intenta de nuevo.'));
    } finally {
      if (finanzasAbortControllerRef.current === controller) {
        setLoading(false);
      }
    }
  };

  const cargarOperativo = async () => {
    if (opAbortControllerRef.current) {
      opAbortControllerRef.current.abort();
    }
    const controller = new AbortController();
    opAbortControllerRef.current = controller;

    try {
      setOpLoading(true);
      setOpError(null);
      const { start, end } = getFechaRango();
      const res = await api.get(`/ingresos/reportes/operaciones?start=${start}&end=${end}`, {
        signal: controller.signal,
      });
      setOpData({
        promediosGlobales: res.data.promediosGlobales ?? [],
        detalleVehiculos: res.data.detalleVehiculos ?? [],
        resumen: res.data.resumen ?? { totalOrdenes: 0, ordenesFacturadas: 0, facturacionTotal: 0, ticketPromedio: 0 },
      });
    } catch (err: unknown) {
      const error = err as { code?: string; name?: string };
      if (error?.code === 'ERR_CANCELED' || error?.name === 'AbortError' || error?.name === 'CanceledError') return;
      console.error(err);
      setOpError(t('reportes.error_cargar_operativo', 'No se pudieron cargar las métricas operativas. Intenta de nuevo.'));
    } finally {
      if (opAbortControllerRef.current === controller) {
        setOpLoading(false);
      }
    }
  };

  const formatearDinero = (monto: number) =>
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(monto);
  const formatearTiempo = (mins: number): string => {
    if (mins < 1) return '<1m';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const formatVerItems = (count: number) =>
    count === 1
      ? t('reportes.ver_items_one', { count, defaultValue: 'Ver 1 ítem' })
      : t('reportes.ver_items_other', { count, defaultValue: `Ver ${count} ítems` });

  const { facturadoHoy, promedioDiarioHistorico, totalPeriodo, totalGastos, utilidadBruta, margenPct } = kpis;
  const horaActual = new Date().getHours();
  const hoyStr = bogotaToday();
  const currentRange = getFechaRango();
  const rangoIncluyeHoy =
    filtro === 'hoy' ||
    filtro === 'semana' ||
    filtro === 'mes' ||
    (filtro === 'personalizado' && currentRange.start <= hoyStr && currentRange.end >= hoyStr);
  const showAlertaTermometro = rangoIncluyeHoy && horaActual >= 15 && facturadoHoy < (promedioDiarioHistorico * 0.6);

  const margenColor = margenPct >= 40 ? 'text-emerald-600' : margenPct >= 20 ? 'text-amber-600' : 'text-red-600';
  const margenBg = margenPct >= 40 ? 'bg-emerald-50' : margenPct >= 20 ? 'bg-amber-50' : 'bg-red-50';
  const filtroBadge = filtro === 'hoy' ? t('reportes.filtro_hoy')
    : filtro === 'ayer' ? t('reportes.filtro_ayer')
    : filtro === 'semana' ? t('reportes.filtro_semana')
    : filtro === 'mes' ? t('reportes.filtro_mes')
    : `${formatearFecha(currentRange.start)} - ${formatearFecha(currentRange.end)}`;

  const renderFiltros = () => (
    <div className="flex flex-col items-end gap-2 w-full md:w-auto">
      <div className="flex flex-col md:flex-row items-end md:items-center gap-3 w-full md:w-auto">
        <div className="flex bg-slate-100 p-1 rounded-xl w-full sm:w-auto overflow-x-auto no-scrollbar scroll-smooth">
          {[
            { id: 'hoy', label: t('reportes.filtro_hoy'), short: t('reportes.filtro_hoy') },
            { id: 'ayer', label: t('reportes.filtro_ayer'), short: t('reportes.filtro_ayer') },
            { id: 'semana', label: t('reportes.filtro_semana'), short: t('reportes.filtro_semana') },
            { id: 'mes', label: t('reportes.filtro_mes'), short: t('reportes.filtro_mes') },
            { id: 'personalizado', label: `📅 ${t('reportes.filtro_rango', 'Personalizado')}`, short: '📅' }
          ].map(opt => (
            <button
              key={opt.id}
              onClick={() => {
                if (opt.id === 'personalizado' && (!customStart || !customEnd)) {
                  const r = getFechaRango();
                  setCustomStart(customStart || r.start);
                  setCustomEnd(customEnd || r.end);
                }
                setFiltro(opt.id);
              }}
              title={opt.label}
              className={`px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-semibold transition whitespace-nowrap ${filtro === opt.id ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <span className="sm:hidden">{opt.short}</span>
              <span className="hidden sm:inline">{opt.label}</span>
            </button>
          ))}
        </div>

        {filtro === 'personalizado' && (
          <div className={`flex items-center gap-2 bg-white border p-2 rounded-xl shadow-sm w-full sm:w-auto ${isCustomRangeInvalid ? 'border-red-300 ring-2 ring-red-100' : 'border-slate-200'}`}>
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-slate-400 uppercase ml-1">{t('reportes.desde')}</span>
              <input
                type="date"
                value={customStart}
                max={customEnd || undefined}
                onChange={e => setCustomStart(e.target.value)}
                className="text-sm outline-none bg-transparent font-medium text-slate-700 px-1"
              />
            </div>
            <div className="w-px h-8 bg-slate-200 mx-1"></div>
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-slate-400 uppercase ml-1">{t('reportes.hasta')}</span>
              <input
                type="date"
                value={customEnd}
                min={customStart || undefined}
                onChange={e => setCustomEnd(e.target.value)}
                className="text-sm outline-none bg-transparent font-medium text-slate-700 px-1"
              />
            </div>
          </div>
        )}
      </div>
      {isCustomRangeInvalid && (
        <p className="text-xs font-semibold text-red-600 flex items-center gap-1">
          <AlertTriangle size={13} />
          <span>{t('reportes.rango_invalido', "La fecha 'Desde' no puede ser posterior a la fecha 'Hasta'.")}</span>
        </p>
      )}
    </div>
  );

  return (
    <>
    {/* Toast flotante para confirmación de link copiado */}
    {toastMessage && (
      <div
        role="status"
        aria-live="polite"
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-xl border border-slate-700 flex items-center gap-2 text-xs sm:text-sm font-semibold animate-in fade-in slide-in-from-bottom-2 duration-150 mb-[env(safe-area-inset-bottom,0px)]"
      >
        <Check size={16} className="text-emerald-400 shrink-0" />
        <span>{toastMessage}</span>
      </div>
    )}

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
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-slate-900">{t('reportes.title')}</h1>
                {loading && (
                  <span className="inline-flex items-center gap-1.5 text-xs text-indigo-600 bg-indigo-50 font-medium px-2.5 py-0.5 rounded-full animate-pulse">
                    <Loader2 size={13} className="animate-spin" />
                    <span>{t('reportes.cargando', 'Actualizando...')}</span>
                  </span>
                )}
              </div>
              <p className="text-slate-500">{t('reportes.subtitle')}</p>
            </div>
            {renderFiltros()}
          </div>

          {showAlertaTermometro && !finanzasError && (
            <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex items-start gap-3 text-amber-800 shadow-sm">
              <AlertTriangle className="mt-0.5 shrink-0" size={20} />
              <p className="text-sm font-medium leading-relaxed">
                {t('reportes.alerta_termometro')
                  .replace('${{hoy}}', formatearDinero(facturadoHoy))
                  .replace('${{promedio}}', formatearDinero(promedioDiarioHistorico))}
              </p>
            </div>
          )}

          {loading && chartData.length === 0 && !finanzasError ? (
            <div className="flex justify-center items-center h-64"><Loader2 className="animate-spin w-8 h-8 text-indigo-600" /></div>
          ) : finanzasError ? (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-8 flex flex-col items-center justify-center text-center gap-3">
              <AlertTriangle className="text-red-500" size={36} />
              <p className="text-sm font-semibold text-red-800">{finanzasError}</p>
              <button
                type="button"
                onClick={cargarFinanciero}
                className="px-4 py-2 text-xs font-semibold bg-red-600 text-white rounded-xl hover:bg-red-700 transition cursor-pointer"
              >
                {t('reportes.reintentar', 'Intentar de nuevo')}
              </button>
            </div>
          ) : (
            <div className={`space-y-6 transition-opacity duration-200 ${loading ? 'opacity-60 pointer-events-none' : ''}`}>
              {/* ── KPI Cards Row 1: Ingresos ── */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-6">
                <div className="bg-white p-3.5 sm:p-6 rounded-xl sm:rounded-2xl border border-indigo-100 shadow-sm flex flex-col justify-between hover:border-indigo-200 transition-colors">
                  <div className="flex items-center gap-2.5 sm:gap-4">
                    <div className="p-2 sm:p-3 bg-indigo-50 text-indigo-600 rounded-lg sm:rounded-xl shrink-0"><DollarSign className="w-5 h-5 sm:w-6 sm:h-6" /></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-[11px] sm:text-sm font-semibold text-slate-500 uppercase tracking-wider truncate">{t('reportes.ingresos_totales')}</p>
                        <span className="hidden xs:inline-block text-[9px] sm:text-[10px] bg-slate-100 text-slate-500 px-1.5 sm:px-2 py-0.5 rounded-full font-medium whitespace-nowrap">
                          {filtroBadge}
                        </span>
                      </div>
                      <p className="text-base sm:text-2xl font-bold text-slate-900 truncate">{formatearDinero(totalPeriodo)}</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={abrirModalIngresos}
                    disabled={isCustomRangeInvalid}
                    className="mt-3 pt-2.5 border-t border-indigo-50 flex items-center justify-between text-xs font-semibold text-indigo-600 hover:text-indigo-700 active:text-indigo-800 transition group cursor-pointer w-full text-left disabled:opacity-50"
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
                <div className="bg-white p-3.5 sm:p-6 rounded-xl sm:rounded-2xl border border-slate-200 shadow-sm flex items-center gap-2.5 sm:gap-4">
                  <div className="p-2 sm:p-3 bg-emerald-50 text-emerald-600 rounded-lg sm:rounded-xl shrink-0"><TrendingUp className="w-5 h-5 sm:w-6 sm:h-6" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="text-[11px] sm:text-sm font-semibold text-slate-500 uppercase tracking-wider truncate">{t('reportes.hoy')}</p>
                      <span className="hidden xs:inline-block text-[9px] sm:text-[10px] bg-emerald-50 text-emerald-700 px-1.5 sm:px-2 py-0.5 rounded-full font-medium whitespace-nowrap">
                        {t('reportes.filtro_hoy')}
                      </span>
                    </div>
                    <p className="text-base sm:text-2xl font-bold text-slate-900 truncate">{formatearDinero(facturadoHoy)}</p>
                  </div>
                </div>
                <div className="bg-white p-3.5 sm:p-6 rounded-xl sm:rounded-2xl border border-slate-200 shadow-sm flex items-center gap-2.5 sm:gap-4 col-span-2 md:col-span-1">
                  <div className="p-2 sm:p-3 bg-slate-50 text-slate-600 rounded-lg sm:rounded-xl shrink-0"><Calendar className="w-5 h-5 sm:w-6 sm:h-6" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] sm:text-sm font-semibold text-slate-500 uppercase tracking-wider truncate">{t('reportes.promedio_diario')}</p>
                    <p className="text-base sm:text-2xl font-bold text-slate-900 truncate">{formatearDinero(promedioDiarioHistorico)}</p>
                  </div>
                </div>
              </div>

              {/* ── KPI Cards Row 2: Rentabilidad ── */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-6">
                <div className="bg-white p-3.5 sm:p-6 rounded-xl sm:rounded-2xl border border-red-100 shadow-sm flex flex-col justify-between hover:border-red-200 transition-colors">
                  <div className="flex items-center gap-2.5 sm:gap-4">
                    <div className="p-2 sm:p-3 bg-red-50 text-red-500 rounded-lg sm:rounded-xl shrink-0"><TrendingDown className="w-5 h-5 sm:w-6 sm:h-6" /></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-[11px] sm:text-sm font-semibold text-slate-500 uppercase tracking-wider truncate">{t('reportes.total_gastos')}</p>
                        <span className="hidden xs:inline-block text-[9px] sm:text-[10px] bg-slate-100 text-slate-500 px-1.5 sm:px-2 py-0.5 rounded-full font-medium whitespace-nowrap">
                          {filtroBadge}
                        </span>
                      </div>
                      <p className="text-base sm:text-2xl font-bold text-red-600 truncate">{formatearDinero(totalGastos)}</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={abrirModalGastos}
                    disabled={isCustomRangeInvalid}
                    className="mt-3 pt-2.5 border-t border-red-50 flex items-center justify-between text-xs font-semibold text-red-600 hover:text-red-700 active:text-red-800 transition group cursor-pointer w-full text-left disabled:opacity-50"
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
                    <div className="flex items-center gap-2 flex-wrap">
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
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider">{t('reportes.margen')}</p>
                      <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-medium whitespace-nowrap">
                        {filtroBadge}
                      </span>
                    </div>
                    <p className={`text-2xl font-bold ${margenColor}`}>{margenPct}%</p>
                    <p className="text-xs text-slate-400">
                      {margenPct >= 40 ? t('reportes.saludable', '✅ Saludable') : margenPct >= 20 ? t('reportes.mejorable', '⚠️ Mejorable') : t('reportes.critico', '🔴 Crítico')}
                    </p>
                  </div>
                </div>
              </div>

              {/* ── Gráficos ── */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Gráfico de barras de ingresos */}
                <div className="lg:col-span-2 min-w-0 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider">{t('reportes.ingresos_periodo')}</h3>
                      {loading && <Loader2 size={13} className="animate-spin text-indigo-600" />}
                    </div>
                    <span className="text-[11px] text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full font-medium">
                      {t('reportes.toca_dia_detalle', '💡 Toca una barra para ver el detalle')}
                    </span>
                  </div>
                  {chartData && chartData.length > 0 ? (
                    (() => {
                      const scrollWidth = chartData.length > 15 ? Math.max(chartData.length * 36, 540) : undefined;
                      return (
                        <div className={`h-64 w-full ${scrollWidth ? 'overflow-x-auto pb-1' : ''}`}>
                          <div style={{ width: scrollWidth ? `${scrollWidth}px` : '100%', minWidth: '100%', height: '100%' }}>
                            <ResponsiveContainer width="100%" height="100%" debounce={50}>
                              <BarChart
                                data={chartData}
                                onClick={(state) => {
                                  const chartState = state as BarChartClickState | null | undefined;
                                  if (chartState?.activePayload && chartState.activePayload.length > 0) {
                                    handleBarClick(chartState);
                                  }
                                }}
                                className="cursor-pointer"
                              >
                                <XAxis dataKey="fecha" tick={{ fontSize: 11 }} stroke="#94a3b8" tickFormatter={formatearDiaMes} />
                                <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" tickFormatter={(v) => `$${(v / 1000)}k`} />
                                <Tooltip
                                  cursor={{ fill: '#e0e7ff', opacity: 0.4 }}
                                  formatter={(v: unknown) => [formatearDinero(Number(v || 0)), t('reportes.grafico_tooltip')]}
                                  labelFormatter={(l) => `${t('reportes.fecha_unica_label', 'Fecha')}: ${formatearFecha(String(l))}`}
                                />
                                <Bar
                                  dataKey="total"
                                  fill="#4f46e5"
                                  radius={[4, 4, 0, 0]}
                                  onClick={(entry) => handleBarClick(entry as unknown as { fecha?: string; total?: number; payload?: { fecha?: string; total?: number } })}
                                  cursor="pointer"
                                />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      );
                    })()
                  ) : (
                    <div className="h-64 flex flex-col justify-center items-center text-slate-400">
                      <BarChart3 className="opacity-20 mb-3" size={48} />
                      <p>{t('reportes.sin_datos')}</p>
                    </div>
                  )}
                </div>

                {/* Gráfico de dona: gastos por categoría */}
                <div className="min-w-0 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                    <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider">{t('reportes.gastos_categoria')}</h3>
                    {loading && <Loader2 size={13} className="animate-spin text-indigo-600" />}
                  </div>
                  {gastosPorCategoria.length > 0 ? (
                    <div className="h-64 w-full">
                      <ResponsiveContainer width="100%" height="100%" debounce={50}>
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
                          <Tooltip formatter={(v: unknown) => formatearDinero(Number(v || 0))} />
                          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 10, paddingTop: 6 }} />
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
            </div>
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

          {opError ? (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-8 flex flex-col items-center justify-center text-center gap-3">
              <AlertTriangle className="text-red-500" size={36} />
              <p className="text-sm font-semibold text-red-800">{opError}</p>
              <button
                type="button"
                onClick={cargarOperativo}
                className="px-4 py-2 text-xs font-semibold bg-red-600 text-white rounded-xl hover:bg-red-700 transition cursor-pointer"
              >
                {t('reportes.reintentar', 'Intentar de nuevo')}
              </button>
            </div>
          ) : (
            <>
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
                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm min-w-0">
                      {opData.promediosGlobales.length > 0 ? (
                        <div className="h-80 w-full">
                          <ResponsiveContainer width="100%" height="100%" debounce={50}>
                            <BarChart data={opData.promediosGlobales} layout="vertical" margin={{ left: 20 }}>
                              <XAxis type="number" tick={{ fontSize: 12 }} stroke="#94a3b8" tickFormatter={(v) => formatearTiempo(v)} />
                              <YAxis
                                type="category"
                                dataKey="estado"
                                tick={{ fontSize: 11 }}
                                stroke="#94a3b8"
                                width={95}
                                tickFormatter={(v) => {
                                  if (v === 'esperando_aprobacion') return 'Esp. Aprobación';
                                  return t(`estado.${v}`) || v;
                                }}
                              />
                              <Tooltip cursor={{ fill: '#f1f5f9' }} formatter={(value: unknown) => [formatearTiempo(Number(value || 0)), t('reportes.op_tiempo_promedio')]} labelFormatter={(label) => t(`estado.${label}`) || label} />
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
                                <th className="sticky left-0 bg-slate-50 z-10 text-left px-4 sm:px-6 py-3 font-semibold text-slate-500 uppercase text-xs tracking-wider shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)]">{t('reportes.op_placa')}</th>
                                {['recepcion', 'diagnostico', 'cotizacion', 'esperando_aprobacion', 'en_reparacion'].map(e => (
                                  <th key={e} className="text-center px-4 py-3 font-semibold text-slate-500 uppercase text-xs tracking-wider">{t(`estado.${e}`)}</th>
                                ))}
                                <th className="text-right px-6 py-3 font-semibold text-slate-500 uppercase text-xs tracking-wider">{t('reportes.op_col_total')}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {opData.detalleVehiculos.map((v, idx) => (
                                <tr key={v.id || v.placa || idx} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition">
                                  <td className="sticky left-0 bg-white group-hover:bg-slate-50 z-10 px-4 sm:px-6 py-3 font-bold text-slate-800 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)]">{v.placa}</td>
                                  {['recepcion', 'diagnostico', 'cotizacion', 'esperando_aprobacion', 'en_reparacion'].map(e => (
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
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-ingresos-title"
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={closeIngresosModal}
        >
          <div
            className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-5xl flex flex-col max-h-[92dvh] sm:max-h-[88vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* ── Header ── */}
            <div className="p-4 sm:p-6 border-b border-slate-100 flex items-start justify-between gap-4 shrink-0 bg-slate-50/70">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider flex items-center gap-1.5">
                    <DollarSign size={14} />
                    {t('reportes.ingresos_totales', 'Ingresos del Período')}
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
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <h2 id="modal-ingresos-title" className="text-lg sm:text-xl font-bold text-slate-900">
                    {modalIngresosRango.esDiaEspecifico
                      ? `${t('reportes.detalle_dia', 'Detalle del día')} · ${formatearFecha(modalIngresosRango.start)}`
                      : t('reportes.desglose_ingresos', 'Desglose de Ingresos Facturados')}
                  </h2>
                  <button
                    type="button"
                    onClick={handleCopyModalLink}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                      copiedModalLink
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-white text-slate-600 border-slate-200 hover:text-indigo-600 hover:border-indigo-200 hover:bg-indigo-50/50'
                    }`}
                    title={t('reportes.copiar_link_vista', 'Copiar link directo a esta vista')}
                  >
                    {copiedModalLink ? <Check size={13} className="text-emerald-600" /> : <Link2 size={13} />}
                    <span>{copiedModalLink ? t('reportes.link_copiado', '¡Link copiado!') : t('reportes.copiar_link', 'Copiar link')}</span>
                  </button>
                </div>
                <p className="text-xs text-slate-500 mt-0.5 font-medium">
                  {modalIngresosRango.start === modalIngresosRango.end
                    ? `${t('reportes.fecha_unica_label', 'Fecha')}: ${formatearFecha(modalIngresosRango.start)}`
                    : `${t('reportes.desde', 'Desde')}: ${formatearFecha(modalIngresosRango.start)} — ${t('reportes.hasta', 'Hasta')}: ${formatearFecha(modalIngresosRango.end)}`}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {/* Botón Exportar con Dropdown accesible */}
                {!isIngresosLoading && !ingresosError && filteredIngresos.length > 0 && (
                  <div className="relative" ref={exportMenuRef}>
                    <button
                      type="button"
                      aria-haspopup="menu"
                      aria-expanded={isExportMenuOpen}
                      onClick={() => setIsExportMenuOpen((prev) => !prev)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 active:bg-indigo-800 shadow-sm transition cursor-pointer"
                      title={t('reportes.exportar_datos', 'Exportar información')}
                    >
                      <Download size={14} />
                      <span className="hidden sm:inline">{t('reportes.exportar', 'Exportar')}</span>
                      <ChevronDown size={13} className={`transition-transform duration-150 ${isExportMenuOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {isExportMenuOpen && (
                      <div
                        role="menu"
                        aria-label={t('reportes.formatos_exportacion', 'Formatos de exportación')}
                        onKeyDown={(e) => handleMenuKeyDown(e, () => setIsExportMenuOpen(false))}
                        className="absolute right-0 mt-2 w-64 bg-white border border-slate-200 rounded-xl shadow-xl py-1.5 z-50"
                      >
                        <div className="px-3 py-1.5 border-b border-slate-100">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            {t('reportes.formatos_exportacion', 'Formatos de exportación')}
                          </p>
                        </div>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={exportToExcel}
                          className="w-full px-3.5 py-2.5 text-left text-xs hover:bg-slate-50 focus:bg-slate-50 focus:outline-none flex items-start gap-2.5 transition cursor-pointer"
                        >
                          <FileSpreadsheet size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                          <div>
                            <p className="font-semibold text-slate-800">{t('reportes.exportar_excel', 'Excel (.xlsx)')}</p>
                            <p className="text-[11px] text-slate-400">{t('reportes.exportar_excel_desc', 'Libro con hojas de Órdenes e Ítems')}</p>
                          </div>
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={exportToCSV}
                          className="w-full px-3.5 py-2.5 text-left text-xs hover:bg-slate-50 focus:bg-slate-50 focus:outline-none flex items-start gap-2.5 transition cursor-pointer"
                        >
                          <FileText size={16} className="text-indigo-600 shrink-0 mt-0.5" />
                          <div>
                            <p className="font-semibold text-slate-800">{t('reportes.exportar_csv', 'CSV (.csv)')}</p>
                            <p className="text-[11px] text-slate-400">{t('reportes.exportar_csv_desc', 'Universal para Google Sheets / BI')}</p>
                          </div>
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={exportToPDF}
                          className="w-full px-3.5 py-2.5 text-left text-xs hover:bg-slate-50 focus:bg-slate-50 focus:outline-none flex items-start gap-2.5 transition cursor-pointer"
                        >
                          <Printer size={16} className="text-rose-600 shrink-0 mt-0.5" />
                          <div>
                            <p className="font-semibold text-slate-800">{t('reportes.exportar_pdf', 'PDF / Imprimir')}</p>
                            <p className="text-[11px] text-slate-400">{t('reportes.exportar_pdf_desc', 'Reporte ejecutivo listo para enviar')}</p>
                          </div>
                        </button>

                        {/* Opción Habeas Data: Teléfono del cliente opt-in */}
                        <div className="mt-1 pt-2 px-3.5 pb-1.5 border-t border-slate-100 bg-slate-50/60">
                          <label className="flex items-start gap-2 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={includePhoneInExport}
                              onChange={(e) => setIncludePhoneInExport(e.target.checked)}
                              className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="text-[11px] leading-tight">
                              <span className="font-semibold text-slate-700 block">{t('reportes.incluir_telefono', 'Incluir teléfono del cliente')}</span>
                              <span className="text-[10px] text-slate-400">{t('reportes.incluir_telefono_hint', 'Dato personal (Ley 1581 Habeas Data)')}</span>
                            </span>
                          </label>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <button
                  onClick={closeIngresosModal}
                  className="w-10 h-10 sm:w-9 sm:h-9 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition shrink-0 cursor-pointer"
                  title={t('reportes.cerrar', 'Cerrar')}
                  aria-label={t('reportes.cerrar', 'Cerrar')}
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* ── Contenedor con scroll (incluye filtros y lista para maximizar espacio vertical) ── */}
            <div className="overflow-y-auto flex-1 flex flex-col">
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
                    className="w-full pl-9 pr-9 py-2 text-base sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
                  />
                  {ingresosSearch && (
                    <button
                      onClick={() => setIngresosSearch('')}
                      className="absolute right-1 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 w-9 h-9 flex items-center justify-center cursor-pointer"
                    >
                      <X size={15} />
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

            {/* ── Contenido / Lista de órdenes ── */}
            <div className="p-4 sm:p-6 flex-1">
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
                  {/* Vista Desktop (Tabla enriquecida con scroll horizontal) */}
                  <div className="hidden sm:block overflow-x-auto border border-slate-200/80 rounded-xl bg-white shadow-sm">
                    <table className="w-full min-w-[680px] text-left text-xs sm:text-sm">
                      <thead>
                        <tr className="bg-slate-50/80 border-b border-slate-200/80 text-slate-500 text-[11px] uppercase tracking-wider font-semibold">
                          <th className="py-2.5 px-3.5 whitespace-nowrap">{t('reportes.col_fecha_entrega', 'Fecha Entrega')}</th>
                          <th className="py-2.5 px-3 whitespace-nowrap">{t('reportes.col_vehiculo', 'Vehículo')}</th>
                          <th className="py-2.5 px-3 whitespace-nowrap">{t('reportes.col_cliente', 'Cliente')}</th>
                          <th className="py-2.5 px-3 whitespace-nowrap">{t('reportes.col_composicion', 'Composición Factura')}</th>
                          <th className="py-2.5 px-3.5 text-right whitespace-nowrap">{t('reportes.col_total_facturado', 'Total Facturado')}</th>
                          <th className="py-2.5 px-3 text-center whitespace-nowrap">{t('reportes.col_acciones', 'Acciones')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredIngresos.map((orden) => {
                          const isExpanded = expandedOrdenId === orden.id;
                          const isOrdenCopied = copiedOrdenId === orden.id;
                          return (
                            <React.Fragment key={orden.id}>
                              <tr
                                id={`orden-row-${orden.id}`}
                                className={`hover:bg-slate-50/70 transition-colors group ${isExpanded ? 'bg-indigo-50/30' : ''}`}
                              >
                                <td className="py-3 px-3.5 text-slate-500 whitespace-nowrap text-xs font-medium">
                                  {formatearFecha(orden.fecha_entrega)}
                                </td>
                                <td className="py-3 px-3 whitespace-nowrap">
                                  <div className="flex items-center gap-1.5">
                                    <Link
                                      to={`/${currentSlug}/historial/${orden.id}`}
                                      onClick={closeIngresosModal}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 text-xs font-bold tracking-wider transition"
                                      title={t('reportes.ver_orden', 'Ver orden')}
                                    >
                                      <Car size={13} className="text-amber-700" />
                                      <span>{orden.placa}</span>
                                    </Link>
                                    <button
                                      type="button"
                                      onClick={(e) => handleCopyOrdenLink(orden, e)}
                                      className={`p-1.5 rounded-lg border transition cursor-pointer ${
                                        isOrdenCopied
                                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                          : 'bg-white text-slate-400 border-slate-200/80 hover:text-indigo-600 hover:border-indigo-200 hover:bg-indigo-50/60'
                                      }`}
                                      title={t('reportes.copiar_link_orden', 'Copiar link directo a este detalle')}
                                      aria-label={t('reportes.copiar_link_orden', 'Copiar link directo a este detalle')}
                                    >
                                      {isOrdenCopied ? <Check size={13} /> : <Link2 size={13} />}
                                    </button>
                                    {(orden.marca || orden.linea) && (
                                      <span className="text-xs text-slate-500 font-medium ml-0.5">
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
                                  <p className="font-semibold text-slate-800 whitespace-nowrap">{orden.cliente}</p>
                                  {orden.telefono && (
                                    <p className="text-[11px] text-slate-400 mt-0.5 whitespace-nowrap">{orden.telefono}</p>
                                  )}
                                </td>
                                <td className="py-3 px-3 whitespace-nowrap">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    {orden.total_mano_obra > 0 && (
                                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded border border-indigo-100">
                                        <Wrench size={10} />
                                        {t('reportes.mano_obra_corto', 'M.O.')}: {formatearDinero(orden.total_mano_obra)}
                                      </span>
                                    )}
                                    {orden.total_repuestos > 0 && (
                                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-cyan-50 text-cyan-800 px-2 py-0.5 rounded border border-cyan-100">
                                        <Package size={10} />
                                        {t('reportes.repuestos_corto', 'Rep')}: {formatearDinero(orden.total_repuestos)}
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
                                        className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg border transition cursor-pointer ${
                                          isExpanded
                                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                                        }`}
                                        title={isExpanded ? t('reportes.ocultar_items', 'Ocultar ítems') : formatVerItems(orden.items.length)}
                                      >
                                        <span>{isExpanded ? t('reportes.ocultar_items', 'Ocultar ítems') : formatVerItems(orden.items.length)}</span>
                                        {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                      </button>
                                    )}
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
                                        <Link
                                          to={`/${currentSlug}/historial/${orden.id}`}
                                          onClick={closeIngresosModal}
                                          className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-semibold normal-case"
                                        >
                                          <span>{t('reportes.ver_orden', 'Ver orden')} ({orden.placa})</span>
                                          <ExternalLink size={12} />
                                        </Link>
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
                                                {it.tipo === 'mano_obra' ? t('reportes.mano_obra_corto', 'M.O.') : t('reportes.repuesto_item', 'Repuesto')}
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
                      const isOrdenCopied = copiedOrdenId === orden.id;
                      return (
                        <div
                          key={orden.id}
                          id={`orden-card-${orden.id}`}
                          className={`p-3.5 bg-slate-50 border rounded-xl space-y-2.5 transition ${
                            isExpanded ? 'border-indigo-300 bg-indigo-50/20' : 'border-slate-100 hover:border-slate-200'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-medium text-slate-400">{formatearFecha(orden.fecha_entrega)}</span>
                            <div className="flex items-center gap-1.5">
                              <Link
                                to={`/${currentSlug}/historial/${orden.id}`}
                                onClick={closeIngresosModal}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold tracking-wider"
                              >
                                <Car size={12} className="text-amber-700" />
                                {orden.placa}
                              </Link>
                              <button
                                type="button"
                                onClick={(e) => handleCopyOrdenLink(orden, e)}
                                className={`p-1 rounded-md border transition ${
                                  isOrdenCopied
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : 'bg-white text-slate-500 border-slate-200'
                                }`}
                                title={t('reportes.copiar_link_orden', 'Copiar link directo a este detalle')}
                                aria-label={t('reportes.copiar_link_orden', 'Copiar link directo a este detalle')}
                              >
                                {isOrdenCopied ? <Check size={12} /> : <Link2 size={12} />}
                              </button>
                            </div>
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
                                  {t('reportes.mano_obra_corto', 'M.O.')}: {formatearDinero(orden.total_mano_obra)}
                                </span>
                              )}
                              {orden.total_repuestos > 0 && (
                                <span className="bg-cyan-50 text-cyan-800 px-1.5 py-0.5 rounded font-medium">
                                  {t('reportes.repuestos_corto', 'Rep')}: {formatearDinero(orden.total_repuestos)}
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
                                <span>{isExpanded ? t('reportes.ocultar_items', 'Ocultar ítems') : formatVerItems(orden.items.length)}</span>
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
            </div>

            {/* ── Footer con total y acciones ── */}
            {!isIngresosLoading && !ingresosError && ingresosOrdenes.length > 0 && (
              <div className="border-t border-slate-100 p-3.5 sm:p-4 sm:px-6 pb-[max(0.85rem,env(safe-area-inset-bottom))] bg-slate-50 sm:rounded-b-2xl flex items-center justify-between gap-3 shrink-0">
                <div className="flex items-center justify-between w-full sm:w-auto sm:gap-3">
                  <span className="text-[11px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider">
                    {ingresosSearch || ingresosFiltroTipo !== 'todos'
                      ? t('reportes.total_filtrado_ingresos', 'Total filtrado:')
                      : t('reportes.total_periodo_ingresos', 'Total facturado período:')}
                  </span>
                  <span className="text-sm sm:text-lg font-bold text-emerald-700">
                    {formatearDinero(totalFiltradoIngresos)}
                  </span>
                </div>

                <div className="hidden sm:flex items-center gap-2">
                  <button
                    onClick={closeIngresosModal}
                    className="px-5 py-2 text-xs font-semibold text-white bg-slate-900 rounded-xl hover:bg-slate-800 transition shadow-sm cursor-pointer"
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
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-gastos-title"
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={closeGastosModal}
        >
          <div
            className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[92dvh] sm:max-h-[85vh] overflow-hidden"
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
                      ({gastosItems.length} {gastosItems.length === 1 ? t('reportes.item_singular', 'ítem') : t('reportes.item_plural', 'ítems')})
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <h2 id="modal-gastos-title" className="text-lg sm:text-xl font-bold text-slate-900">
                    {t('reportes.desglose_gastos', 'Desglose de Ítems de Gastos')}
                  </h2>
                  <button
                    type="button"
                    onClick={handleCopyGastosLink}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                      copiedGastosLink
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-white text-slate-600 border-slate-200 hover:text-red-600 hover:border-red-200 hover:bg-red-50/50'
                    }`}
                    title={t('reportes.copiar_link_vista', 'Copiar link directo a esta vista')}
                  >
                    {copiedGastosLink ? <Check size={13} className="text-emerald-600" /> : <Link2 size={13} />}
                    <span>{copiedGastosLink ? t('reportes.link_copiado', '¡Link copiado!') : t('reportes.copiar_link', 'Copiar link')}</span>
                  </button>
                </div>
                <p className="text-xs text-slate-500 mt-0.5 font-medium">
                  {getFechaRango().start === getFechaRango().end
                    ? `${t('reportes.fecha_unica_label', 'Fecha')}: ${formatearFecha(getFechaRango().start)}`
                    : `${t('reportes.desde', 'Desde')}: ${formatearFecha(getFechaRango().start)} — ${t('reportes.hasta', 'Hasta')}: ${formatearFecha(getFechaRango().end)}`}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {/* Botón Exportar Gastos */}
                {!isGastosLoading && !gastosError && filteredGastos.length > 0 && (
                  <div className="relative" ref={gastosExportMenuRef}>
                    <button
                      type="button"
                      aria-haspopup="menu"
                      aria-expanded={isGastosExportMenuOpen}
                      onClick={() => setIsGastosExportMenuOpen((prev) => !prev)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-red-600 text-white hover:bg-red-700 active:bg-red-800 shadow-sm transition cursor-pointer"
                      title={t('reportes.exportar_datos', 'Exportar información')}
                    >
                      <Download size={14} />
                      <span className="hidden sm:inline">{t('reportes.exportar', 'Exportar')}</span>
                      <ChevronDown size={13} className={`transition-transform duration-150 ${isGastosExportMenuOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {isGastosExportMenuOpen && (
                      <div
                        role="menu"
                        aria-label={t('reportes.formatos_exportacion', 'Formatos de exportación')}
                        onKeyDown={(e) => handleMenuKeyDown(e, () => setIsGastosExportMenuOpen(false))}
                        className="absolute right-0 mt-2 w-60 bg-white border border-slate-200 rounded-xl shadow-xl py-1.5 z-50"
                      >
                        <div className="px-3 py-1.5 border-b border-slate-100">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            {t('reportes.formatos_exportacion', 'Formatos de exportación')}
                          </p>
                        </div>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={exportGastosToExcel}
                          className="w-full px-3.5 py-2.5 text-left text-xs hover:bg-slate-50 focus:bg-slate-50 focus:outline-none flex items-start gap-2.5 transition cursor-pointer"
                        >
                          <FileSpreadsheet size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                          <div>
                            <p className="font-semibold text-slate-800">{t('reportes.exportar_excel', 'Excel (.xlsx)')}</p>
                            <p className="text-[11px] text-slate-400">{t('reportes.exportar_excel_gastos_desc', 'Libro con tabla de gastos del período')}</p>
                          </div>
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={exportGastosToCSV}
                          className="w-full px-3.5 py-2.5 text-left text-xs hover:bg-slate-50 focus:bg-slate-50 focus:outline-none flex items-start gap-2.5 transition cursor-pointer"
                        >
                          <FileText size={16} className="text-indigo-600 shrink-0 mt-0.5" />
                          <div>
                            <p className="font-semibold text-slate-800">{t('reportes.exportar_csv', 'CSV (.csv)')}</p>
                            <p className="text-[11px] text-slate-400">{t('reportes.exportar_csv_desc', 'Universal para Google Sheets / BI')}</p>
                          </div>
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={exportGastosToPDF}
                          className="w-full px-3.5 py-2.5 text-left text-xs hover:bg-slate-50 focus:bg-slate-50 focus:outline-none flex items-start gap-2.5 transition cursor-pointer"
                        >
                          <Printer size={16} className="text-rose-600 shrink-0 mt-0.5" />
                          <div>
                            <p className="font-semibold text-slate-800">{t('reportes.exportar_pdf', 'PDF / Imprimir')}</p>
                            <p className="text-[11px] text-slate-400">{t('reportes.exportar_pdf_desc', 'Reporte ejecutivo listo para enviar')}</p>
                          </div>
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <button
                  onClick={closeGastosModal}
                  className="w-10 h-10 sm:w-9 sm:h-9 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition shrink-0 cursor-pointer"
                  title={t('reportes.cerrar', 'Cerrar')}
                  aria-label={t('reportes.cerrar', 'Cerrar')}
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* ── Contenedor con scroll (incluye filtros y lista para maximizar espacio vertical) ── */}
            <div className="overflow-y-auto flex-1 flex flex-col">
              {/* Aviso si se alcanza el límite de 1000 registros */}
              {!isGastosLoading && !gastosError && gastosItems.length >= 1000 && (
                <div className="mx-4 sm:mx-6 mt-3 p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-xs flex items-center gap-2 shrink-0">
                  <AlertTriangle size={15} className="shrink-0 text-amber-600" />
                  <span>{t('reportes.aviso_limite_gastos', { count: 1000 })}</span>
                </div>
              )}

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
                      className="w-full pl-9 pr-9 py-2 text-base sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition"
                    />
                    {gastosSearch && (
                      <button
                        onClick={() => setGastosSearch('')}
                        className="absolute right-1 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 w-9 h-9 flex items-center justify-center cursor-pointer"
                      >
                        <X size={15} />
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
                        {t('reportes.todos_categorias', 'Todos')}
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

              {/* ── Contenido / Lista de gastos ── */}
              <div className="p-4 sm:p-6 flex-1">
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
                    onClick={() => fetchGastosDetalle()}
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
                  <p className="text-xs text-slate-400 mt-1">{t('reportes.sin_gastos_periodo_desc', 'Los gastos registrados en estas fechas se listarán aquí.')}</p>
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
                    {t('reportes.limpiar_filtros', 'Limpiar filtros')}
                  </button>
                </div>
              )}

              {/* Lista con datos */}
              {!isGastosLoading && !gastosError && filteredGastos.length > 0 && (
                <>
                  {/* Vista Desktop (Tabla completa) */}
                  <div className="hidden sm:block overflow-x-auto border border-slate-200/80 rounded-xl bg-white shadow-sm">
                    <table className="w-full min-w-[600px] text-left text-xs sm:text-sm">
                      <thead>
                        <tr className="bg-slate-50/80 border-b border-slate-200/80 text-slate-500 text-[11px] uppercase tracking-wider font-semibold">
                          <th className="py-2.5 px-3.5">{t('reportes.col_fecha', 'Fecha')}</th>
                          <th className="py-2.5 px-3">{t('reportes.col_categoria', 'Categoría')}</th>
                          <th className="py-2.5 px-3">{t('reportes.col_descripcion', 'Descripción')}</th>
                          <th className="py-2.5 px-3">{t('reportes.col_vehiculo_orden', 'Vehículo / Orden')}</th>
                          <th className="py-2.5 px-3.5 text-right">{t('reportes.col_monto', 'Monto')}</th>
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
                                  {gasto.taller_categorias_gastos?.nombre || sinCatLabel}
                                </span>
                              </td>
                              <td className="py-3 px-3">
                                <p className="font-semibold text-slate-800 line-clamp-2">{gasto.descripcion}</p>
                                {gasto.proveedor && (
                                  <p className="text-[11px] text-slate-400 mt-0.5">
                                    <span className="font-medium">{t('reportes.proveedor_label', 'Proveedor')}:</span> {gasto.proveedor}
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
                              {gasto.taller_categorias_gastos?.nombre || sinCatLabel}
                            </span>
                          </div>

                          <div>
                            <p className="text-sm font-semibold text-slate-800 leading-snug">{gasto.descripcion}</p>
                            {gasto.proveedor && (
                              <p className="text-xs text-slate-500 mt-0.5">
                                <span className="text-slate-400">{t('reportes.proveedor_corto', 'Prov')}:</span> {gasto.proveedor}
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
            </div>

            {/* ── Footer con total y acciones ── */}
            {!isGastosLoading && !gastosError && gastosItems.length > 0 && (
              <div className="border-t border-slate-100 p-3.5 sm:p-4 sm:px-6 pb-[max(0.85rem,env(safe-area-inset-bottom))] bg-slate-50 sm:rounded-b-2xl flex items-center justify-between gap-3 shrink-0">
                <div className="flex items-center justify-between w-full sm:w-auto sm:gap-3">
                  <span className="text-[11px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider">
                    {gastosSearch || gastosSelectedCat !== 'todos'
                      ? t('reportes.total_filtrado_gastos', 'Total filtrado:')
                      : t('reportes.total_periodo_gastos', 'Total período:')}
                  </span>
                  <span className="text-sm sm:text-lg font-bold text-red-600">
                    {formatearDinero(totalFiltradoGastos)}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <Link
                    to={`/${currentSlug}/gastos`}
                    onClick={closeGastosModal}
                    className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-100 transition shadow-sm"
                  >
                    <Receipt size={14} className="text-slate-500" />
                    <span>{t('reportes.ir_a_gastos', 'Ir a Gastos')}</span>
                    <ExternalLink size={12} className="text-slate-400" />
                  </Link>
                  <button
                    onClick={closeGastosModal}
                    className="hidden sm:inline-block px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-xl hover:bg-slate-800 transition shadow-sm cursor-pointer"
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
