import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Check, Loader2, Upload, AlertCircle, Plus, Link, Package } from 'lucide-react';
import api from '../services/api';
import { bogotaToday } from '../utils/dateUtils';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  ingresoId: string;
  itemId?: string | null;
  itemDescripcion?: string;
  initialTab?: 'nuevo' | 'existente';
}

const formatearMonto = (v: string) => {
  const d = v.replace(/\D/g, '');
  if (!d) return '';
  return parseInt(d, 10).toLocaleString('es-CO');
};

const formatearDinero = (monto: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(monto);

export const ModalVincularGasto: React.FC<Props> = ({
  isOpen,
  onClose,
  onSuccess,
  ingresoId,
  itemId,
  itemDescripcion,
  initialTab = 'nuevo',
}) => {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'nuevo' | 'existente'>(initialTab);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // ── Formulario nuevo gasto ──
  const [categorias, setCategorias] = useState<any[]>([]);
  const [form, setForm] = useState({
    fecha: bogotaToday(),
    categoria_id: '',
    descripcion: itemDescripcion ? `Compra ${itemDescripcion}` : '',
    monto: '',
    proveedor: '',
    notas: '',
    comprobante_url: '',
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  // ── Gastos existentes sin vincular ──
  const [gastosSinVincular, setGastosSinVincular] = useState<any[]>([]);
  const [buscandoExistentes, setBuscandoExistentes] = useState(false);
  const [soloRepuestos, setSoloRepuestos] = useState(true);

  // Reiniciar formulario cada vez que se abre el modal o cambia el ítem
  useEffect(() => {
    if (isOpen) {
      setTab(initialTab);
      setError('');
      setSoloRepuestos(true);
      setForm({
        fecha: bogotaToday(),
        categoria_id: '',
        descripcion: itemDescripcion ? `Compra ${itemDescripcion}` : '',
        monto: '',
        proveedor: '',
        notas: '',
        comprobante_url: '',
      });
      cargarCategorias();
      if (initialTab === 'existente') {
        cargarGastosSinVincular();
      }
    }
  }, [isOpen, initialTab, itemId, itemDescripcion]);

  const cargarCategorias = async () => {
    try {
      const res = await api.get('/gastos/categorias');
      const cats = res.data || [];
      setCategorias(cats);
      // Pre-seleccionar categoría 'Repuestos' si existe
      const repCat = cats.find((c: any) => c.nombre?.toLowerCase().includes('repuesto'));
      if (repCat) {
        setForm(f => ({ ...f, categoria_id: f.categoria_id || repCat.id }));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const cargarGastosSinVincular = async () => {
    setBuscandoExistentes(true);
    try {
      const res = await api.get('/gastos?sin_vincular=true&limit=50');
      const lista = res.data?.gastos || [];
      lista.sort((a: any, b: any) => {
        const aEsRep = a.taller_categorias_gastos?.nombre?.toLowerCase().includes('repuesto') ? 0 : 1;
        const bEsRep = b.taller_categorias_gastos?.nombre?.toLowerCase().includes('repuesto') ? 0 : 1;
        return aEsRep - bEsRep;
      });
      setGastosSinVincular(lista);
    } catch (err) {
      console.error(err);
    } finally {
      setBuscandoExistentes(false);
    }
  };

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

  const handleClose = () => {
    setError('');
    setForm({
      fecha: bogotaToday(),
      categoria_id: '',
      descripcion: '',
      monto: '',
      proveedor: '',
      notas: '',
      comprobante_url: '',
    });
    onClose();
  };

  // ── Guardar nuevo gasto vinculado ──
  const handleGuardarNuevo = async () => {
    if (!form.descripcion.trim()) {
      setError(t('gastos.error_descripcion'));
      return;
    }
    const monto = parseInt(form.monto.replace(/\D/g, ''), 10);
    if (!monto || monto <= 0) {
      setError(t('gastos.error_monto'));
      return;
    }

    try {
      setSaving(true);
      setError('');
      await api.post('/gastos', {
        ...form,
        monto,
        tipo: 'unico',
        ingreso_id: ingresoId,
        item_id: itemId || null,
      });
      setForm({
        fecha: bogotaToday(),
        categoria_id: '',
        descripcion: '',
        monto: '',
        proveedor: '',
        notas: '',
        comprobante_url: '',
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Error al registrar el gasto.');
    } finally {
      setSaving(false);
    }
  };

  // ── Vincular gasto existente ──
  const handleVincularExistente = async (gastoId: string) => {
    try {
      setSaving(true);
      setError('');
      await api.patch(`/gastos/${gastoId}/vinculo`, {
        ingreso_id: ingresoId,
        item_id: itemId || null,
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Error al vincular el gasto.');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header Modal */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Package size={20} className="text-indigo-600" />
              {itemId ? 'Costo de Compra del Repuesto' : 'Gasto para la Orden'}
            </h2>
            {itemDescripcion && (
              <p className="text-xs text-slate-500 mt-0.5">
                Ítem: <strong className="text-slate-700">{itemDescripcion}</strong>
              </p>
            )}
          </div>
          <button onClick={handleClose} className="p-1 rounded-full hover:bg-slate-100 transition text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-3 bg-slate-50 border-b border-slate-100">
          <button
            onClick={() => { setTab('nuevo'); setError(''); }}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
              tab === 'nuevo' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Plus size={14} /> Registrar nuevo gasto
          </button>
          <button
            onClick={() => {
              setTab('existente');
              setError('');
              if (gastosSinVincular.length === 0) cargarGastosSinVincular();
            }}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
              tab === 'existente' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Link size={14} /> Vincular gasto existente
          </button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">
              <AlertCircle size={16} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* TAB 1: REGISTRAR NUEVO GASTO */}
          {tab === 'nuevo' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-500 bg-blue-50 border border-blue-100 rounded-xl p-3">
                {t('gastos.nota_costo_venta')}
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">{t('gastos.label_fecha')} *</label>
                  <input
                    type="date"
                    value={form.fecha}
                    onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">{t('gastos.label_categoria')}</label>
                  <select
                    value={form.categoria_id}
                    onChange={e => setForm(f => ({ ...f, categoria_id: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  >
                    <option value="">{t('gastos.sin_categoria')}</option>
                    {categorias.map(c => (
                      <option key={c.id} value={c.id}>{c.nombre}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">{t('gastos.label_descripcion')} *</label>
                <input
                  type="text"
                  value={form.descripcion}
                  onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
                  placeholder={t('gastos.placeholder_descripcion')}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">{t('gastos.costo_compra')} *</label>
                  <input
                    type="text"
                    value={form.monto}
                    onChange={e => setForm(f => ({ ...f, monto: formatearMonto(e.target.value) }))}
                    placeholder="0"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">{t('gastos.label_proveedor')}</label>
                  <input
                    type="text"
                    value={form.proveedor}
                    onChange={e => setForm(f => ({ ...f, proveedor: e.target.value }))}
                    placeholder={t('gastos.placeholder_proveedor')}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">{t('gastos.label_notas')}</label>
                <textarea
                  value={form.notas}
                  onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
                  rows={2}
                  placeholder={t('gastos.placeholder_notas')}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                />
              </div>

              {/* Upload Comprobante */}
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">{t('gastos.label_comprobante')}</label>
                {form.comprobante_url ? (
                  <div className="flex items-center gap-2 text-sm bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                    <a href={form.comprobante_url} target="_blank" rel="noreferrer" className="text-indigo-600 underline truncate text-xs flex-1">
                      {t('gastos.ver_archivo')}
                    </a>
                    <button
                      type="button"
                      onClick={() => setForm(f => ({ ...f, comprobante_url: '' }))}
                      className="text-red-400 hover:text-red-600 transition"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="flex items-center gap-2 border-2 border-dashed border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-500 hover:border-indigo-300 hover:text-indigo-600 transition w-full justify-center font-medium"
                  >
                    {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                    {uploading ? t('gastos.subiendo') : t('gastos.btn_adjuntar')}
                  </button>
                )}
                <input ref={fileInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={handleUpload} />
              </div>

              <div className="flex gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleClose}
                  className="flex-1 border border-slate-200 text-slate-600 py-2.5 rounded-xl font-semibold text-sm hover:bg-slate-50 transition"
                >
                  {t('gastos.btn_cancelar')}
                </button>
                <button
                  type="button"
                  onClick={handleGuardarNuevo}
                  disabled={saving}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-xl font-bold text-sm transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                  {t('gastos.btn_guardar')}
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: VINCULAR GASTO EXISTENTE */}
          {tab === 'existente' && (() => {
            const repuestosCount = gastosSinVincular.filter(g =>
              g.taller_categorias_gastos?.nombre?.toLowerCase().includes('repuesto')
            ).length;

            const gastosMostrados = soloRepuestos
              ? gastosSinVincular.filter(g => g.taller_categorias_gastos?.nombre?.toLowerCase().includes('repuesto'))
              : gastosSinVincular;

            return (
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <p className="text-xs text-slate-500">
                    Selecciona un gasto previamente registrado para vincularlo a este ítem:
                  </p>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setSoloRepuestos(true)}
                      className={`text-xs px-2.5 py-1 rounded-lg font-semibold transition ${
                        soloRepuestos ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                      }`}
                    >
                      Repuestos ({repuestosCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setSoloRepuestos(false)}
                      className={`text-xs px-2.5 py-1 rounded-lg font-semibold transition ${
                        !soloRepuestos ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                      }`}
                    >
                      Todos ({gastosSinVincular.length})
                    </button>
                  </div>
                </div>

                {buscandoExistentes ? (
                  <div className="flex justify-center py-8">
                    <Loader2 size={24} className="animate-spin text-indigo-600" />
                  </div>
                ) : gastosMostrados.length > 0 ? (
                  <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
                    {gastosMostrados.map(g => (
                      <div
                        key={g.id}
                        className="border border-slate-200 hover:border-indigo-300 rounded-xl p-3.5 flex items-center justify-between gap-3 transition bg-white hover:bg-indigo-50/20"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-400 font-medium">{g.fecha}</span>
                            {g.taller_categorias_gastos && (
                              <span
                                className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                                style={{
                                  backgroundColor: (g.taller_categorias_gastos.color || '#6366f1') + '20',
                                  color: g.taller_categorias_gastos.color || '#6366f1',
                                }}
                              >
                                {g.taller_categorias_gastos.nombre}
                              </span>
                            )}
                          </div>
                          <p className="font-semibold text-slate-800 text-sm truncate mt-0.5">{g.descripcion}</p>
                          {g.proveedor && <p className="text-xs text-slate-400 truncate">{g.proveedor}</p>}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-black text-slate-900 text-sm">{formatearDinero(g.monto)}</p>
                          <button
                            type="button"
                            onClick={() => handleVincularExistente(g.id)}
                            disabled={saving}
                            className="mt-1 bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white text-xs font-bold px-3 py-1.5 rounded-lg transition disabled:opacity-50"
                          >
                            Vincular
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : soloRepuestos && gastosSinVincular.length > 0 ? (
                  <div className="text-center py-6 bg-slate-50 rounded-xl border border-dashed border-slate-200 p-4">
                    <p className="text-xs text-slate-500 mb-2">No hay gastos disponibles con la categoría "Repuestos".</p>
                    <button
                      type="button"
                      onClick={() => setSoloRepuestos(false)}
                      className="text-xs text-indigo-600 font-bold hover:underline"
                    >
                      Ver gastos de otras categorías ({gastosSinVincular.length} disponibles)
                    </button>
                  </div>
                ) : (
                  <div className="text-center py-8 text-slate-400">
                    <Package size={32} className="mx-auto opacity-30 mb-2" />
                    <p className="text-xs font-semibold">{t('gastos.ningun_gasto_disponible')}</p>
                  </div>
                )}

                <div className="pt-2 border-t border-slate-100 flex justify-end">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl font-semibold text-xs hover:bg-slate-50 transition"
                  >
                    {t('gastos.btn_cancelar')}
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
};
