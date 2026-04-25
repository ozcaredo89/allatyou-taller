import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Printer, CheckSquare, Loader2, ArrowLeft, Plus, Trash2, Package, Wrench, MessageCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { generarLinkWhatsApp } from '../utils/whatsapp';

interface ItemFactura {
  id: string;
  tipo: 'repuesto' | 'mano_obra';
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  total: number;
}

const Checkout: React.FC = () => {
  const { id, slug } = useParams<{ id: string, slug: string }>();
  const navigate = useNavigate();
  const { empresaNombre } = useAuth();
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const isEditMode = searchParams.get('edit') === 'true';
  
  const [ingreso, setIngreso] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Facturación
  const [items, setItems] = useState<ItemFactura[]>([]);
  const [notasFactura, setNotasFactura] = useState('');

  // Nuevo ítem (form inline)
  const [showForm, setShowForm] = useState(false);
  const [nuevoTipo, setNuevoTipo] = useState<'repuesto' | 'mano_obra'>('repuesto');
  const [nuevoDesc, setNuevoDesc] = useState('');
  const [nuevoCant, setNuevoCant] = useState(1);
  const [nuevoPrecio, setNuevoPrecio] = useState(0);

  useEffect(() => { cargarIngreso(); }, [id]);

  const cargarIngreso = async () => {
    try {
      const { data } = await api.get(`/ingresos/${id}`);
      setIngreso(data);
      setItems(data.items_factura || []);
      setNotasFactura(data.notas_factura || '');
    } catch {
      setError(t('diagnostico.error_load'));
    } finally {
      setLoading(false);
    }
  };

  const agregarItem = () => {
    if (!nuevoDesc.trim() || nuevoPrecio <= 0) return;
    const newItem: ItemFactura = {
      id: crypto.randomUUID(),
      tipo: nuevoTipo,
      descripcion: nuevoDesc.trim(),
      cantidad: nuevoCant,
      precio_unitario: nuevoPrecio,
      total: nuevoCant * nuevoPrecio,
    };
    setItems(prev => [...prev, newItem]);
    setNuevoDesc(''); setNuevoCant(1); setNuevoPrecio(0); setShowForm(false);
  };

  const eliminarItem = (itemId: string) => setItems(prev => prev.filter(i => i.id !== itemId));

  const subtotal = items.reduce((acc, i) => acc + i.total, 0);
  const iva = Math.round(subtotal * 0.19);
  const total = subtotal + iva;

  const persistir = async (nuevoEstado?: string) => {
    await api.put(`/ingresos/${id}`, {
      items_factura: items,
      notas_factura: notasFactura,
      ...(nuevoEstado ? { estado: nuevoEstado } : {}),
    });
  };

  const handleEntregar = async () => {
    try {
      setSaving(true);
      if (isEditMode) {
        const snapshot = {
          fecha: new Date().toISOString(),
          items_anteriores: ingreso.items_factura || [],
          notas_anteriores: ingreso.notas_factura || ''
        };
        const historialEnmiendas = ingreso.historial_enmiendas || [];
        historialEnmiendas.push(snapshot);

        await api.put(`/ingresos/${id}`, {
          items_factura: items,
          notas_factura: notasFactura,
          historial_enmiendas: historialEnmiendas
        });
        navigate(`/${slug}/historial/${id}`);
      } else {
        await persistir('entregado');
        navigate(`/${slug}`);
      }
    } catch {
      setError('Error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 flex items-center justify-center"><Loader2 className="animate-spin text-blue-500 w-8 h-8" /></div>;
  if (!ingreso) return <div className="p-8 text-center text-red-500">Ingreso no encontrado.</div>;

  const vehiculo = ingreso.taller_vehiculos;
  const cliente = vehiculo?.taller_clientes;
  const diagnostico = ingreso.diagnostico_mecanico || {};

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      {/* Botones Header */}
      <div className="flex justify-between items-center print:hidden">
        <button onClick={() => navigate(`/${slug}`)} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200 transition-colors">
          <ArrowLeft size={20} className="text-slate-700" />
        </button>
        <div className="flex gap-3">
          <button
            onClick={() => window.open(generarLinkWhatsApp(cliente?.telefono || '', t('whatsapp.msg_listo', { nombre: cliente?.nombre_completo, taller: empresaNombre || 'TallerPro', placa: vehiculo?.placa })), '_blank')}
            className="hidden sm:flex bg-[#25D366] hover:bg-[#1ebd5a] text-white px-5 py-2 rounded-lg font-bold transition shadow-md items-center gap-2"
          >
            <MessageCircle size={18} /> {t('whatsapp.btn_avisar_listo')}
          </button>
          <button onClick={() => window.print()} className="bg-white border text-slate-700 px-5 py-2 rounded-lg font-medium shadow-sm hover:bg-slate-50 transition flex items-center gap-2">
            <Printer size={18} /> {t('checkout.btn_print')}
          </button>
          <button
            onClick={handleEntregar}
            disabled={saving || (!isEditMode && ingreso.estado === 'entregado')}
            className={`${isEditMode ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-emerald-600 hover:bg-emerald-700'} text-white px-5 py-2 rounded-lg font-bold transition shadow-md disabled:opacity-50 flex items-center gap-2`}
          >
            {saving ? <Loader2 className="animate-spin" size={18} /> : <CheckSquare size={18} />}
            {isEditMode ? 'Actualizar Orden' : t('checkout.btn_complete')}
          </button>
        </div>
      </div>

      {error && <div className="bg-red-50 text-red-600 p-4 rounded-lg border border-red-200 print:hidden">{error}</div>}

      <div className="bg-white p-8 md:p-12 border border-slate-200 rounded-2xl shadow-sm print:shadow-none print:border-none print:p-0">
        {/* Factura Header */}
        <div className="flex justify-between items-start border-b-2 border-slate-800 pb-6 mb-8">
          <div>
            <h1 className="text-4xl font-black text-slate-900 tracking-tighter uppercase">{t('checkout.title')}</h1>
            <p className="text-slate-500 font-medium">{t('checkout.orden')}{ingreso.id.substring(0, 8).toUpperCase()}</p>
          </div>
          <div className="text-right">
            <h2 className="text-xl font-bold text-slate-800">{empresaNombre || 'TallerPro'}</h2>
            <p className="text-slate-500 text-sm">NIT: 900.000.000-1</p>
          </div>
        </div>

        {/* Cliente y Vehículo */}
        <div className="grid grid-cols-2 gap-8 mb-8">
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">{t('checkout.facturado_a')}</h3>
            <p className="font-bold text-slate-800 text-lg">{cliente?.nombre_completo}</p>
            <p className="text-slate-600 text-sm">Doc: {cliente?.documento}</p>
            <p className="text-slate-600 text-sm">Tel: {cliente?.telefono}</p>
          </div>
          <div className="text-right">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">{t('checkout.vehiculo')}</h3>
            <p className="font-bold text-slate-800 text-2xl tracking-widest">{vehiculo?.placa}</p>
            <p className="text-slate-600 text-sm">{vehiculo?.marca} {vehiculo?.linea}</p>
          </div>
        </div>

        {/* Diagnóstico (read-only summary) */}
        {Object.keys(diagnostico).length > 0 && (
          <div className="mb-8">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">{t('checkout.diagnostico_realizado')}</h3>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-3 text-sm">
              {Object.entries(diagnostico).map(([key, val]: any) => {
                if (!val || (val.estado === 'buen_estado' && !val.notas && !val.fallas_comunes?.length)) return null;
                return (
                  <div key={key} className="flex gap-3 pb-2 border-b border-slate-100 last:border-0">
                    <span className="font-semibold text-slate-700 capitalize w-36 shrink-0">{t(`diagnostico.sistemas.${key}`) || key.replace(/_/g, ' ')}</span>
                    <div>
                      <span className={`text-xs font-bold uppercase ${val.estado === 'danado' ? 'text-red-600' : val.estado === 'revisar' ? 'text-amber-600' : 'text-emerald-600'}`}>{t(`estado.${val.estado}`) || val.estado?.replace('_', ' ')}</span>
                      {val.fallas_comunes?.length > 0 && <p className="text-slate-500 text-xs mt-0.5">{val.fallas_comunes.join(' · ')}</p>}
                      {val.notas && <p className="text-slate-600 mt-0.5 italic text-xs">"{val.notas}"</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Items de Factura */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">{t('checkout.servicios_y_repuestos')}</h3>
            <button onClick={() => setShowForm(v => !v)} className="print:hidden flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition">
              <Plus size={14} /> {t('checkout.btn_add_item')}
            </button>
          </div>

          {/* Form de nuevo ítem */}
          {showForm && (
            <div className="mb-4 p-4 bg-indigo-50 border border-dashed border-indigo-200 rounded-xl space-y-3 print:hidden">
              <div className="flex gap-2">
                <button onClick={() => setNuevoTipo('repuesto')} className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold border transition ${nuevoTipo === 'repuesto' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200'}`}>
                  <Package size={14} /> {t('checkout.repuesto')}
                </button>
                <button onClick={() => setNuevoTipo('mano_obra')} className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold border transition ${nuevoTipo === 'mano_obra' ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-slate-600 border-slate-200'}`}>
                  <Wrench size={14} /> {t('checkout.mano_obra')}
                </button>
              </div>
              <input type="text" placeholder={t('checkout.desc_placeholder')} value={nuevoDesc} onChange={e => setNuevoDesc(e.target.value)} className="w-full border border-slate-200 bg-white rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs text-slate-500 mb-0.5 block">{t('checkout.cantidad')}</label>
                  <input type="number" min={1} value={nuevoCant} onChange={e => setNuevoCant(Number(e.target.value))} className="w-full border border-slate-200 bg-white rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>
                <div className="flex-[2]">
                  <label className="text-xs text-slate-500 mb-0.5 block">{t('checkout.precio_unitario')}</label>
                  <input type="number" min={0} value={nuevoPrecio} onChange={e => setNuevoPrecio(Number(e.target.value))} className="w-full border border-slate-200 bg-white rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>
                <div className="flex items-end pb-0.5">
                  <span className="text-sm font-bold text-slate-700 bg-slate-100 px-3 py-2 rounded-lg whitespace-nowrap">= ${(nuevoCant * nuevoPrecio).toLocaleString('es-CO')}</span>
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">{t('diagnostico.btn_cancelar')}</button>
                <button onClick={agregarItem} className="px-4 py-2 text-sm bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition">{t('checkout.btn_add')}</button>
              </div>
            </div>
          )}

          {items.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs font-bold text-slate-400 uppercase border-b border-slate-200">
                  <th className="pb-2 text-left">{t('checkout.col_desc')}</th>
                  <th className="pb-2 text-center">{t('checkout.col_tipo')}</th>
                  <th className="pb-2 text-right">{t('checkout.col_cant')}</th>
                  <th className="pb-2 text-right">{t('checkout.col_precio')}</th>
                  <th className="pb-2 text-right">{t('checkout.col_total')}</th>
                  <th className="pb-2 print:hidden"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map(item => (
                  <tr key={item.id}>
                    <td className="py-2.5 text-slate-800 font-medium">{item.descripcion}</td>
                    <td className="py-2.5 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${item.tipo === 'repuesto' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>{item.tipo === 'repuesto' ? t('checkout.repuesto') : t('checkout.mano_obra')}</span>
                    </td>
                    <td className="py-2.5 text-right text-slate-600">{item.cantidad}</td>
                    <td className="py-2.5 text-right text-slate-600">${item.precio_unitario.toLocaleString('es-CO')}</td>
                    <td className="py-2.5 text-right font-bold text-slate-800">${item.total.toLocaleString('es-CO')}</td>
                    <td className="py-2.5 text-right print:hidden">
                      <button onClick={() => eliminarItem(item.id)} className="text-red-400 hover:text-red-600 transition p-1"><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-slate-400 italic text-sm text-center py-4 border border-dashed border-slate-200 rounded-xl">{t('checkout.no_items')}</p>
          )}
        </div>

        {/* Notas de Factura */}
        <div className="mb-8 print:hidden">
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">{t('checkout.notas_factura')}</label>
          <textarea
            className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
            rows={3}
            placeholder={t('checkout.notas_placeholder')}
            value={notasFactura}
            onChange={e => setNotasFactura(e.target.value)}
          />
        </div>
        {notasFactura && <p className="hidden print:block text-sm text-slate-500 italic mb-6 border-t border-slate-100 pt-3">{t('checkout.notas')} {notasFactura}</p>}

        {/* Totales */}
        <div className="flex justify-end border-t-2 border-slate-100 pt-6">
          <div className="w-64 space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">{t('checkout.subtotal')}</span>
              <span className="text-slate-800 font-medium">${subtotal.toLocaleString('es-CO')}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">{t('checkout.iva')}</span>
              <span className="text-slate-800 font-medium">${iva.toLocaleString('es-CO')}</span>
            </div>
            <div className="flex justify-between items-center border-t border-slate-200 pt-3 mt-2">
              <span className="text-xl font-bold text-slate-800">{t('checkout.total')}</span>
              <span className="text-2xl font-black text-indigo-700">${total.toLocaleString('es-CO')}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-12 text-center text-slate-400 text-sm">
          <p>{t('checkout.footer_1')}</p>
          <p>{t('checkout.footer_2')}{empresaNombre || 'TallerPro'}.</p>
        </div>
      </div>
    </div>
  );
};

export default Checkout;
