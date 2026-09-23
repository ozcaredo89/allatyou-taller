import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Plus, Trash2, Loader2, Receipt, AlertCircle, Check, X,
  Repeat, Upload, Tag, CalendarClock, Car, Package, Search,
  ChevronDown, ChevronRight, AlertTriangle, FileText
} from 'lucide-react';
import api from '../services/api';
import { getBogotaRange, bogotaToday } from '../utils/dateUtils';
import EditorLineasGasto, { type BatchFila, crearNuevaFila } from '../components/EditorLineasGasto';
import ModalVincularMasivo from '../components/ModalVincularMasivo';

// ─── Tipos ───────────────────────────────────────────────────────────────────
interface Categoria {
  id: string;
  nombre: string;
  color: string;
  icono: string;
  es_default: boolean;
}

interface Gasto {
  id: string;
  fecha: string;
  descripcion: string;
  monto: number;
  proveedor?: string;
  comprobante_url?: string;
  tipo: 'unico' | 'recurrente';
  notas?: string;
  ingreso_id?: string;
  item_id?: string;
  taller_categorias_gastos?: Categoria;
  taller_ingresos?: {
    id: string;
    estado: string;
    fecha_ingreso: string;
    taller_vehiculos?: {
      placa: string;
      marca?: string;
      linea?: string;
    };
  };
}

interface Recurrente {
  id: string;
  nombre: string;
  monto_estimado: number;
  frecuencia: string;
  activa: boolean;
  ultimo_registro?: string;
  proxima_fecha?: string;
  taller_categorias_gastos?: Categoria;
}

const FRECUENCIA_VALUES = ['diario', 'semanal', 'quincenal', 'mensual', 'anual'];

const formatearDinero = (monto: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(monto);

const formatearMonto = (v: string) => {
  const d = v.replace(/\D/g, '');
  if (!d) return '';
  return parseInt(d, 10).toLocaleString('es-CO');
};

// ─── Componente Principal ─────────────────────────────────────────────────────
const Gastos: React.FC = () => {
  const { t } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  // ── Estado principal ──
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [pendientes, setPendientes] = useState<Recurrente[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // ── Filtros ──
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [filtroPreset, setFiltroPreset] = useState<'30dias' | 'este_mes' | 'todos' | 'personalizado'>('30dias');
  const [filtroDesde, setFiltroDesde] = useState(() => getBogotaRange('mes').start);
  const [filtroHasta, setFiltroHasta] = useState(() => getBogotaRange('mes').end);
  const [totalMonto, setTotalMonto] = useState(0);

  // ── Modal nuevo gasto ──
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState<'unico' | 'recurrente'>('unico');
  const [saving, setSaving] = useState(false);

  // Campos del formulario (gasto único)
  const [form, setForm] = useState({
    fecha: bogotaToday(),
    categoria_id: '',
    descripcion: '',
    monto: '',
    proveedor: '',
    notas: '',
    comprobante_url: '',
    ingreso_id: '',
    item_id: '',
  });

  // Estado para autocompletar placa y vincular a orden
  const [searchPlaca, setSearchPlaca] = useState('');
  const [buscandoPlacas, setBuscandoPlacas] = useState(false);
  const [ordenesSugeridas, setOrdenesSugeridas] = useState<any[]>([]);
  const [ordenSeleccionada, setOrdenSeleccionada] = useState<any | null>(null);
  const debounceTimerRef = useRef<any>(null);
  const searchPlacaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchPlacaRef.current && !searchPlacaRef.current.contains(e.target as Node)) {
        setOrdenesSugeridas([]);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Campos del formulario (recurrente)
  const [formRec, setFormRec] = useState({
    nombre: '',
    categoria_id: '',
    monto_estimado: '',
    frecuencia: 'mensual',
    dia_del_mes: '',
    fecha_inicio: bogotaToday(),
    notas: '',
  });

  // ── Upload de comprobante ──
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  // ── Modal de confirmación de recurrente pendiente ──
  const [confirmRecurrente, setConfirmRecurrente] = useState<Recurrente | null>(null);
  const [montoConfirm, setMontoConfirm] = useState('');

  // ── Estado Modo Factura (Batch / Multilínea) ──
  const [modalMode, setModalMode] = useState<'unico' | 'batch'>('unico');
  const [currentLoteId, setCurrentLoteId] = useState<string>(() => crypto.randomUUID());

  // Cabecera compartida del lote (fecha, proveedor, comprobante, total factura)
  const [batchHeader, setBatchHeader] = useState({
    fecha: bogotaToday(),
    proveedor: '',
    comprobante_url: '',
    total_factura: '',     // para conciliar diferencia
    categoria_id: '',
    notas: '',
  });

  const [batchFilas, setBatchFilas] = useState<BatchFila[]>([crearNuevaFila()]);
  const [batchUploading, setBatchUploading] = useState(false);
  const batchFileRef = useRef<HTMLInputElement>(null);

  // Diálogo de confirmación de duplicados (409)
  const [duplicadosModal, setDuplicadosModal] = useState<{
    pendingLoteId: string;
    pendingFilas: any[];
    duplicados: any[];
  } | null>(null);

  // Toggle de sección de vehículo en modo único (acordeón plegable)
  const [mostrarVehiculo, setMostrarVehiculo] = useState(false);

  // ── Estado Selección Masiva (Fase 2) ──
  const [seleccionados, setSeleccionados] = useState<Map<string, Gasto>>(new Map());
  const [modalMasivoOpen, setModalMasivoOpen] = useState(false);

  // ── Inicialización ──
  useEffect(() => {
    cargarTodo();
  }, []);

  useEffect(() => {
    cargarGastos();
  }, [filtroCategoria, filtroDesde, filtroHasta]);

  const cargarTodo = async () => {
    setLoading(true);
    try {
      const [catRes, pendRes] = await Promise.all([
        api.get('/gastos/categorias').catch(() => ({ data: [] })),
        api.get('/gastos/recurrentes/pendientes').catch(() => ({ data: [] })),
      ]);
      // Si no hay categorías, inicializar las por defecto
      if (catRes.data.length === 0) {
        await api.post('/gastos/categorias/inicializar').catch(() => null);
        const catRes2 = await api.get('/gastos/categorias').catch(() => ({ data: [] }));
        setCategorias(catRes2.data || []);
      } else {
        setCategorias(catRes.data || []);
      }
      setPendientes(pendRes.data || []);
      await cargarGastos();
    } catch (err: any) {
      setError('Error cargando datos. ' + (err?.response?.data?.error || ''));
    } finally {
      setLoading(false);
    }
  };

  const cargarGastos = async () => {
    try {
      const params = new URLSearchParams();
      if (filtroCategoria) params.set('categoria_id', filtroCategoria);
      if (filtroDesde) params.set('desde', filtroDesde);
      if (filtroHasta) params.set('hasta', filtroHasta);
      const res = await api.get(`/gastos?${params.toString()}`);
      setGastos(res.data.gastos || []);
      setTotalMonto(
        res.data.totalMonto !== undefined
          ? Number(res.data.totalMonto)
          : (res.data.gastos || []).reduce((acc: number, g: any) => acc + Number(g.monto || 0), 0)
      );
    } catch (err) {
      console.error(err);
    }
  };

  const aplicarPreset = (preset: '30dias' | 'este_mes' | 'todos') => {
    setFiltroPreset(preset);
    if (preset === '30dias') {
      const { start, end } = getBogotaRange('mes');
      setFiltroDesde(start);
      setFiltroHasta(end);
    } else if (preset === 'este_mes') {
      const hoy = bogotaToday();
      const [y, m] = hoy.split('-');
      setFiltroDesde(`${y}-${m}-01`);
      setFiltroHasta(hoy);
    } else if (preset === 'todos') {
      setFiltroDesde('');
      setFiltroHasta('');
    }
  };

  // ── Upload comprobante ──
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploading(true);
      const fd = new FormData();
      fd.append('archivo', file);
      const res = await api.post('/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setForm(f => ({ ...f, comprobante_url: res.data.url }));
    } catch {
      setError('Error subiendo comprobante.');
    } finally {
      setUploading(false);
    }
  };

  // ── Manejadores de autocompletado por placa ──
  const handleSearchPlacaChange = (val: string) => {
    const formatted = val.toUpperCase();
    setSearchPlaca(formatted);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    const clean = formatted.replace(/[^A-Z0-9]/g, '');
    if (clean.length < 2) {
      setOrdenesSugeridas([]);
      setBuscandoPlacas(false);
      return;
    }

    setBuscandoPlacas(true);
    debounceTimerRef.current = setTimeout(async () => {
      try {
        const res = await api.get(`/ingresos/buscar?q=${encodeURIComponent(clean)}`);
        setOrdenesSugeridas(res.data || []);
      } catch (err) {
        console.error(err);
        setOrdenesSugeridas([]);
      } finally {
        setBuscandoPlacas(false);
      }
    }, 300);
  };

  const seleccionarOrden = (orden: any) => {
    setOrdenSeleccionada(orden);
    setOrdenesSugeridas([]);
    setSearchPlaca('');
    setForm(f => {
      let catId = f.categoria_id;
      if (!catId) {
        const repCat = categorias.find(c => c.nombre.toLowerCase().includes('repuesto'));
        if (repCat) catId = repCat.id;
      }
      return {
        ...f,
        ingreso_id: orden.id,
        item_id: '',
        categoria_id: catId
      };
    });
  };

  const quitarOrdenSeleccionada = () => {
    setOrdenSeleccionada(null);
    setForm(f => ({ ...f, ingreso_id: '', item_id: '' }));
  };

  const handleSeleccionarItemOrden = (itemId: string) => {
    setForm(f => {
      const selectedItem = ordenSeleccionada?.items_repuesto?.find((i: any) => i.id === itemId);
      let desc = f.descripcion;
      if (selectedItem && (!desc || desc.startsWith('Compra '))) {
        desc = `Compra ${selectedItem.descripcion}`;
      }
      let catId = f.categoria_id;
      if (!catId) {
        const repCat = categorias.find(c => c.nombre.toLowerCase().includes('repuesto'));
        if (repCat) catId = repCat.id;
      }
      return {
        ...f,
        item_id: itemId,
        descripcion: desc,
        categoria_id: catId
      };
    });
  };

  // ── Guardar gasto único ──
  const handleGuardar = async () => {
    if (!form.descripcion.trim()) { setError(t('gastos.error_descripcion')); return; }
    const monto = parseInt(form.monto.replace(/\D/g, ''), 10);
    if (!monto || monto <= 0) { setError(t('gastos.error_monto')); return; }
    try {
      setSaving(true);
      setError('');
      await api.post('/gastos', {
        ...form,
        monto,
        tipo: 'unico',
        ingreso_id: form.ingreso_id || null,
        item_id: form.item_id || null,
      });
      setModalOpen(false);
      resetForm();
      await cargarGastos();
    } catch (err: any) {
      setError(err?.response?.data?.error || t('gastos.error_monto'));
    } finally {
      setSaving(false);
    }
  };

  // ── Guardar plantilla recurrente ──
  const handleGuardarRecurrente = async () => {
    if (!formRec.nombre.trim()) { setError(t('gastos.error_nombre')); return; }
    const monto = parseInt(formRec.monto_estimado.replace(/\D/g, ''), 10);
    if (!monto || monto <= 0) { setError(t('gastos.error_monto_estimado')); return; }
    try {
      setSaving(true);
      setError('');
      await api.post('/gastos/recurrentes', { ...formRec, monto_estimado: monto });
      setModalOpen(false);
      resetForm();
      await cargarTodo();
    } catch (err: any) {
      setError(err?.response?.data?.error || t('gastos.error_monto'));
    } finally {
      setSaving(false);
    }
  };

  // ── Confirmar recurrente pendiente ──
  const handleConfirmarRecurrente = async () => {
    if (!confirmRecurrente) return;
    const monto = parseInt(montoConfirm.replace(/\D/g, ''), 10);
    if (!monto || monto <= 0) { setError(t('gastos.error_monto')); return; }
    try {
      setSaving(true);
      setError('');
      await api.post('/gastos', {
        fecha: confirmRecurrente.proxima_fecha || bogotaToday(),
        categoria_id: confirmRecurrente.taller_categorias_gastos?.id || null,
        descripcion: confirmRecurrente.nombre,
        monto,
        tipo: 'recurrente',
        plantilla_id: confirmRecurrente.id,
      });
      setPendientes(p => p.filter(x => x.id !== confirmRecurrente.id));
      setConfirmRecurrente(null);
      await cargarGastos();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Error registrando gasto.');
    } finally {
      setSaving(false);
    }
  };

  // ── Eliminar gasto ──
  const handleEliminar = async (id: string) => {
    if (!window.confirm(t('gastos.confirm_eliminar'))) return;
    try {
      await api.delete(`/gastos/${id}`);
      setGastos(g => g.filter(x => x.id !== id));
      setSeleccionados(prev => {
        if (prev.has(id)) {
          const next = new Map(prev);
          next.delete(id);
          return next;
        }
        return prev;
      });
      await cargarGastos();
    } catch {
      setError(t('gastos.error_eliminar'));
    }
  };

  const resetForm = () => {
    setForm({
      fecha: bogotaToday(),
      categoria_id: '',
      descripcion: '',
      monto: '',
      proveedor: '',
      notas: '',
      comprobante_url: '',
      ingreso_id: '',
      item_id: '',
    });
    setFormRec({ nombre: '', categoria_id: '', monto_estimado: '', frecuencia: 'mensual', dia_del_mes: '', fecha_inicio: bogotaToday(), notas: '' });
    setSearchPlaca('');
    setOrdenSeleccionada(null);
    setOrdenesSugeridas([]);
    setMostrarVehiculo(false);
    setModalMode('unico');
    setBatchHeader({ fecha: bogotaToday(), proveedor: '', comprobante_url: '', total_factura: '', categoria_id: '', notas: '' });
    setBatchFilas([crearNuevaFila()]);
    setCurrentLoteId(crypto.randomUUID());
    setDuplicadosModal(null);
    setError('');
  };

  // ── Upload comprobante del lote (cabecera batch) ──
  const handleBatchUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setBatchUploading(true);
      const fd = new FormData();
      fd.append('archivo', file);
      const res = await api.post('/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setBatchHeader(h => ({ ...h, comprobante_url: res.data.url }));
    } catch {
      setError('Error subiendo comprobante.');
    } finally {
      setBatchUploading(false);
      if (batchFileRef.current) batchFileRef.current.value = '';
    }
  };

  // ── Guardar Lote (Idempotencia garantizada: reutiliza currentLoteId hasta éxito) ──
  const handleGuardarBatch = async (confirmar = false) => {
    const loteId = currentLoteId;

    // Validación local básica antes de llamar al servidor
    for (let i = 0; i < batchFilas.length; i++) {
      const f = batchFilas[i];
      const num = i + 1;
      if (!f.descripcion.trim()) { setError(`Fila ${num}: La descripción es obligatoria.`); return; }
      const m = parseInt(f.monto.replace(/\D/g, ''), 10);
      if (!m || m <= 0) { setError(`Fila ${num}: El monto debe ser mayor a 0.`); return; }
    }

    const filas = batchFilas.map(f => ({
      fecha: batchHeader.fecha || bogotaToday(),
      categoria_id: batchHeader.categoria_id || undefined,
      descripcion: f.descripcion.trim(),
      monto: parseInt(f.monto.replace(/\D/g, ''), 10),
      proveedor: batchHeader.proveedor.trim() || undefined,
      notas: batchHeader.notas.trim() || undefined,
      comprobante_url: batchHeader.comprobante_url || undefined,
      ingreso_id: f.ingreso_id || undefined,
      item_id: f.item_id || undefined,
    }));

    try {
      setSaving(true);
      setError('');
      await api.post('/gastos/batch', {
        lote_id: loteId,
        filas,
        confirmar_duplicados: confirmar,
      });
      setModalOpen(false);
      setDuplicadosModal(null);
      resetForm();
      await cargarGastos();
    } catch (err: any) {
      if (err?.response?.status === 409) {
        // Mostrar modal de confirmación de duplicados (conserva currentLoteId para reenvío)
        setDuplicadosModal({
          pendingLoteId: loteId,
          pendingFilas: filas,
          duplicados: err.response.data.duplicados || [],
        });
        setSaving(false);
        return;
      }
      setError(err?.response?.data?.error || 'Error guardando el lote.');
    } finally {
      setSaving(false);
    }
  };

  // ── Selección Masiva (Fase 2) ──
  const toggleSeleccionarGasto = (gasto: Gasto) => {
    setSeleccionados(prev => {
      const next = new Map(prev);
      if (next.has(gasto.id)) {
        next.delete(gasto.id);
      } else {
        next.set(gasto.id, gasto);
      }
      return next;
    });
  };

  const toggleSeleccionarTodos = () => {
    if (gastos.length === 0) return;
    const todosSeleccionados = gastos.every(g => seleccionados.has(g.id));
    setSeleccionados(prev => {
      const next = new Map(prev);
      if (todosSeleccionados) {
        gastos.forEach(g => next.delete(g.id));
      } else {
        gastos.forEach(g => next.set(g.id, g));
      }
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="animate-spin w-10 h-10 text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Receipt className="text-red-500" size={26} />
            {t('gastos.title')}
          </h1>
          <p className="text-slate-500 text-sm">{t('gastos.subtitle')}</p>
        </div>
        <button
          onClick={() => { resetForm(); setModalOpen(true); }}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-5 py-2.5 rounded-xl transition shadow-md"
        >
          <Plus size={18} /> {t('gastos.btn_nuevo')}
        </button>
      </div>

      {/* ── Banner de Recurrentes Pendientes ── */}
      {pendientes.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2 font-semibold text-amber-800">
            <CalendarClock size={18} />
            {t('gastos.pendientes_banner', { count: pendientes.length })}
          </div>
          <div className="space-y-2">
            {pendientes.map(p => (
              <div key={p.id} className="flex items-center justify-between bg-white rounded-xl px-4 py-3 border border-amber-100 shadow-sm">
                <div>
                  <p className="font-semibold text-slate-800">{p.nombre}</p>
                  <p className="text-xs text-slate-400">
                    <span className="capitalize">{p.frecuencia}</span>
                    {' · '} Estimado: {formatearDinero(p.monto_estimado)}
                    {p.proxima_fecha && ` · Fecha: ${p.proxima_fecha}`}
                  </p>
                </div>
                <button
                  onClick={() => { setConfirmRecurrente(p); setMontoConfirm(p.monto_estimado.toString()); setError(''); }}
                  className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition"
                >
                  <Check size={14} /> {t('gastos.btn_confirmar')}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">
          <AlertCircle size={16} /> {error}
          <button onClick={() => setError('')} className="ml-auto"><X size={14} /></button>
        </div>
      )}

      {/* ── Filtros + Resumen ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
        {/* Presets rápidos */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => aplicarPreset('30dias')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                filtroPreset === '30dias' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              30 Días
            </button>
            <button
              onClick={() => aplicarPreset('este_mes')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                filtroPreset === 'este_mes' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Este Mes
            </button>
            <button
              onClick={() => aplicarPreset('todos')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                filtroPreset === 'todos' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Todos
            </button>
          </div>
          <span className="text-xs text-slate-400 font-medium">
            {filtroPreset === '30dias'
              ? 'Últimos 30 días'
              : filtroPreset === 'este_mes'
              ? 'Mes en curso'
              : filtroPreset === 'todos'
              ? 'Todo el historial'
              : 'Rango personalizado'}
          </span>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-end gap-4">
          <div className="flex-1">
            <label className="block text-xs font-bold text-slate-400 uppercase mb-1">{t('gastos.filtro_categoria')}</label>
            <select
              value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              <option value="">{t('gastos.todas')}</option>
              {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-xs font-bold text-slate-400 uppercase mb-1">{t('gastos.desde')}</label>
            <input
              type="date"
              value={filtroDesde}
              onChange={e => {
                setFiltroDesde(e.target.value);
                setFiltroPreset('personalizado');
              }}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-bold text-slate-400 uppercase mb-1">{t('gastos.hasta')}</label>
            <input
              type="date"
              value={filtroHasta}
              onChange={e => {
                setFiltroHasta(e.target.value);
                setFiltroPreset('personalizado');
              }}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
          <div className="bg-red-50 border border-red-100 rounded-xl px-5 py-3 text-center shrink-0">
            <div className="flex items-center justify-center gap-1.5">
              <p className="text-xs font-bold text-red-400 uppercase">{t('gastos.total_periodo')}</p>
              <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-semibold">
                {filtroPreset === '30dias'
                  ? '30 Días'
                  : filtroPreset === 'este_mes'
                  ? 'Este Mes'
                  : filtroPreset === 'todos'
                  ? 'Total'
                  : 'Rango'}
              </span>
            </div>
            <p className="text-xl font-black text-red-600">{formatearDinero(totalMonto)}</p>
          </div>
        </div>
      </div>

      {/* ── Tabla de Gastos ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {gastos.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
                  <th className="w-10 px-4 py-3 text-center print:hidden">
                    <input
                      type="checkbox"
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      checked={gastos.length > 0 && gastos.every(g => seleccionados.has(g.id))}
                      onChange={toggleSeleccionarTodos}
                      title="Seleccionar todos"
                    />
                  </th>
                  <th className="text-left px-5 py-3">{t('gastos.col_fecha')}</th>
                  <th className="text-left px-5 py-3">{t('gastos.col_descripcion')}</th>
                  <th className="text-left px-5 py-3">{t('gastos.col_categoria')}</th>
                  <th className="text-right px-5 py-3">{t('gastos.col_monto')}</th>
                  <th className="text-center px-5 py-3 print:hidden">{t('gastos.col_acciones')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {gastos.map(g => (
                  <tr key={g.id} className={`hover:bg-slate-50 transition ${seleccionados.has(g.id) ? 'bg-indigo-50/40' : ''}`}>
                    <td className="w-10 px-4 py-3 text-center print:hidden" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        checked={seleccionados.has(g.id)}
                        onChange={() => toggleSeleccionarGasto(g)}
                      />
                    </td>
                    <td className="px-5 py-3 text-slate-600 whitespace-nowrap">{g.fecha}</td>
                    <td className="px-5 py-3">
                      <p className="font-medium text-slate-800">{g.descripcion}</p>
                      {g.proveedor && <p className="text-xs text-slate-400">{g.proveedor}</p>}
                      {g.tipo === 'recurrente' && (
                        <span className="inline-flex items-center gap-1 text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded mt-0.5 font-bold uppercase">
                          <Repeat size={9} /> {t('gastos.badge_recurrente')}
                        </span>
                      )}
                      {g.taller_ingresos?.taller_vehiculos?.placa && (
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              const esCerrada = g.taller_ingresos?.estado === 'entregado' || g.taller_ingresos?.estado === 'cancelado';
                              const path = esCerrada
                                ? `/${slug}/historial/${g.ingreso_id}`
                                : `/${slug}/checkout/${g.ingreso_id}`;
                              navigate(path);
                            }}
                            className="inline-flex items-center gap-1 text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300 px-1.5 py-0.5 rounded hover:bg-amber-200 transition"
                            title="Ver orden de servicio"
                          >
                            <Car size={11} /> {g.taller_ingresos.taller_vehiculos.placa}
                          </button>
                          {g.item_id && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-indigo-700 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded">
                              <Package size={10} /> Ítem vinculado
                            </span>
                          )}
                        </div>
                      )}
                      {g.comprobante_url && (
                        <a href={g.comprobante_url} target="_blank" rel="noreferrer" className="text-xs text-indigo-500 underline block mt-0.5">
                          {t('gastos.ver_recibo')}
                        </a>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      {g.taller_categorias_gastos ? (
                        <span
                          className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full"
                          style={{ backgroundColor: (g.taller_categorias_gastos.color || '#6366f1') + '20', color: g.taller_categorias_gastos.color || '#6366f1' }}
                        >
                          <Tag size={10} /> {g.taller_categorias_gastos.nombre}
                        </span>
                      ) : <span className="text-slate-300 text-xs">—</span>}
                    </td>
                    <td className="px-5 py-3 text-right font-bold text-red-600 whitespace-nowrap">
                      {formatearDinero(g.monto)}
                    </td>
                    <td className="px-5 py-3 text-center print:hidden">
                      <button onClick={() => handleEliminar(g.id)} className="text-red-400 hover:text-red-600 transition p-1">
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <Receipt size={48} className="opacity-20 mb-3" />
            <p className="font-semibold">{t('gastos.sin_gastos')}</p>
            <p className="text-sm">{t('gastos.sin_gastos_desc')}</p>
          </div>
        )}
      </div>

      {/* ── Barra Flotante de Selección Masiva (Fase 2) ── */}
      {seleccionados.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900/95 backdrop-blur text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-4 z-40 border border-slate-700 animate-in fade-in slide-in-from-bottom-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">{t('gastos.masivo_seleccionados', { count: seleccionados.size })}</span>
            <span className="text-xs text-slate-400">·</span>
            <span className="text-sm font-bold text-emerald-400">
              {t('gastos.masivo_total')} {formatearDinero(Array.from(seleccionados.values()).reduce((acc, x) => acc + x.monto, 0))}
            </span>
          </div>
          <button
            onClick={() => setModalMasivoOpen(true)}
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition shadow-sm"
          >
            <Car size={14} /> {t('gastos.masivo_asociar_vehiculo')}
          </button>
          <button
            onClick={() => setSeleccionados(new Map())}
            className="text-slate-400 hover:text-white text-xs font-semibold px-2 py-1"
          >
            {t('gastos.masivo_deseleccionar')}
          </button>
        </div>
      )}

      {/* ── Modal de Vinculación Masiva (Fase 2) ── */}
      <ModalVincularMasivo
        open={modalMasivoOpen}
        onClose={() => setModalMasivoOpen(false)}
        gastosSeleccionados={Array.from(seleccionados.values())}
        onSuccess={async () => {
          setSeleccionados(new Map());
          await cargarGastos();
        }}
        formatearDinero={formatearDinero}
      />

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* MODAL: Nuevo Gasto / Nueva Plantilla */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
          <div className={`bg-white rounded-2xl shadow-2xl w-full max-h-[90vh] overflow-y-auto ${modalMode === 'batch' ? 'max-w-2xl' : 'max-w-lg'}`}>
            {/* Header Modal */}
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-900">{t('gastos.modal_title')}</h2>
              <button onClick={() => { setModalOpen(false); resetForm(); }} className="p-1 rounded-full hover:bg-slate-100 transition">
                <X size={20} className="text-slate-500" />
              </button>
            </div>

            {/* Tabs: Único / Factura Multilínea / Recurrente */}
            <div className="flex gap-1 p-3 bg-slate-50 border-b border-slate-100">
              <button
                onClick={() => { setModalTab('unico'); setModalMode('unico'); }}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold transition ${modalTab === 'unico' && modalMode === 'unico' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'}`}
              >
                <Receipt size={13} className="inline mr-1" /> {t('gastos.tab_unico')}
              </button>
              <button
                onClick={() => { setModalTab('unico'); setModalMode('batch'); }}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold transition ${modalMode === 'batch' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'}`}
              >
                <FileText size={13} className="inline mr-1" /> Factura (varios)
              </button>
              <button
                onClick={() => { setModalTab('recurrente'); setModalMode('unico'); }}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold transition ${modalTab === 'recurrente' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'}`}
              >
                <Repeat size={13} className="inline mr-1" /> {t('gastos.tab_recurrente')}
              </button>
            </div>

            <div className="p-5 space-y-4">
              {error && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">
                  <AlertCircle size={14} /> {error}
                </div>
              )}

              {/* ────── FORM: Gasto Único ────── */}
              {modalTab === 'unico' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">{t('gastos.label_fecha')} *</label>
                      <input type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">{t('gastos.label_categoria')}</label>
                      <select
                        value={form.categoria_id}
                        onChange={e => {
                          const val = e.target.value;
                          setForm(f => ({ ...f, categoria_id: val }));
                          const cat = categorias.find(c => c.id === val);
                          if (cat && /repuesto/i.test(cat.nombre)) {
                            setMostrarVehiculo(true);
                          }
                        }}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                      >
                        <option value="">{t('gastos.sin_categoria')}</option>
                        {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* ── Bloque de Vinculación a Orden / Ítem (plegable) ── */}
                  <div className="border border-slate-200/80 rounded-xl overflow-hidden">
                    {/* Encabezado del acordeón */}
                    <button
                      type="button"
                      onClick={() => setMostrarVehiculo(v => !v)}
                      className="w-full flex items-center justify-between px-3.5 py-2.5 bg-slate-50 hover:bg-slate-100 transition text-xs font-bold text-slate-700"
                    >
                      <span className="flex items-center gap-1.5">
                        <Car size={14} className="text-indigo-600" />
                        {ordenSeleccionada
                          ? `Vinculado: ${ordenSeleccionada.vehiculo?.placa} · ${ordenSeleccionada.vehiculo?.marca ?? ''}`
                          : t('gastos.vincular_orden')}
                      </span>
                      <span className="flex items-center gap-1.5 text-slate-400">
                        {ordenSeleccionada && <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded font-bold">Vinculado</span>}
                        {mostrarVehiculo ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </span>
                    </button>

                    {/* Cuerpo del acordeón */}
                    {mostrarVehiculo && (
                      <div className="p-3.5 space-y-3 bg-slate-50/50">
                        {ordenSeleccionada && (
                          <button type="button" onClick={quitarOrdenSeleccionada}
                            className="text-[11px] text-red-500 hover:text-red-700 font-semibold flex items-center gap-0.5">
                            <X size={12} /> {t('gastos.quitar_vinculo')}
                          </button>
                        )}

                        {!ordenSeleccionada ? (
                          <div ref={searchPlacaRef} className="relative">
                            <div className="relative">
                              <input
                                type="text"
                                value={searchPlaca}
                                onChange={e => handleSearchPlacaChange(e.target.value)}
                                placeholder={t('gastos.buscar_placa_placeholder')}
                                className="w-full border border-slate-200 rounded-lg pl-8 pr-8 py-2 text-xs uppercase font-medium focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                              />
                              <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
                              {buscandoPlacas && (
                                <Loader2 size={14} className="animate-spin absolute right-2.5 top-2.5 text-indigo-500" />
                              )}
                            </div>

                            {/* Dropdown de resultados */}
                            {ordenesSugeridas.length > 0 && (
                              <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-52 overflow-y-auto divide-y divide-slate-100">
                                {ordenesSugeridas.map(ord => (
                                  <div
                                    key={ord.id}
                                    onClick={() => seleccionarOrden(ord)}
                                    className="p-2.5 hover:bg-indigo-50/40 cursor-pointer transition flex items-center justify-between gap-2"
                                  >
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-2">
                                        <span className="bg-amber-100 text-amber-900 border border-amber-300 text-xs font-black px-1.5 py-0.5 rounded tracking-wider">
                                          {ord.vehiculo?.placa}
                                        </span>
                                        <span className="text-xs font-semibold text-slate-700 truncate">
                                          {ord.vehiculo?.marca} {ord.vehiculo?.linea}
                                        </span>
                                      </div>
                                      {ord.motivo_visita && (
                                        <p className="text-[11px] text-slate-400 truncate mt-0.5">{ord.motivo_visita}</p>
                                      )}
                                    </div>
                                    <div className="text-right shrink-0">
                                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize ${
                                        ord.estado === 'en_reparacion' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                                        ord.estado === 'entregado' ? 'bg-slate-100 text-slate-600' :
                                        'bg-amber-50 text-amber-700 border border-amber-200'
                                      }`}>
                                        {ord.estado.replace('_', ' ')}
                                      </span>
                                      <p className="text-[10px] text-slate-400 mt-0.5">{ord.fecha_ingreso?.split('T')[0]}</p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-2.5">
                            <div className="bg-white border border-indigo-100 rounded-lg p-2.5 flex items-center justify-between text-xs">
                              <div className="flex items-center gap-2">
                                <span className="bg-amber-100 text-amber-900 border border-amber-300 font-black px-1.5 py-0.5 rounded tracking-wider text-xs">
                                  {ordenSeleccionada.vehiculo?.placa}
                                </span>
                                <div>
                                  <p className="font-bold text-slate-800">
                                    {ordenSeleccionada.vehiculo?.marca} {ordenSeleccionada.vehiculo?.linea}
                                  </p>
                                  <p className="text-[10px] text-slate-400">
                                    Estado: <strong className="capitalize">{ordenSeleccionada.estado?.replace('_', ' ')}</strong>
                                  </p>
                                </div>
                              </div>
                            </div>

                            {ordenSeleccionada.items_repuesto && ordenSeleccionada.items_repuesto.length > 0 ? (
                              <div>
                                <label className="block text-[11px] font-bold text-slate-500 mb-1">
                                  {t('gastos.seleccionar_item')}
                                </label>
                                <select
                                  value={form.item_id}
                                  onChange={e => handleSeleccionarItemOrden(e.target.value)}
                                  className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                                >
                                  <option value="">-- {t('gastos.solo_orden')} --</option>
                                  {ordenSeleccionada.items_repuesto.map((item: any) => (
                                    <option key={item.id} value={item.id}>
                                      {item.descripcion} (Venta: {formatearDinero(item.total)})
                                    </option>
                                  ))}
                                </select>
                              </div>
                            ) : (
                              <p className="text-[11px] text-slate-400 italic">
                                {t('gastos.orden_sin_repuestos_desc')}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <p className="text-[11px] text-slate-500 bg-blue-50 border border-blue-100 rounded-lg p-2.5">
                    {t('gastos.nota_costo_venta')}
                  </p>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">{t('gastos.label_descripcion')} *</label>
                    <input type="text" value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
                      placeholder={t('gastos.placeholder_descripcion')}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">{t('gastos.label_monto')} *</label>
                      <input type="text" value={form.monto} onChange={e => setForm(f => ({ ...f, monto: formatearMonto(e.target.value) }))}
                        placeholder="0"
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">{t('gastos.label_proveedor')}</label>
                      <input type="text" value={form.proveedor} onChange={e => setForm(f => ({ ...f, proveedor: e.target.value }))}
                        placeholder={t('gastos.placeholder_proveedor')}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">{t('gastos.label_notas')}</label>
                    <textarea value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
                      rows={2} placeholder={t('gastos.placeholder_notas')}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none" />
                  </div>

                  {/* Upload comprobante */}
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">{t('gastos.label_comprobante')}</label>
                    {form.comprobante_url ? (
                      <div className="flex items-center gap-2 text-sm">
                        <a href={form.comprobante_url} target="_blank" rel="noreferrer" className="text-indigo-600 underline truncate">{t('gastos.ver_archivo')}</a>
                        <button onClick={() => setForm(f => ({ ...f, comprobante_url: '' }))} className="text-red-400 hover:text-red-600 transition"><X size={14} /></button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                        className="flex items-center gap-2 border-2 border-dashed border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-500 hover:border-indigo-300 hover:text-indigo-600 transition w-full justify-center"
                      >
                        {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                        {uploading ? t('gastos.subiendo') : t('gastos.btn_adjuntar')}
                      </button>
                    )}
                    <input ref={fileInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={handleUpload} />
                  </div>
                </>
              )}

              {/* ────── FORM: Factura Multilínea (Batch) ────── */}
              {modalTab === 'unico' && modalMode === 'batch' && (
                <>
                  {/* ── Cabecera compartida ── */}
                  <div className="bg-slate-50 rounded-xl p-3.5 space-y-3 border border-slate-200">
                    <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">{t('gastos.datos_factura')}</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">{t('gastos.label_fecha')} *</label>
                        <input type="date" value={batchHeader.fecha} onChange={e => setBatchHeader(h => ({ ...h, fecha: e.target.value }))}
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">{t('gastos.label_categoria')}</label>
                        <select
                          value={batchHeader.categoria_id}
                          onChange={e => {
                            const val = e.target.value;
                            setBatchHeader(h => ({ ...h, categoria_id: val }));
                            const cat = categorias.find(c => c.id === val);
                            if (cat && /repuesto/i.test(cat.nombre)) {
                              setBatchFilas(fs => fs.map(f => ({ ...f, mostrarVehiculo: true })));
                            }
                          }}
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                        >
                          <option value="">{t('gastos.sin_categoria')}</option>
                          {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">{t('gastos.label_proveedor')}</label>
                        <input type="text" value={batchHeader.proveedor} onChange={e => setBatchHeader(h => ({ ...h, proveedor: e.target.value }))}
                          placeholder={t('gastos.placeholder_proveedor')}
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">{t('gastos.total_factura_label')}</label>
                        <input type="text" value={batchHeader.total_factura} onChange={e => setBatchHeader(h => ({ ...h, total_factura: formatearMonto(e.target.value) }))}
                          placeholder="0"
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                      </div>
                    </div>
                    {/* Comprobante compartido */}
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">{t('gastos.label_comprobante')}</label>
                      {batchHeader.comprobante_url ? (
                        <div className="flex items-center gap-2 text-sm">
                          <a href={batchHeader.comprobante_url} target="_blank" rel="noreferrer" className="text-indigo-600 underline truncate">{t('gastos.ver_archivo')}</a>
                          <button onClick={() => setBatchHeader(h => ({ ...h, comprobante_url: '' }))} className="text-red-400"><X size={14} /></button>
                        </div>
                      ) : (
                        <button type="button" onClick={() => batchFileRef.current?.click()} disabled={batchUploading}
                          className="flex items-center gap-2 border-2 border-dashed border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-500 hover:border-indigo-300 hover:text-indigo-600 transition w-full justify-center">
                          {batchUploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                          {batchUploading ? t('gastos.subiendo') : t('gastos.btn_adjuntar')}
                        </button>
                      )}
                      <input ref={batchFileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={handleBatchUpload} />
                    </div>
                  </div>

                  {/* ── Editor de Filas Reutilizable ── */}
                  <EditorLineasGasto
                    filas={batchFilas}
                    onChangeFilas={setBatchFilas}
                    totalFactura={batchHeader.total_factura}
                    formatearDinero={formatearDinero}
                    formatearMonto={formatearMonto}
                  />
                </>
              )}

              {/* ────── FORM: Gasto Recurrente ────── */}
              {modalTab === 'recurrente' && (

                <>
                  <p className="text-xs text-slate-500 bg-blue-50 border border-blue-100 rounded-lg p-3">
                    {t('gastos.desc_plantilla')}
                  </p>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">{t('gastos.label_nombre_rec')} *</label>
                    <input type="text" value={formRec.nombre} onChange={e => setFormRec(f => ({ ...f, nombre: e.target.value }))}
                      placeholder={t('gastos.placeholder_nombre_rec')}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">{t('gastos.label_categoria')}</label>
                      <select value={formRec.categoria_id} onChange={e => setFormRec(f => ({ ...f, categoria_id: e.target.value }))}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                        <option value="">{t('gastos.sin_categoria')}</option>
                        {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">{t('gastos.label_monto_est')} *</label>
                      <input type="text" value={formRec.monto_estimado} onChange={e => setFormRec(f => ({ ...f, monto_estimado: formatearMonto(e.target.value) }))}
                        placeholder="0"
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">{t('gastos.label_frecuencia')} *</label>
                      <select value={formRec.frecuencia} onChange={e => setFormRec(f => ({ ...f, frecuencia: e.target.value }))}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                        {FRECUENCIA_VALUES.map(val => (
                          <option key={val} value={val}>{t(`gastos.frecuencia_${val}`)}</option>
                        ))}
                      </select>
                    </div>
                    {formRec.frecuencia === 'mensual' && (
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">{t('gastos.label_dia_mes')}</label>
                        <input type="number" min={1} max={31} value={formRec.dia_del_mes} onChange={e => setFormRec(f => ({ ...f, dia_del_mes: e.target.value }))}
                          placeholder={t('gastos.placeholder_dia_mes')}
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">{t('gastos.label_fecha_inicio')}</label>
                    <input type="date" value={formRec.fecha_inicio} onChange={e => setFormRec(f => ({ ...f, fecha_inicio: e.target.value }))}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">{t('gastos.label_notas')}</label>
                    <textarea value={formRec.notas} onChange={e => setFormRec(f => ({ ...f, notas: e.target.value }))}
                      rows={2} placeholder={t('gastos.placeholder_notas')}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none" />
                  </div>
                </>
              )}

              {/* Botones del modal */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => { setModalOpen(false); resetForm(); }}
                  className="flex-1 border border-slate-200 text-slate-600 py-2.5 rounded-xl font-semibold text-sm hover:bg-slate-50 transition"
                >
                  {t('gastos.btn_cancelar')}
                </button>
                <button
                  onClick={
                    modalMode === 'batch'
                      ? () => handleGuardarBatch()
                      : modalTab === 'unico' ? handleGuardar : handleGuardarRecurrente
                  }
                  disabled={saving}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-xl font-bold text-sm transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                  {modalMode === 'batch'
                    ? (batchFilas.length === 1 ? t('gastos.btn_registrar_batch', { count: 1 }) : t('gastos.btn_registrar_batch_plural', { count: batchFilas.length }))
                    : modalTab === 'unico' ? t('gastos.btn_guardar') : t('gastos.btn_crear_plantilla')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* MODAL: Confirmar Duplicados (409)                               */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {duplicadosModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-amber-100 rounded-xl text-amber-600"><AlertTriangle size={22} /></div>
              <div>
                <h3 className="font-bold text-slate-900">{t('gastos.posibles_duplicados')}</h3>
                <p className="text-sm text-slate-500">{t('gastos.revisar_antes_confirmar')}</p>
              </div>
            </div>
            <div className="max-h-48 overflow-y-auto space-y-2">
              {duplicadosModal.duplicados.map((d: any, i: number) => (
                <div key={i} className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-xs">
                  <p className="font-bold text-amber-900">{d.fila_nueva?.descripcion} — {formatearDinero(d.fila_nueva?.monto)}</p>
                  <p className="text-amber-700 mt-0.5">Gasto similar ya registrado el {d.existente?.fecha}: {d.existente?.descripcion} ({formatearDinero(d.existente?.monto)})</p>
                </div>
              ))}
            </div>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex gap-3">
              <button onClick={() => setDuplicadosModal(null)}
                className="flex-1 border border-slate-200 text-slate-600 py-2.5 rounded-xl font-semibold text-sm hover:bg-slate-50 transition">
                {t('gastos.btn_cancelar')}
              </button>
              <button
                onClick={() => handleGuardarBatch(true)}
                disabled={saving}
                className="flex-1 bg-amber-500 hover:bg-amber-600 text-white py-2.5 rounded-xl font-bold text-sm transition disabled:opacity-50 flex items-center justify-center gap-2">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                {t('gastos.guardar_de_todas_formas')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* MODAL: Confirmar Gasto Recurrente Pendiente */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {confirmRecurrente && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-amber-100 rounded-xl text-amber-600"><CalendarClock size={22} /></div>
              <div>
                <h3 className="font-bold text-slate-900">{t('gastos.confirmar_title')}</h3>
                <p className="text-sm text-slate-500">{confirmRecurrente.nombre}</p>
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">{t('gastos.label_monto_real')}</label>
              <input
                type="text"
                value={montoConfirm}
                onChange={e => setMontoConfirm(formatearMonto(e.target.value))}
                className="w-full border-2 border-amber-300 rounded-xl px-4 py-3 text-lg font-bold text-slate-800 focus:ring-2 focus:ring-amber-400 outline-none text-center"
              />
              <p className="text-xs text-slate-400 mt-1 text-center">{t('gastos.ajustar_monto')}</p>
            </div>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex gap-3">
              <button onClick={() => { setConfirmRecurrente(null); setError(''); }}
                className="flex-1 border border-slate-200 text-slate-600 py-2.5 rounded-xl font-semibold text-sm hover:bg-slate-50 transition">
                {t('gastos.btn_cancelar')}
              </button>
              <button onClick={handleConfirmarRecurrente} disabled={saving}
                className="flex-1 bg-amber-500 hover:bg-amber-600 text-white py-2.5 rounded-xl font-bold text-sm transition disabled:opacity-50 flex items-center justify-center gap-2">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                {t('gastos.btn_registrar')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Gastos;
