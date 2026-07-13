import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Plus, Trash2, Loader2, Receipt, AlertCircle, Check, X,
  Repeat, Upload, Tag, CalendarClock
} from 'lucide-react';
import api from '../services/api';

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
  taller_categorias_gastos?: Categoria;
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

const FRECUENCIAS = [
  { value: 'diario', label: 'Diario' },
  { value: 'semanal', label: 'Semanal' },
  { value: 'quincenal', label: 'Quincenal' },
  { value: 'mensual', label: 'Mensual' },
  { value: 'anual', label: 'Anual' },
];

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

  // ── Estado principal ──
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [pendientes, setPendientes] = useState<Recurrente[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // ── Filtros ──
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [filtroDesde, setFiltroDesde] = useState('');
  const [filtroHasta, setFiltroHasta] = useState('');

  // ── Modal nuevo gasto ──
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState<'unico' | 'recurrente'>('unico');
  const [saving, setSaving] = useState(false);

  // Campos del formulario (gasto único)
  const [form, setForm] = useState({
    fecha: new Date().toISOString().split('T')[0],
    categoria_id: '',
    descripcion: '',
    monto: '',
    proveedor: '',
    notas: '',
    comprobante_url: '',
  });

  // Campos del formulario (recurrente)
  const [formRec, setFormRec] = useState({
    nombre: '',
    categoria_id: '',
    monto_estimado: '',
    frecuencia: 'mensual',
    dia_del_mes: '',
    fecha_inicio: new Date().toISOString().split('T')[0],
    notas: '',
  });

  // ── Upload de comprobante ──
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  // ── Modal de confirmación de recurrente pendiente ──
  const [confirmRecurrente, setConfirmRecurrente] = useState<Recurrente | null>(null);
  const [montoConfirm, setMontoConfirm] = useState('');

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
    } catch (err) {
      console.error(err);
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

  // ── Guardar gasto único ──
  const handleGuardar = async () => {
    if (!form.descripcion.trim()) { setError('La descripción es obligatoria.'); return; }
    const monto = parseInt(form.monto.replace(/\D/g, ''), 10);
    if (!monto || monto <= 0) { setError('El monto debe ser mayor a cero.'); return; }
    try {
      setSaving(true);
      setError('');
      await api.post('/gastos', { ...form, monto, tipo: 'unico' });
      setModalOpen(false);
      resetForm();
      await cargarGastos();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Error guardando gasto.');
    } finally {
      setSaving(false);
    }
  };

  // ── Guardar plantilla recurrente ──
  const handleGuardarRecurrente = async () => {
    if (!formRec.nombre.trim()) { setError('El nombre es obligatorio.'); return; }
    const monto = parseInt(formRec.monto_estimado.replace(/\D/g, ''), 10);
    if (!monto || monto <= 0) { setError('El monto estimado debe ser mayor a cero.'); return; }
    try {
      setSaving(true);
      setError('');
      await api.post('/gastos/recurrentes', { ...formRec, monto_estimado: monto });
      setModalOpen(false);
      resetForm();
      await cargarTodo();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Error guardando plantilla.');
    } finally {
      setSaving(false);
    }
  };

  // ── Confirmar recurrente pendiente ──
  const handleConfirmarRecurrente = async () => {
    if (!confirmRecurrente) return;
    const monto = parseInt(montoConfirm.replace(/\D/g, ''), 10);
    if (!monto || monto <= 0) { setError('Ingresa un monto válido.'); return; }
    try {
      setSaving(true);
      setError('');
      await api.post('/gastos', {
        fecha: confirmRecurrente.proxima_fecha || new Date().toISOString().split('T')[0],
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
    if (!window.confirm('¿Eliminar este gasto del historial?')) return;
    try {
      await api.delete(`/gastos/${id}`);
      setGastos(g => g.filter(x => x.id !== id));
    } catch {
      setError('Error eliminando gasto.');
    }
  };

  const resetForm = () => {
    setForm({ fecha: new Date().toISOString().split('T')[0], categoria_id: '', descripcion: '', monto: '', proveedor: '', notas: '', comprobante_url: '' });
    setFormRec({ nombre: '', categoria_id: '', monto_estimado: '', frecuencia: 'mensual', dia_del_mes: '', fecha_inicio: new Date().toISOString().split('T')[0], notas: '' });
    setError('');
  };

  // ── Resumen financiero ──
  const totalGastos = gastos.reduce((acc, g) => acc + g.monto, 0);

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
          onClick={() => { setModalOpen(true); setError(''); }}
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
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col sm:flex-row sm:items-end gap-4">
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
          <input type="date" value={filtroDesde} onChange={e => setFiltroDesde(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
        </div>
        <div className="flex-1">
          <label className="block text-xs font-bold text-slate-400 uppercase mb-1">{t('gastos.hasta')}</label>
          <input type="date" value={filtroHasta} onChange={e => setFiltroHasta(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
        </div>
        <div className="bg-red-50 border border-red-100 rounded-xl px-5 py-3 text-center shrink-0">
          <p className="text-xs font-bold text-red-400 uppercase">{t('gastos.total_periodo')}</p>
          <p className="text-xl font-black text-red-600">{formatearDinero(totalGastos)}</p>
        </div>
      </div>

      {/* ── Tabla de Gastos ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {gastos.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
                  <th className="text-left px-5 py-3">{t('gastos.col_fecha')}</th>
                  <th className="text-left px-5 py-3">{t('gastos.col_descripcion')}</th>
                  <th className="text-left px-5 py-3">{t('gastos.col_categoria')}</th>
                  <th className="text-right px-5 py-3">{t('gastos.col_monto')}</th>
                  <th className="text-center px-5 py-3 print:hidden">{t('gastos.col_acciones')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {gastos.map(g => (
                  <tr key={g.id} className="hover:bg-slate-50 transition">
                    <td className="px-5 py-3 text-slate-600 whitespace-nowrap">{g.fecha}</td>
                    <td className="px-5 py-3">
                      <p className="font-medium text-slate-800">{g.descripcion}</p>
                      {g.proveedor && <p className="text-xs text-slate-400">{g.proveedor}</p>}
                      {g.tipo === 'recurrente' && (
                        <span className="inline-flex items-center gap-1 text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded mt-0.5 font-bold uppercase">
                          <Repeat size={9} /> Recurrente
                        </span>
                      )}
                      {g.comprobante_url && (
                        <a href={g.comprobante_url} target="_blank" rel="noreferrer" className="text-xs text-indigo-500 underline block mt-0.5">
                          Ver recibo
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

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* MODAL: Nuevo Gasto / Nueva Plantilla */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            {/* Header Modal */}
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-900">{t('gastos.modal_title')}</h2>
              <button onClick={() => { setModalOpen(false); resetForm(); }} className="p-1 rounded-full hover:bg-slate-100 transition">
                <X size={20} className="text-slate-500" />
              </button>
            </div>

            {/* Tabs Único / Recurrente */}
            <div className="flex gap-1 p-4 bg-slate-50 border-b border-slate-100">
              <button
                onClick={() => setModalTab('unico')}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${modalTab === 'unico' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'}`}
              >
                <Receipt size={14} className="inline mr-1" /> {t('gastos.tab_unico')}
              </button>
              <button
                onClick={() => setModalTab('recurrente')}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${modalTab === 'recurrente' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'}`}
              >
                <Repeat size={14} className="inline mr-1" /> {t('gastos.tab_recurrente')}
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
                      <select value={form.categoria_id} onChange={e => setForm(f => ({ ...f, categoria_id: e.target.value }))}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                        <option value="">{t('gastos.sin_categoria')}</option>
                        {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                      </select>
                    </div>
                  </div>
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
                        <a href={form.comprobante_url} target="_blank" rel="noreferrer" className="text-indigo-600 underline truncate">Ver archivo subido</a>
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
                        {uploading ? 'Subiendo...' : t('gastos.btn_adjuntar')}
                      </button>
                    )}
                    <input ref={fileInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={handleUpload} />
                  </div>
                </>
              )}

              {/* ────── FORM: Gasto Recurrente ────── */}
              {modalTab === 'recurrente' && (
                <>
                  <p className="text-xs text-slate-500 bg-blue-50 border border-blue-100 rounded-lg p-3">
                    <strong>Plantilla Recurrente:</strong> Define un gasto que se repite. El sistema te avisará cuando deba registrarse y tú lo confirmarás (pudiendo ajustar el monto).
                  </p>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">{t('gastos.label_nombre_rec')} *</label>
                    <input type="text" value={formRec.nombre} onChange={e => setFormRec(f => ({ ...f, nombre: e.target.value }))}
                      placeholder="Ej: Arriendo bodega, Nómina mecánicos..."
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
                        {FRECUENCIAS.map(fr => <option key={fr.value} value={fr.value}>{fr.label}</option>)}
                      </select>
                    </div>
                    {formRec.frecuencia === 'mensual' && (
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">{t('gastos.label_dia_mes')}</label>
                        <input type="number" min={1} max={31} value={formRec.dia_del_mes} onChange={e => setFormRec(f => ({ ...f, dia_del_mes: e.target.value }))}
                          placeholder="Ej: 1, 15, 30"
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
                      rows={2} placeholder="Notas opcionales..."
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
                  onClick={modalTab === 'unico' ? handleGuardar : handleGuardarRecurrente}
                  disabled={saving}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-xl font-bold text-sm transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                  {modalTab === 'unico' ? t('gastos.btn_guardar') : t('gastos.btn_crear_plantilla')}
                </button>
              </div>
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
              <p className="text-xs text-slate-400 mt-1 text-center">Puedes ajustar el monto si cambió</p>
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
