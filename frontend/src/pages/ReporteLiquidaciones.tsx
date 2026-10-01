import React, { useState, useEffect, useCallback } from 'react';
import {
  DollarSign, Wrench, CalendarDays, ChevronDown, Loader2, AlertCircle,
  CheckCircle, RefreshCw, Users, Percent, Zap, CreditCard, X, History,
  Clock, CheckSquare, Square
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '../services/api';

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface Tecnico {
  id: string;
  nombre: string;
}

interface FilaLiquidacion {
  id: string;
  ingreso_id: string;
  tecnico_id: string;
  nombre_tecnico: string;
  placa: string;
  fecha_entrega: string;
  total_mano_obra: number;
  monto_comision: number;
  porcentaje_aplicado: number;
  estado: 'pendiente' | 'liquidado';
  fecha_pago: string | null;
  gasto_id: string | null;
}

type RangoRapido = 'hoy' | 'semana' | 'mes' | 'personalizado';
type Tab = 'pendiente' | 'liquidado';

// ── Utilidades ────────────────────────────────────────────────────────────────

const formatCOP = (val: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(val);

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });

/** Fecha de hoy en zona America/Bogota como YYYY-MM-DD (evita desfase UTC). */
const bogotaToday = (): string =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Bogota' }).format(new Date());

function getRangoFechas(rango: RangoRapido, desde: string, hasta: string) {
  const hoy = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const toStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  if (rango === 'hoy') { const s = toStr(hoy); return { desde: s, hasta: s }; }
  if (rango === 'semana') {
    const lunes = new Date(hoy);
    lunes.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7));
    return { desde: toStr(lunes), hasta: toStr(hoy) };
  }
  if (rango === 'mes') {
    return { desde: toStr(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), hasta: toStr(hoy) };
  }
  return { desde, hasta };
}

// ── Modal de Liquidación ──────────────────────────────────────────────────────

interface ModalLiquidarProps {
  filasSeleccionadas: FilaLiquidacion[];
  nombreTecnico: string;
  onClose: () => void;
  onSuccess: () => void;
}

const ModalLiquidar: React.FC<ModalLiquidarProps> = ({
  filasSeleccionadas,
  nombreTecnico,
  onClose,
  onSuccess,
}) => {
  const { t } = useTranslation();
  const [fechaPago, setFechaPago] = useState<string>(bogotaToday());
  const [notas, setNotas] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState('');

  // lote_id fijo al abrir el modal: garantiza idempotencia en reintentos
  const [loteId] = useState<string>(() => crypto.randomUUID());

  const totalComisiones = filasSeleccionadas.reduce((acc, f) => acc + f.monto_comision, 0);
  const tecnicoId = filasSeleccionadas[0]?.tecnico_id;

  const handleConfirmar = async () => {
    if (!fechaPago) { setError('La fecha de pago es obligatoria.'); return; }
    setProcesando(true);
    setError('');
    try {
      const { data } = await api.post('/liquidaciones/liquidar', {
        tecnico_id: tecnicoId,
        filas_ids: filasSeleccionadas.map(f => f.id),
        fecha: fechaPago,
        notas: notas.trim() || null,
        lote_id: loteId,
      });
      void data; // el gasto_id se registra en el backend; no necesitamos el valor aquí
      onSuccess();
    } catch (e: unknown) {
      const msg = e instanceof Error
        ? e.message
        : (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || t('liquidaciones.error_liquidar'));
    } finally {
      setProcesando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-violet-100 rounded-xl">
              <CreditCard className="text-violet-600 w-5 h-5" />
            </div>
            <h2 className="font-bold text-slate-900 text-lg">{t('liquidaciones.modal_liquidar_title')}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
            <X size={18} className="text-slate-500" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {/* Resumen */}
          <div className="bg-violet-50 border border-violet-100 rounded-xl p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">{t('liquidaciones.modal_liquidar_tecnico')}</span>
              <span className="font-semibold text-slate-900">{nombreTecnico}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">{t('liquidaciones.modal_liquidar_servicios')}</span>
              <span className="font-semibold text-slate-900">{filasSeleccionadas.length}</span>
            </div>
            <div className="flex justify-between text-base border-t border-violet-200 pt-2 mt-2">
              <span className="font-bold text-slate-700">{t('liquidaciones.modal_liquidar_total')}</span>
              <span className="font-bold text-violet-700 text-lg">{formatCOP(totalComisiones)}</span>
            </div>
          </div>

          {/* Fecha de pago */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-700">
              {t('liquidaciones.modal_liquidar_fecha')}
            </label>
            <input
              type="date"
              value={fechaPago}
              onChange={e => setFechaPago(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-violet-500 outline-none"
            />
          </div>

          {/* Notas */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-700">
              {t('liquidaciones.modal_liquidar_notas')}
            </label>
            <input
              type="text"
              value={notas}
              onChange={e => setNotas(e.target.value)}
              placeholder={t('liquidaciones.modal_liquidar_notas_placeholder')}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-violet-500 outline-none"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg text-sm">
              <AlertCircle size={15} />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 pb-5">
          <button
            onClick={onClose}
            disabled={procesando}
            className="flex-1 px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            {t('liquidaciones.modal_liquidar_cancelar')}
          </button>
          <button
            onClick={handleConfirmar}
            disabled={procesando || totalComisiones <= 0}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold rounded-xl transition-colors disabled:opacity-50"
          >
            {procesando
              ? <><Loader2 size={14} className="animate-spin" /> {t('liquidaciones.modal_liquidar_procesando')}</>
              : <><CreditCard size={14} /> {t('liquidaciones.modal_liquidar_confirmar')}</>}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Componente Principal ──────────────────────────────────────────────────────

const ReporteLiquidaciones: React.FC = () => {
  const { t } = useTranslation();

  // Filtros
  const [tab, setTab] = useState<Tab>('pendiente');
  const [rangoRapido, setRangoRapido] = useState<RangoRapido>('mes');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [tecnicoId, setTecnicoId] = useState('');
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);

  // Datos
  const [filas, setFilas] = useState<FilaLiquidacion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Selección para liquidar
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Modal
  const [modalOpen, setModalOpen] = useState(false);

  // Edición inline de porcentaje (solo en pestaña pendiente)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  // Asignación masiva
  const [bulkPct, setBulkPct] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkSuccess, setBulkSuccess] = useState(false);

  // ── Cargar técnicos ──────────────────────────────────────────────────────────
  useEffect(() => {
    api.get('/tecnicos').then(({ data }) => setTecnicos(data || [])).catch(() => {});
  }, []);

  // ── Limpiar selección al cambiar de técnico/tab/rango ────────────────────────
  useEffect(() => { setSelectedIds(new Set()); }, [tab, tecnicoId, rangoRapido, desde, hasta]);

  // ── Cargar liquidaciones ─────────────────────────────────────────────────────
  const cargar = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { desde: d, hasta: h } = getRangoFechas(rangoRapido, desde, hasta);
      const params: Record<string, string> = { desde: d, hasta: h, estado: tab };
      if (tecnicoId) params.tecnico_id = tecnicoId;
      const { data } = await api.get('/liquidaciones', { params });
      setFilas(data || []);
      setSelectedIds(new Set());
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || 'Error al cargar las liquidaciones.');
    } finally {
      setLoading(false);
    }
  }, [rangoRapido, desde, hasta, tecnicoId, tab]);

  useEffect(() => { cargar(); }, [cargar]);

  // ── KPIs ─────────────────────────────────────────────────────────────────────
  const totalComisiones = filas.reduce((acc, f) => acc + f.monto_comision, 0);
  const totalManoObra   = filas.reduce((acc, f) => acc + f.total_mano_obra, 0);

  // ── Selección ────────────────────────────────────────────────────────────────
  const filasSeleccionadas = filas.filter(f => selectedIds.has(f.id));
  const totalSeleccionado  = filasSeleccionadas.reduce((acc, f) => acc + f.monto_comision, 0);
  const todosSeleccionados = filas.length > 0 && selectedIds.size === filas.length;

  const toggleFila = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleTodos = () => {
    if (todosSeleccionados) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filas.map(f => f.id)));
    }
  };

  // ── Éxito de liquidación ─────────────────────────────────────────────────────
  const handleLiquidarSuccess = () => {
    setModalOpen(false);
    setSuccessMsg(t('liquidaciones.liquidar_exito'));
    setTimeout(() => setSuccessMsg(''), 4000);
    cargar();
  };

  // ── Edición inline de PORCENTAJE ─────────────────────────────────────────────
  const startEdit = (fila: FilaLiquidacion) => {
    setEditingId(fila.id);
    const val = fila.porcentaje_aplicado % 1 === 0
      ? String(fila.porcentaje_aplicado)
      : fila.porcentaje_aplicado.toFixed(2);
    setEditValue(val);
  };

  const saveEdit = async (fila: FilaLiquidacion) => {
    const nuevoPct = parseFloat(editValue);
    if (isNaN(nuevoPct) || nuevoPct < 0 || nuevoPct > 100) { setEditingId(null); return; }
    if (nuevoPct === fila.porcentaje_aplicado) { setEditingId(null); return; }

    setSavingId(fila.id);
    setEditingId(null);
    try {
      const { data } = await api.put(`/liquidaciones/${fila.id}`, {
        porcentaje_aplicado: nuevoPct,
        total_mano_obra: fila.total_mano_obra,
      });
      setFilas(prev => prev.map(f =>
        f.id === fila.id
          ? { ...f, porcentaje_aplicado: data.porcentaje_aplicado, monto_comision: data.monto_comision }
          : f
      ));
      setSavedId(fila.id);
      setTimeout(() => setSavedId(null), 2000);
    } catch {
      setError(t('liquidaciones.error_guardar'));
    } finally {
      setSavingId(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, fila: FilaLiquidacion) => {
    if (e.key === 'Enter') saveEdit(fila);
    if (e.key === 'Escape') setEditingId(null);
  };

  // ── Asignación Masiva ────────────────────────────────────────────────────────
  const bulkApply = async () => {
    const pct = parseFloat(bulkPct);
    if (isNaN(pct) || pct < 0 || pct > 100) {
      setError(t('liquidaciones.error_invalido'));
      return;
    }
    if (filas.length === 0) return;

    const { desde: d, hasta: h } = getRangoFechas(rangoRapido, desde, hasta);
    const nombreTecnico = tecnicoId
      ? (tecnicos.find(t => t.id === tecnicoId)?.nombre ?? 'Técnico seleccionado')
      : t('liquidaciones.todos_tecnicos');
    const periodoLabel = rangoRapido === 'hoy' ? t('liquidaciones.hoy')
      : rangoRapido === 'semana' ? t('liquidaciones.semana')
      : rangoRapido === 'mes' ? t('liquidaciones.mes')
      : `${d} a ${h}`;

    const ok = window.confirm(
      `${t('liquidaciones.confirm_title')}\n\n` +
      `${t('liquidaciones.confirm_pct')} ${pct}%\n` +
      `${t('liquidaciones.confirm_tecnico')} ${nombreTecnico}\n` +
      `${t('liquidaciones.confirm_periodo')} ${periodoLabel}\n` +
      `${t('liquidaciones.confirm_afectados')} ${filas.length}\n\n` +
      `${t('liquidaciones.confirm_msg', { count: filas.length }).replace('{{count}}', filas.length.toString())}`
    );
    if (!ok) return;

    setBulkSaving(true);
    setError('');
    try {
      const payload = filas.map(f => ({ id: f.id, total_mano_obra: f.total_mano_obra }));
      const { data } = await api.put('/liquidaciones/bulk', {
        porcentaje_aplicado: pct,
        filas: payload,
      });

      const updatedMap: Record<string, { porcentaje_aplicado: number; monto_comision: number }> = {};
      (data.rows || []).forEach((r: { id: string; porcentaje_aplicado: number; monto_comision: number }) => {
        updatedMap[r.id] = r;
      });

      setFilas(prev => prev.map(f =>
        updatedMap[f.id]
          ? { ...f, porcentaje_aplicado: updatedMap[f.id].porcentaje_aplicado, monto_comision: updatedMap[f.id].monto_comision }
          : f
      ));

      setBulkSuccess(true);
      setBulkPct('');
      setTimeout(() => setBulkSuccess(false), 3000);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || t('liquidaciones.error_masiva'));
    } finally {
      setBulkSaving(false);
    }
  };

  const nombreTecnicoSeleccionado = tecnicoId
    ? (tecnicos.find(t => t.id === tecnicoId)?.nombre ?? '')
    : '';

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <>
      {modalOpen && filasSeleccionadas.length > 0 && (
        <ModalLiquidar
          filasSeleccionadas={filasSeleccionadas}
          nombreTecnico={nombreTecnicoSeleccionado}
          onClose={() => setModalOpen(false)}
          onSuccess={handleLiquidarSuccess}
        />
      )}

      <div className="max-w-7xl mx-auto space-y-8 pb-16">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
              <div className="p-2 bg-violet-100 rounded-xl">
                <DollarSign className="text-violet-600 w-7 h-7" />
              </div>
              {t('liquidaciones.title')}
            </h1>
            <p className="text-slate-500 mt-1 ml-1">{t('liquidaciones.subtitle')}</p>
          </div>
          <button
            onClick={cargar}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            {t('liquidaciones.btn_actualizar')}
          </button>
        </div>

        {/* Mensajes globales */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl flex items-center gap-3">
            <AlertCircle size={18} /><span>{error}</span>
          </div>
        )}
        {successMsg && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 p-4 rounded-xl flex items-center gap-3">
            <CheckCircle size={18} />
            <div>
              <p className="font-semibold">{successMsg}</p>
              <p className="text-sm text-emerald-600">{t('liquidaciones.liquidar_exito_desc')}</p>
            </div>
          </div>
        )}

        {/* Pestañas */}
        <div className="flex gap-1 p-1 bg-slate-100 rounded-xl w-fit">
          <button
            onClick={() => setTab('pendiente')}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === 'pendiente' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Clock size={15} />
            {t('liquidaciones.tab_pendientes')}
          </button>
          <button
            onClick={() => setTab('liquidado')}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === 'liquidado' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <History size={15} />
            {t('liquidaciones.tab_historial')}
          </button>
        </div>

        {/* Filtros */}
        <section className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 space-y-4">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">{t('liquidaciones.filtros')}</h2>
          <div className="flex flex-wrap gap-3 items-end">
            {/* Rango rápido */}
            <div className="flex gap-1 p-1 bg-slate-100 rounded-xl">
              {(['hoy', 'semana', 'mes', 'personalizado'] as RangoRapido[]).map(r => (
                <button
                  key={r}
                  onClick={() => setRangoRapido(r)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    rangoRapido === r ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {r === 'semana' ? t('liquidaciones.semana') : r === 'mes' ? t('liquidaciones.mes') : r === 'hoy' ? t('liquidaciones.hoy') : t('liquidaciones.personalizado')}
                </button>
              ))}
            </div>

            {/* Fechas personalizadas */}
            {rangoRapido === 'personalizado' && (
              <div className="flex items-center gap-2">
                {(
                  [
                    [t('liquidaciones.desde'), desde, setDesde],
                    [t('liquidaciones.hasta'), hasta, setHasta],
                  ] as [string, string, React.Dispatch<React.SetStateAction<string>>][]
                ).map(([label, val, setter]) => (
                  <div key={label} className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-slate-500">{label}</label>
                    <input type="date" value={val} onChange={e => setter(e.target.value)}
                      className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-violet-500 outline-none" />
                  </div>
                ))}
              </div>
            )}

            {/* Combobox técnico */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">{t('liquidaciones.tecnico')}</label>
              <div className="relative">
                <select value={tecnicoId} onChange={e => setTecnicoId(e.target.value)}
                  className="appearance-none border border-slate-300 rounded-lg px-3 py-2 pr-8 text-sm focus:ring-2 focus:ring-violet-500 outline-none bg-white min-w-[180px]">
                  <option value="">{t('liquidaciones.todos_tecnicos')}</option>
                  {tecnicos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                </select>
                <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>
          </div>
        </section>

        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-violet-600 text-white rounded-2xl p-6 shadow-lg shadow-violet-200">
            <p className="text-sm font-medium text-violet-200">
              {tab === 'pendiente' ? t('liquidaciones.kpi_total_pagar') : 'Total Liquidado'}
            </p>
            <p className="text-3xl font-bold mt-2 tracking-tight">{formatCOP(totalComisiones)}</p>
            <p className="text-xs text-violet-300 mt-1 flex items-center gap-1"><DollarSign size={12} /> {t('liquidaciones.kpi_total_pagar_desc')}</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <p className="text-sm font-medium text-slate-500">{t('liquidaciones.kpi_total_mo')}</p>
            <p className="text-3xl font-bold mt-2 text-slate-900 tracking-tight">{formatCOP(totalManoObra)}</p>
            <p className="text-xs text-slate-400 mt-1 flex items-center gap-1"><Wrench size={12} /> {t('liquidaciones.kpi_total_mo_desc')}</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <p className="text-sm font-medium text-slate-500">{t('liquidaciones.kpi_registros')}</p>
            <p className="text-3xl font-bold mt-2 text-slate-900 tracking-tight">{filas.length}</p>
            <p className="text-xs text-slate-400 mt-1 flex items-center gap-1"><Users size={12} /> {t('liquidaciones.kpi_registros_desc')}</p>
          </div>
        </div>

        {/* Tabla */}
        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3 flex-wrap">
            <CalendarDays size={18} className="text-slate-400" />
            <h2 className="font-semibold text-slate-800">{t('liquidaciones.detalle_title')}</h2>
            <span className="ml-auto text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
              {filas.length} {t('liquidaciones.registros')}
            </span>

            {/* Botón Liquidar — solo en pestaña pendiente con técnico seleccionado */}
            {tab === 'pendiente' && tecnicoId && selectedIds.size > 0 && (
              <button
                onClick={() => setModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold rounded-xl transition-colors"
              >
                <CreditCard size={15} />
                {t('liquidaciones.btn_liquidar')}
                <span className="bg-violet-800 text-violet-100 text-xs px-2 py-0.5 rounded-full">
                  {formatCOP(totalSeleccionado)}
                </span>
              </button>
            )}
          </div>

          {/* Aviso cuando no hay técnico seleccionado en pestaña pendiente */}
          {tab === 'pendiente' && !tecnicoId && filas.length > 0 && (
            <div className="mx-6 mt-4 mb-0 flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 px-4 py-2.5 rounded-xl text-sm">
              <AlertCircle size={15} />
              {t('liquidaciones.seleccionar_tecnico_para_liquidar')}
            </div>
          )}

          {/* Barra de Asignación Masiva (solo en pestaña pendiente) */}
          {tab === 'pendiente' && filas.length > 0 && (
            <div className={`px-6 py-3 border-b flex items-center gap-3 flex-wrap ${
              bulkSuccess ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'
            }`}>
              <div className="flex items-center gap-2">
                <Zap size={16} className={bulkSuccess ? 'text-emerald-600' : 'text-amber-600'} />
                <span className={`text-sm font-semibold ${bulkSuccess ? 'text-emerald-800' : 'text-amber-800'}`}>
                  {bulkSuccess ? t('liquidaciones.aplicado_correctamente') : t('liquidaciones.asignacion_masiva')}
                </span>
              </div>
              {!bulkSuccess && (
                <>
                  <span className="text-xs text-amber-600">
                    {t('liquidaciones.aplicar_a_visibles', { count: filas.length }).replace('{{count}}', filas.length.toString())}
                  </span>
                  <div className="flex items-center gap-1">
                    <input
                      type="number" min="0" max="100" step="0.5"
                      placeholder={t('liquidaciones.placeholder_pct')}
                      value={bulkPct}
                      onChange={e => setBulkPct(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && bulkApply()}
                      className="w-20 border-2 border-amber-300 rounded-lg px-2 py-1.5 text-sm font-bold text-center focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                    />
                    <Percent size={13} className="text-amber-500" />
                  </div>
                  <button
                    onClick={bulkApply}
                    disabled={bulkSaving || !bulkPct}
                    className="flex items-center gap-2 px-4 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold rounded-lg transition-colors disabled:opacity-50"
                  >
                    {bulkSaving
                      ? <><Loader2 size={14} className="animate-spin" /> {t('liquidaciones.aplicando')}</>
                      : <><Zap size={14} /> {t('liquidaciones.aplicar_todos')}</>}
                  </button>
                </>
              )}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={32} className="animate-spin text-violet-500" />
            </div>
          ) : filas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
              <DollarSign size={48} className="mb-3 opacity-30" />
              <p className="font-medium">
                {tab === 'liquidado' ? t('liquidaciones.sin_registros_historial') : t('liquidaciones.sin_registros')}
              </p>
              {tab === 'pendiente' && <p className="text-sm mt-1">{t('liquidaciones.sin_registros_desc')}</p>}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    {/* Checkbox seleccionar todos — solo en pestaña pendiente con técnico */}
                    {tab === 'pendiente' && tecnicoId && (
                      <th className="px-4 py-3 w-10">
                        <button onClick={toggleTodos} className="text-slate-400 hover:text-violet-600 transition-colors">
                          {todosSeleccionados
                            ? <CheckSquare size={17} className="text-violet-600" />
                            : <Square size={17} />}
                        </button>
                      </th>
                    )}
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      {tab === 'liquidado' ? t('liquidaciones.col_fecha_pago') : t('liquidaciones.col_fecha')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('liquidaciones.col_tecnico')}</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('liquidaciones.col_vehiculo')}</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('liquidaciones.col_total_mo')}</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      {t('liquidaciones.col_comision')}
                      {tab === 'pendiente' && (
                        <span className="ml-1 text-violet-400 normal-case font-normal">{t('liquidaciones.col_comision_edit')}</span>
                      )}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filas.map(fila => (
                    <tr
                      key={fila.id}
                      className={`hover:bg-slate-50/70 transition-colors ${
                        selectedIds.has(fila.id) ? 'bg-violet-50/60' : ''
                      }`}
                    >
                      {/* Checkbox por fila — solo en pestaña pendiente con técnico */}
                      {tab === 'pendiente' && tecnicoId && (
                        <td className="px-4 py-4">
                          <button
                            onClick={() => toggleFila(fila.id)}
                            className="text-slate-300 hover:text-violet-600 transition-colors"
                          >
                            {selectedIds.has(fila.id)
                              ? <CheckSquare size={17} className="text-violet-600" />
                              : <Square size={17} />}
                          </button>
                        </td>
                      )}

                      {/* Fecha */}
                      <td className="px-6 py-4 text-slate-600 whitespace-nowrap">
                        {tab === 'liquidado' && fila.fecha_pago
                          ? fila.fecha_pago
                          : formatDate(fila.fecha_entrega)}
                      </td>

                      {/* Técnico */}
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-2 font-medium text-slate-800">
                          <div className="w-7 h-7 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center font-bold text-xs uppercase">
                            {fila.nombre_tecnico.charAt(0)}
                          </div>
                          {fila.nombre_tecnico}
                        </span>
                      </td>

                      {/* Placa */}
                      <td className="px-6 py-4">
                        <span className="font-mono font-bold text-slate-800 tracking-wider bg-slate-100 px-2 py-0.5 rounded">
                          {fila.placa}
                        </span>
                      </td>

                      {/* Total MO */}
                      <td className="px-6 py-4 text-right font-medium text-slate-700">
                        {formatCOP(fila.total_mano_obra)}
                      </td>

                      {/* Comisión */}
                      <td className="px-6 py-4 text-right">
                        {/* Historial: solo mostrar, no editar */}
                        {tab === 'liquidado' ? (
                          <span className="inline-flex items-center gap-2 font-semibold text-emerald-700">
                            <CheckCircle size={14} />
                            <span className="text-slate-500">{fila.porcentaje_aplicado}%</span>
                            <span>→</span>
                            {formatCOP(fila.monto_comision)}
                          </span>
                        ) : savingId === fila.id ? (
                          <span className="flex items-center justify-end gap-2 text-slate-400">
                            <Loader2 size={14} className="animate-spin" /> {t('liquidaciones.guardando')}
                          </span>
                        ) : savedId === fila.id ? (
                          <span className="flex items-center justify-end gap-2 text-emerald-600 font-semibold">
                            <CheckCircle size={15} />
                            <span className="text-emerald-700 font-bold">{fila.porcentaje_aplicado}%</span>
                            <span className="text-slate-400">→</span>
                            <span>{formatCOP(fila.monto_comision)}</span>
                          </span>
                        ) : editingId === fila.id ? (
                          <div className="flex items-center justify-end gap-1">
                            <input
                              autoFocus
                              type="number" min="0" max="100" step="0.5"
                              value={editValue}
                              onChange={e => setEditValue(e.target.value)}
                              onBlur={() => saveEdit(fila)}
                              onKeyDown={e => handleKeyDown(e, fila)}
                              className="w-20 text-right border-2 border-violet-400 rounded-lg px-2 py-1.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-violet-300 bg-violet-50"
                            />
                            <Percent size={14} className="text-violet-500" />
                          </div>
                        ) : (
                          <button
                            onClick={() => startEdit(fila)}
                            className="inline-flex items-center gap-2 font-semibold text-violet-700 hover:text-violet-900 hover:bg-violet-50 px-3 py-1.5 rounded-lg transition-all group"
                            title="Clic para editar el porcentaje"
                          >
                            <span className="text-violet-500 font-bold text-base">
                              {fila.porcentaje_aplicado % 1 === 0
                                ? `${fila.porcentaje_aplicado}%`
                                : `${fila.porcentaje_aplicado.toFixed(2)}%`}
                            </span>
                            <span className="text-slate-400">→</span>
                            <span className="text-slate-700">{formatCOP(fila.monto_comision)}</span>
                            <span className="text-xs text-violet-300 group-hover:text-violet-500 transition-colors">✏️</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  );
};

export default ReporteLiquidaciones;
