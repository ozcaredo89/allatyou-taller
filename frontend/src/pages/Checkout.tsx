import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Printer, CheckSquare, Loader2, ArrowLeft, Plus, Trash2, Package, Wrench, MessageCircle, ThumbsUp, Edit2, Check, X, Car, Phone, FileText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

interface ItemFactura {
  id: string;
  tipo: 'repuesto' | 'mano_obra';
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  total: number;
  categoria_crm?: 'aceite' | 'frenos' | 'aire' | 'general' | null;
  justificacion?: string;
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
  const [notificando, setNotificando] = useState(false);
  const [aprobando, setAprobando] = useState(false);
  const [entregando, setEntregando] = useState(false);
  const [error, setError] = useState('');

  // Facturación
  const [items, setItems] = useState<ItemFactura[]>([]);
  const [notasFactura, setNotasFactura] = useState('');
  const [ivaIncluido, setIvaIncluido] = useState(false);

  // Nuevo ítem (form inline)
  const [showForm, setShowForm] = useState(false);
  const [nuevoTipo, setNuevoTipo] = useState<'repuesto' | 'mano_obra'>('repuesto');
  const [nuevoDesc, setNuevoDesc] = useState('');
  const [nuevoCant, setNuevoCant] = useState(1);
  const [nuevoPrecio, setNuevoPrecio] = useState<string>('');
  const [nuevoCategoria, setNuevoCategoria] = useState<ItemFactura['categoria_crm']>(null);

  // Edición inline de ítem existente
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editTipo, setEditTipo] = useState<'repuesto' | 'mano_obra'>('repuesto');
  const [editDesc, setEditDesc] = useState('');
  const [editCant, setEditCant] = useState(1);
  const [editPrecio, setEditPrecio] = useState<string>('');
  const [editCategoria, setEditCategoria] = useState<ItemFactura['categoria_crm']>(null);

  // Justificación IA por ítem
  const [justificandoItemId, setJustificandoItemId] = useState<string | null>(null);
  const [popoverItemId, setPopoverItemId] = useState<string | null>(null);

  // Fix #5: Close popover on outside click
  useEffect(() => {
    if (!popoverItemId) return;
    const handler = () => setPopoverItemId(null);
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [popoverItemId]);

  useEffect(() => { cargarIngreso(); }, [id]);

  const cargarIngreso = async () => {
    try {
      const { data } = await api.get(`/ingresos/${id}`);
      setIngreso(data);
      setItems(data.items_factura || []);
      setNotasFactura(data.notas_factura || '');
      setIvaIncluido(data.iva_incluido || false);
    } catch {
      setError(t('diagnostico.error_load'));
    } finally {
      setLoading(false);
    }
  };

  // Formatea el valor visualmente con separadores de miles
  const formatCurrencyInput = (value: string) => {
    const digitsOnly = value.replace(/\D/g, '');
    if (!digitsOnly) return '';
    return parseInt(digitsOnly, 10).toLocaleString('es-CO');
  };

  const handlePrecioChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNuevoPrecio(formatCurrencyInput(e.target.value));
  };

  const handleDescChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setNuevoDesc(val);

    const lowerVal = val.toLowerCase();
    if (lowerVal.includes('aceite')) {
      setNuevoCategoria('aceite');
    } else if (lowerVal.includes('freno') || lowerVal.includes('pastilla')) {
      setNuevoCategoria('frenos');
    } else if (lowerVal.includes('aire')) {
      setNuevoCategoria('aire');
    } else {
      setNuevoCategoria(null);
    }
  };

  const agregarItem = () => {
    const precioNumerico = parseInt(nuevoPrecio.replace(/\D/g, '') || '0', 10);
    if (!nuevoDesc.trim() || isNaN(precioNumerico) || precioNumerico < 0) return;
    const newItem: ItemFactura = {
      id: crypto.randomUUID(),
      tipo: nuevoTipo,
      descripcion: nuevoDesc.trim(),
      cantidad: nuevoCant,
      precio_unitario: precioNumerico,
      total: nuevoCant * precioNumerico,
      categoria_crm: nuevoCategoria,
    };
    setItems(prev => [...prev, newItem]);
    setNuevoDesc(''); setNuevoCant(1); setNuevoPrecio(''); setNuevoCategoria(null); setShowForm(false);
  };

  const eliminarItem = (itemId: string) => setItems(prev => prev.filter(i => i.id !== itemId));

  const startEdit = (item: ItemFactura) => {
    setEditingItemId(item.id);
    setEditTipo(item.tipo);
    setEditDesc(item.descripcion);
    setEditCant(item.cantidad);
    setEditPrecio(item.precio_unitario.toString());
    setEditCategoria(item.categoria_crm || null);
  };

  const cancelEdit = () => {
    setEditingItemId(null);
  };

  const handleJustificarRepuesto = async (item: ItemFactura) => {
    setJustificandoItemId(item.id);
    try {
      const diagnosticoTexto = ingreso?.diagnostico_mecanico
        ? Object.entries(ingreso.diagnostico_mecanico)
            .filter(([, v]: any) => v && v.estado !== 'buen_estado')
            .map(([k, v]: any) => `${k}: ${v.estado}${v.notas ? ` (${v.notas})` : ''}`)
            .join(', ')
        : '';

      const { data } = await api.post('/ai/justificar-repuesto', {
        descripcion_repuesto: item.descripcion,
        diagnostico_general: diagnosticoTexto || undefined,
      });

      setItems(prev =>
        prev.map(i =>
          i.id === item.id ? { ...i, justificacion: data.justificacion } : i
        )
      );
      setPopoverItemId(item.id);
    } catch {
      // Silencioso: el usuario puede reintentar
    } finally {
      setJustificandoItemId(null);
    }
  };

  const handleEditPrecioChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditPrecio(formatCurrencyInput(e.target.value));
  };

  const handleEditDescChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setEditDesc(val);
    const lowerVal = val.toLowerCase();
    if (lowerVal.includes('aceite')) {
      setEditCategoria('aceite');
    } else if (lowerVal.includes('freno') || lowerVal.includes('pastilla')) {
      setEditCategoria('frenos');
    } else if (lowerVal.includes('aire')) {
      setEditCategoria('aire');
    } else {
      setEditCategoria(null);
    }
  };

  const saveEdit = () => {
    if (!editingItemId) return;
    const precioNumerico = parseInt(editPrecio.replace(/\D/g, '') || '0', 10);
    if (!editDesc.trim() || isNaN(precioNumerico) || precioNumerico < 0) return;
    
    setItems(prev => prev.map(item => {
      if (item.id === editingItemId) {
        return {
          ...item,
          tipo: editTipo,
          descripcion: editDesc.trim(),
          cantidad: editCant,
          precio_unitario: precioNumerico,
          total: editCant * precioNumerico,
          categoria_crm: editCategoria,
        };
      }
      return item;
    }));
    setEditingItemId(null);
  };

  const sumaItems = items.reduce((acc, i) => acc + i.total, 0);
  const subtotal = ivaIncluido ? Math.round(sumaItems / 1.19) : sumaItems;
  const iva = ivaIncluido ? (sumaItems - subtotal) : Math.round(subtotal * 0.19);
  const total = ivaIncluido ? sumaItems : (subtotal + iva);

  // Guarda la orden y pone estado = cotizacion
  const handleGuardarOrden = async () => {
    try {
      setSaving(true);
      setError('');

      if (isEditMode) {
        // Modo edición: guarda historial de enmiendas
        const snapshot = {
          fecha: new Date().toISOString(),
          items_anteriores: ingreso.items_factura || [],
          notas_anteriores: ingreso.notas_factura || '',
          iva_incluido_anterior: ingreso.iva_incluido || false
        };
        const historialEnmiendas = ingreso.historial_enmiendas || [];
        historialEnmiendas.push(snapshot);
        const { data } = await api.put(`/ingresos/${id}`, {
          items_factura: items,
          notas_factura: notasFactura,
          iva_incluido: ivaIncluido,
          historial_enmiendas: historialEnmiendas,
        });
        setIngreso((prev: any) => ({ ...prev, ...data }));
      } else {
        // Primera vez: guarda y avanza a cotizacion
        const { data } = await api.put(`/ingresos/${id}`, {
          items_factura: items,
          notas_factura: notasFactura,
          iva_incluido: ivaIncluido,
          estado: 'cotizacion',
        });
        setIngreso((prev: any) => ({ ...prev, ...data }));
      }
    } catch {
      setError('Error al guardar la orden.');
    } finally {
      setSaving(false);
    }
  };

  // Notifica al cliente por WhatsApp con cotización detallada y enriquecida
  const handleNotificarCliente = async () => {
    // 1. Abrir pestaña inmediatamente para prevenir el bloqueo de popups del navegador
    const newWindow = window.open('about:blank', '_blank');

    try {
      setNotificando(true);
      setError('');

      const vehiculo = ingreso?.taller_vehiculos;
      const cliente = vehiculo?.taller_clientes;
      const telefono = cliente?.telefono?.replace(/[\s-]/g, '') || '';

      if (!telefono) {
        if (newWindow) newWindow.close();
        setError('El cliente no tiene un número de teléfono registrado.');
        return;
      }

      // Normalizar al formato internacional sin '+' para wa.me
      // Strips all non-digits, then prepends 57 (Colombia) only if the number
      // doesn't already carry the country code (12+ digits starting with 57).
      const soloDigitos = telefono.replace(/\D/g, '');
      const telefonoLimpio = soloDigitos.startsWith('57') && soloDigitos.length >= 12
        ? soloDigitos
        : `57${soloDigitos}`;

      const formatCOP = (valor: number) =>
        `$${Math.round(valor).toLocaleString('es-CO')}`;

      // 2. Resumen de diagnóstico mecánico relevante
      const diagnosticoMecanico = ingreso?.diagnostico_mecanico || {};
      const fallasDiagnostico = Object.entries(diagnosticoMecanico)
        .filter(([, val]: any) => val && (val.estado === 'danado' || val.estado === 'revisar' || val.notas))
        .map(([key, val]: any) => {
          const sistema = key.replace(/_/g, ' ');
          const estado = val.estado === 'danado' ? '⚠️ Requiere cambio' : '🔍 Revisión sugerida';
          const detalle = val.notas ? ` - ${val.notas}` : '';
          return `  • *${sistema.toUpperCase()}*: ${estado}${detalle}`;
        });

      const seccionDiagnostico = fallasDiagnostico.length > 0
        ? `📋 *Diagnóstico Principal:*\n${fallasDiagnostico.join('\n')}\n\n`
        : '';

      // 3. Desglose de ítems con justificaciones IA en cursiva
      const desgloseItems = items
        .map((item, idx) => {
          const lineaItem = `${idx + 1}. *${item.descripcion}* (Cant: ${item.cantidad}) - ${formatCOP(item.total)}`;
          const lineaJustificacion = item.justificacion?.trim()
            ? `\n   _${item.justificacion.trim()}_`
            : '';
          return `${lineaItem}${lineaJustificacion}`;
        })
        .join('\n\n');

      // 4. Mensaje completo con formato WhatsApp Markdown
      const mensajeWhatsApp = [
        `👋 ¡Hola *${cliente?.nombre_completo || 'Estimado(a) Cliente'}*!`,
        `Le saludamos de *${empresaNombre || 'TallerPro'}*. A continuación le compartimos el detalle y cotización del servicio para su vehículo:\n`,
        `🚗 *Vehículo:* ${vehiculo?.marca || ''} ${vehiculo?.linea || ''} ${vehiculo?.modelo_anio ? `(${vehiculo.modelo_anio})` : ''}`.trim(),
        `🏷️ *Placa:* *${vehiculo?.placa || 'N/A'}*\n`,
        seccionDiagnostico,
        `🛠️ *Desglose de Servicios y Repuestos:*`,
        desgloseItems,
        `\n--------------------------------`,
        `*Subtotal:* ${formatCOP(subtotal)}`,
        iva > 0 ? `*IVA (19%):* ${formatCOP(iva)}` : '',
        `*TOTAL:* *${formatCOP(total)}*`,
        `--------------------------------\n`,
        `¿Nos confirma si aprueba estos trabajos para proceder? ¡Quedamos muy atentos!`,
      ]
        .filter(line => line !== '')
        .join('\n');

      // 5. Guard de longitud: wa.me trunca silenciosamente mensajes muy largos
      const WA_MAX_CHARS = 3000;
      const mensajeFinal = mensajeWhatsApp.length > WA_MAX_CHARS
        ? `${mensajeWhatsApp.slice(0, WA_MAX_CHARS)}...\n_(Mensaje recortado por longitud)_`
        : mensajeWhatsApp;

      const waUrl = `https://wa.me/${telefonoLimpio}?text=${encodeURIComponent(mensajeFinal)}`;

      if (newWindow) newWindow.location.href = waUrl;

      // 6. Guardar y avanzar estado de la orden
      const nuevoEstado = ['esperando_aprobacion', 'en_reparacion', 'entregado'].includes(ingreso.estado)
        ? undefined
        : 'esperando_aprobacion';

      const { data } = await api.put(`/ingresos/${id}`, {
        items_factura: items,
        notas_factura: notasFactura,
        iva_incluido: ivaIncluido,
        ...(nuevoEstado ? { estado: nuevoEstado } : {}),
      });

      setIngreso((prev: any) => ({ ...prev, ...data }));
    } catch {
      if (newWindow) newWindow.close();
      setError('Error al notificar al cliente por WhatsApp.');
    } finally {
      setNotificando(false);
    }
  };

  // Aprueba la orden y cambia estado a en_reparacion
  const handleAprobarOrden = async () => {
    try {
      setAprobando(true);
      setError('');
      await api.put(`/ingresos/${id}`, { estado: 'en_reparacion' });
      navigate(`/${slug}`);
    } catch {
      setError('Error al aprobar la orden.');
    } finally {
      setAprobando(false);
    }
  };

  // Entrega el vehículo (flujo final desde en_reparacion)
  const handleEntregar = async () => {
    try {
      setEntregando(true);
      setError('');
      if (isEditMode) {
        navigate(`/${slug}/historial/${id}`);
      } else {
        await api.put(`/ingresos/${id}`, {
          items_factura: items,
          notas_factura: notasFactura,
          iva_incluido: ivaIncluido,
          estado: 'entregado',
        });
        navigate(`/${slug}`);
      }
    } catch {
      setError('Error al entregar.');
    } finally {
      setEntregando(false);
    }
  };

  if (loading) return <div className="p-8 flex items-center justify-center"><Loader2 className="animate-spin text-blue-500 w-8 h-8" /></div>;
  if (!ingreso) return <div className="p-8 text-center text-red-500">{t('checkout.ingreso_no_encontrado')}</div>;

  const vehiculo = ingreso.taller_vehiculos;
  const cliente = vehiculo?.taller_clientes;
  const diagnostico = ingreso.diagnostico_mecanico || {};
  const estadoActual = ingreso.estado;

  const tieneItems = items.length > 0;

  // Puede notificar siempre que haya ítems (puede reenviar cuantas veces quiera)
  const puedeNotificar = tieneItems;
  // Puede aprobar cuando la orden fue guardada (cotización) o enviada (esperando_aprobacion)
  const puedeAprobar = ['cotizacion', 'esperando_aprobacion'].includes(estadoActual);
  // Puede entregar solo cuando la orden fue aprobada Y tiene ítems
  const puedeEntregar = estadoActual === 'en_reparacion' && tieneItems;

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      {/* Botones Header */}
      <div className="flex justify-between items-center print:hidden">
        <button onClick={() => navigate(`/${slug}`)} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200 transition-colors">
          <ArrowLeft size={20} className="text-slate-700" />
        </button>
        <div className="flex gap-2 flex-wrap justify-end">

          {/* Entregar vehículo — solo cuando en_reparacion CON ítems (orden aprobada) */}
          {puedeEntregar && (
            <button
              onClick={handleEntregar}
              disabled={entregando}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-bold transition shadow-md disabled:opacity-50 flex items-center gap-2"
            >
              {entregando ? <Loader2 className="animate-spin" size={16} /> : <CheckSquare size={16} />}
              {t('checkout.btn_entregar')}
            </button>
          )}

          {/* Aprobar Orden — visible solo cuando hay ítems guardados */}
          {tieneItems && (
            <button
              onClick={handleAprobarOrden}
              disabled={!puedeAprobar || aprobando}
              title={!puedeAprobar ? 'Guarda la orden primero' : ''}
              className={`px-4 py-2 rounded-lg font-bold transition shadow-md flex items-center gap-2 ${
                puedeAprobar
                  ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed'
              }`}
            >
              {aprobando ? <Loader2 className="animate-spin" size={16} /> : <ThumbsUp size={16} />}
              {t('checkout.btn_aprobar')}
            </button>
          )}

          {/* Notificar al cliente — solo cuando cotizacion está guardada */}
          <button
            onClick={handleNotificarCliente}
            disabled={!puedeNotificar || notificando}
            title={!puedeNotificar ? 'Agrega ítems a la orden primero' : ''}
            className={`px-4 py-2 rounded-lg font-bold transition shadow-md flex items-center gap-2 ${
              puedeNotificar
                ? 'bg-[#25D366] hover:bg-[#1ebd5a] text-white'
                : 'bg-slate-100 text-slate-400 cursor-not-allowed'
            }`}
          >
            {notificando ? <Loader2 className="animate-spin" size={16} /> : <MessageCircle size={16} />}
            {t('whatsapp.btn_notificar_cotizacion')}
          </button>

          {/* Imprimir */}
          <button onClick={() => window.print()} className="bg-white border text-slate-700 px-4 py-2 rounded-lg font-medium shadow-sm hover:bg-slate-50 transition flex items-center gap-2">
            <Printer size={16} /> {t('checkout.btn_print')}
          </button>

          {/* Guardar Orden — visible siempre (permite reabrir órdenes entregadas) */}
          <button
            onClick={handleGuardarOrden}
            disabled={saving}
            className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-lg font-bold transition shadow-md disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? <Loader2 className="animate-spin" size={16} /> : <CheckSquare size={16} />}
            {isEditMode ? t('checkout.btn_actualizar') : t('checkout.btn_guardar_orden')}
          </button>

        </div>
      </div>

      {/* Banner de estado */}
      {estadoActual === 'esperando_aprobacion' && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-3 flex items-center gap-3 print:hidden">
          <MessageCircle size={18} className="text-amber-600 shrink-0" />
          <p className="text-sm text-amber-800 font-medium" dangerouslySetInnerHTML={{ __html: t('checkout.banner_esperando') }} />
        </div>
      )}

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
        <div className="flex flex-col md:flex-row justify-between items-start gap-4 mb-8 bg-slate-50 p-6 rounded-2xl border border-slate-200">
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">{t('checkout.facturado_a')}</h3>
            <p className="font-bold text-slate-800 text-lg flex items-center gap-2">{cliente?.nombre_completo}</p>
            <div className="flex items-center gap-4 mt-1 text-slate-600 text-sm">
              <span className="flex items-center gap-1"><FileText size={14} className="text-slate-400" /> {cliente?.documento || 'N/A'}</span>
              <span className="flex items-center gap-1"><Phone size={14} className="text-slate-400" /> {cliente?.telefono || 'N/A'}</span>
            </div>
          </div>
          <div className="text-left md:text-right">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">{t('checkout.vehiculo')}</h3>
            <p className="font-black text-slate-900 text-3xl tracking-widest flex items-center md:justify-end gap-2">
              <Car size={24} className="text-indigo-600 hidden md:block" /> {vehiculo?.placa}
            </p>
            <p className="font-bold text-indigo-700 bg-indigo-100 px-3 py-1 rounded-lg inline-block mt-2 text-sm border border-indigo-200 shadow-sm">
              {vehiculo?.marca} {vehiculo?.linea} {vehiculo?.modelo_anio ? ` - ${vehiculo?.modelo_anio}` : ''}
            </p>
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
              <div className="flex gap-2">
                <input type="text" placeholder={t('checkout.desc_placeholder')} value={nuevoDesc} onChange={handleDescChange} className="flex-[2] border border-slate-200 bg-white rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                <select value={nuevoCategoria || ''} onChange={e => setNuevoCategoria((e.target.value as any) || null)} className="flex-1 border border-slate-200 bg-white rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                  <option value="">{t('checkout.crm_categoria_label')}</option>
                  <option value="aceite">{t('checkout.crm_aceite')}</option>
                  <option value="frenos">{t('checkout.crm_frenos')}</option>
                  <option value="aire">{t('checkout.crm_aire')}</option>
                  <option value="general">{t('checkout.crm_general')}</option>
                </select>
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs text-slate-500 mb-0.5 block">{t('checkout.cantidad')}</label>
                  <input type="number" min={1} value={nuevoCant} onChange={e => setNuevoCant(Number(e.target.value))} className="w-full border border-slate-200 bg-white rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>
                <div className="flex-[2]">
                  <label className="text-xs text-slate-500 mb-0.5 block">{t('checkout.precio_unitario')}</label>
                  <input type="text" placeholder="0" value={nuevoPrecio} onChange={handlePrecioChange} className="w-full border border-slate-200 bg-white rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>
                <div className="flex items-end pb-0.5">
                  <span className="text-sm font-bold text-slate-700 bg-slate-100 px-3 py-2 rounded-lg whitespace-nowrap">
                    = ${(nuevoCant * (parseInt(nuevoPrecio.replace(/\D/g, '') || '0', 10))).toLocaleString('es-CO')}
                  </span>
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">{t('diagnostico.btn_cancelar')}</button>
                <button
                  onClick={agregarItem}
                  disabled={!nuevoDesc.trim() || parseInt(nuevoPrecio.replace(/\D/g, '') || '0', 10) < 0}
                  className={`px-4 py-2 text-sm font-bold rounded-lg transition ${
                    !nuevoDesc.trim() || parseInt(nuevoPrecio.replace(/\D/g, '') || '0', 10) < 0
                      ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                      : 'bg-indigo-600 text-white hover:bg-indigo-700'
                  }`}
                >
                  {t('checkout.btn_add')}
                </button>
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
                  <tr key={item.id} className={editingItemId === item.id ? 'bg-indigo-50/50' : ''}>
                    {editingItemId === item.id ? (
                      <>
                        <td className="py-2.5 px-2">
                          <div className="flex gap-2">
                            <input 
                              type="text" 
                              value={editDesc} 
                              onChange={handleEditDescChange}
                              className="w-full border border-indigo-200 bg-white rounded px-2 py-1 text-sm focus:ring-1 focus:ring-indigo-500 outline-none"
                            />
                            <select 
                              value={editCategoria || ''} 
                              onChange={e => setEditCategoria((e.target.value as any) || null)} 
                              className="w-24 border border-indigo-200 bg-white rounded px-2 py-1 text-xs focus:ring-1 focus:ring-indigo-500 outline-none"
                            >
                              <option value="">{t('checkout.crm_cat_placeholder')}</option>
                              <option value="aceite">{t('checkout.crm_aceite')}</option>
                              <option value="frenos">{t('checkout.crm_frenos')}</option>
                              <option value="aire">{t('checkout.crm_aire')}</option>
                              <option value="general">{t('checkout.crm_general')}</option>
                            </select>
                          </div>
                        </td>
                        <td className="py-2.5 text-center">
                          <select 
                            value={editTipo} 
                            onChange={e => setEditTipo(e.target.value as any)}
                            className="border border-indigo-200 bg-white rounded px-2 py-1 text-xs focus:ring-1 focus:ring-indigo-500 outline-none"
                          >
                            <option value="repuesto">{t('checkout.repuesto')}</option>
                            <option value="mano_obra">{t('checkout.mano_obra')}</option>
                          </select>
                        </td>
                        <td className="py-2.5 text-right px-2">
                          <input 
                            type="number" 
                            min={1} 
                            value={editCant} 
                            onChange={e => setEditCant(Number(e.target.value))}
                            className="w-16 border border-indigo-200 bg-white rounded px-2 py-1 text-sm text-right focus:ring-1 focus:ring-indigo-500 outline-none"
                          />
                        </td>
                        <td className="py-2.5 text-right px-2">
                          <input 
                            type="text" 
                            value={editPrecio} 
                            onChange={handleEditPrecioChange}
                            className="w-24 border border-indigo-200 bg-white rounded px-2 py-1 text-sm text-right focus:ring-1 focus:ring-indigo-500 outline-none"
                          />
                        </td>
                        <td className="py-2.5 text-right font-bold text-indigo-700 px-2">
                          ${(editCant * (parseInt(editPrecio.replace(/\D/g, '') || '0', 10))).toLocaleString('es-CO')}
                        </td>
                        <td className="py-2.5 text-right print:hidden whitespace-nowrap">
                          <button onClick={saveEdit} className="text-emerald-600 hover:text-emerald-700 transition p-1 mr-1 bg-emerald-50 rounded"><Check size={14} /></button>
                          <button onClick={cancelEdit} className="text-slate-400 hover:text-slate-600 transition p-1 bg-slate-50 rounded"><X size={14} /></button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="py-2.5 text-slate-800 font-medium px-2">
                          <div className="flex items-center gap-1.5">
                            <span>{item.descripcion}</span>
                            {item.categoria_crm && (
                              <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded uppercase font-bold tracking-wider">
                                {item.categoria_crm}
                              </span>
                            )}
                            {/* Fix #6: Zona de justificación IA — solo repuestos, solo en pantalla */}
                            {item.tipo === 'repuesto' && (
                              <span className="print:hidden relative inline-flex items-center">
                                {item.justificacion ? (
                                  // Ítem con justificación: mostrar ℹ️ + popover al hacer clic
                                  <>
                                    <button
                                      onClick={() => setPopoverItemId(popoverItemId === item.id ? null : item.id)}
                                      className="text-indigo-400 hover:text-indigo-600 transition p-0.5 rounded"
                                      title="Ver justificación"
                                    >
                                      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                                    </button>
                                    {popoverItemId === item.id && (
                                      <div
                                        className="absolute left-5 top-0 z-50 w-64 bg-white border border-indigo-200 rounded-xl shadow-xl p-3 text-xs text-slate-700 leading-relaxed"
                                        onClick={e => e.stopPropagation()}
                                        onMouseDown={e => e.stopPropagation()}
                                      >
                                        <div className="flex items-start justify-between gap-2 mb-1">
                                          <span className="font-bold text-indigo-700 text-[11px] uppercase tracking-wide">{t('checkout.ia_justificacion_titulo')}</span>
                                          <button onClick={() => setPopoverItemId(null)} className="text-slate-400 hover:text-slate-600 transition shrink-0">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                          </button>
                                        </div>
                                        <p>{item.justificacion}</p>
                                        <button
                                          onClick={() => handleJustificarRepuesto(item)}
                                          disabled={justificandoItemId === item.id}
                                          className="mt-2 text-indigo-500 hover:text-indigo-700 transition text-[11px] font-medium disabled:opacity-50"
                                        >
                                          {justificandoItemId === item.id ? t('checkout.ia_regenerando') : t('checkout.ia_regenerar')}
                                        </button>
                                      </div>
                                    )}
                                  </>
                                ) : (
                                  // Sin justificación: botón ✨ para generar
                                  <button
                                    onClick={() => handleJustificarRepuesto(item)}
                                    disabled={justificandoItemId === item.id}
                                    title="Generar justificación con IA"
                                    className="flex items-center gap-0.5 text-[11px] font-medium text-slate-400 hover:text-indigo-500 transition disabled:opacity-50 ml-0.5"
                                  >
                                    {justificandoItemId === item.id
                                      ? <><Loader2 size={11} className="animate-spin" /><span>{t('checkout.ia_generando')}</span></>
                                      : <span>✨</span>
                                    }
                                  </button>
                                )}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 text-center">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${item.tipo === 'repuesto' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>{item.tipo === 'repuesto' ? t('checkout.repuesto') : t('checkout.mano_obra')}</span>
                        </td>
                        <td className="py-2.5 text-right text-slate-600 px-2">{item.cantidad}</td>
                        <td className="py-2.5 text-right text-slate-600 px-2">${item.precio_unitario.toLocaleString('es-CO')}</td>
                        <td className="py-2.5 text-right font-bold text-slate-800 px-2">${item.total.toLocaleString('es-CO')}</td>
                        <td className="py-2.5 text-right print:hidden whitespace-nowrap">
                          <button onClick={() => startEdit(item)} className="text-indigo-400 hover:text-indigo-600 transition p-1 mr-1"><Edit2 size={14} /></button>
                          <button onClick={() => eliminarItem(item.id)} className="text-red-400 hover:text-red-600 transition p-1"><Trash2 size={14} /></button>
                        </td>
                      </>
                    )}
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
        <div className="flex flex-col items-end border-t-2 border-slate-100 pt-6">
          <div className="flex justify-end items-center mb-4 pb-4 border-b border-slate-100 print:hidden w-64">
            <label className="flex items-center gap-2 cursor-pointer text-sm font-semibold text-slate-600 hover:text-slate-900 transition select-none">
              <input type="checkbox" checked={ivaIncluido} onChange={e => setIvaIncluido(e.target.checked)} className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500" />
              {t('checkout.iva_incluido', 'Precios incluyen IVA')}
            </label>
          </div>
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
