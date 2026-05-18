import React, { useEffect, useState } from 'react';
import { Car, CalendarDays, Key, FileText, CheckCircle2, Wrench, Receipt, XCircle, Loader2, AlertTriangle, History, MessageCircle, FileSearch, RotateCcw, Eye, FilePenLine, CheckSquare } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { generarLinkWhatsApp } from '../utils/whatsapp';
import CronometroInteligente from '../components/CronometroInteligente';
import ModalAsignarTecnicos from '../components/ModalAsignarTecnicos';

interface Cliente {
  id: string;
  nombre_completo: string;
  telefono: string;
}

interface Vehiculo {
  id: string;
  placa: string;
  marca: string;
  linea: string;
  taller_clientes: Cliente;
}

interface Ingreso {
  id: string;
  fecha_ingreso: string;
  estado: string;
  estado_desde?: string;
  motivo_visita: string;
  diagnostico_mecanico?: any;
  items_factura?: any[];
  notas_factura?: string;
  taller_vehiculos: Vehiculo;
  taller_ingresos_tecnicos?: { taller_tecnicos: { id: string; nombre: string } }[];
}

const estadoColors: Record<string, string> = {
  recepcion: 'bg-blue-100 text-blue-800 border-blue-200',
  diagnostico: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  cotizacion: 'bg-orange-100 text-orange-800 border-orange-200',
  esperando_aprobacion: 'bg-cyan-100 text-cyan-800 border-cyan-200',
  en_reparacion: 'bg-purple-100 text-purple-800 border-purple-200',
};

const Dashboard: React.FC = () => {
  const [ingresos, setIngresos] = useState<Ingreso[]>([]);
  const [promediosSLA, setPromediosSLA] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { slug } = useParams<{ slug: string }>();
  const { t } = useTranslation();
  const { empresaNombre } = useAuth();

  // Cancellation modal state
  const [cancelTarget, setCancelTarget] = useState<Ingreso | null>(null);
  const [motivoCancelacion, setMotivoCancelacion] = useState('');
  const [cancelling, setCancelling] = useState(false);

  // Assign technicians modal state
  const [ingresoParaAsignar, setIngresoParaAsignar] = useState<Ingreso | null>(null);

  // Ver Diagnóstico modal state
  const [ingresoVerDiag, setIngresoVerDiag] = useState<Ingreso | null>(null);

  // Ver Orden modal state (solo lectura)
  const [ingresoVerOrden, setIngresoVerOrden] = useState<Ingreso | null>(null);

  // Rediagnosticar confirm state
  const [rediagTarget, setRediagTarget] = useState<Ingreso | null>(null);
  const [rediagnosticando, setRediagnosticando] = useState(false);

  // Entregar Vehículo state
  const [entregarTarget, setEntregarTarget] = useState<Ingreso | null>(null);
  const [entregando, setEntregando] = useState(false);

  useEffect(() => { fetchIngresos(); }, []);

  const fetchIngresos = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/ingresos/activos');
      setIngresos(data?.ingresos || []);
      setPromediosSLA(data?.promediosSLA || {});
    } catch (error) {
      console.error('Error fetching ingresos:', error);
    } finally {
      setLoading(false);
    }
  };

  const confirmarCancelacion = async () => {
    if (!cancelTarget || !motivoCancelacion.trim()) return;
    try {
      setCancelling(true);
      await api.put(`/ingresos/${cancelTarget.id}`, {
        estado: 'cancelado',
        motivo_cancelacion: motivoCancelacion.trim(),
      });
      setCancelTarget(null);
      setMotivoCancelacion('');
      fetchIngresos();
    } catch (err) {
      console.error('Error cancelando:', err);
    } finally {
      setCancelling(false);
    }
  };

  const confirmarRediagnosticar = async () => {
    if (!rediagTarget) return;
    try {
      setRediagnosticando(true);
      await api.post(`/ingresos/${rediagTarget.id}/rediagnosticar`);
      const targetId = rediagTarget.id;
      setRediagTarget(null);
      fetchIngresos();
      navigate(`/${slug}/diagnostico/${targetId}`);
    } catch (err) {
      console.error('Error rediagnosticando:', err);
    } finally {
      setRediagnosticando(false);
    }
  };

  const confirmarEntrega = async () => {
    if (!entregarTarget) return;
    try {
      setEntregando(true);
      await api.put(`/ingresos/${entregarTarget.id}`, { estado: 'entregado' });
      fetchIngresos();
      setEntregarTarget(null);
    } catch (err: any) {
      alert('Error al entregar el vehículo');
    } finally {
      setEntregando(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  // Calcula totales para el modal de orden
  const calcularTotales = (ingreso: Ingreso) => {
    const items = ingreso.items_factura || [];
    const suma = items.reduce((acc: number, i: any) => acc + (i.total || 0), 0);
    return suma.toLocaleString('es-CO');
  };

  return (
    <div className="space-y-6">

      {/* ── Cancellation Modal ── */}
      {cancelTarget && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-full"><AlertTriangle size={22} className="text-red-600" /></div>
              <div>
                <h3 className="font-bold text-slate-900 text-lg">{t('cancel_modal.title')}</h3>
                <p className="text-slate-500 text-sm">{t('cancel_modal.vehicle')} <strong>{cancelTarget.taller_vehiculos?.placa}</strong></p>
              </div>
            </div>
            <p className="text-slate-600 text-sm">{t('cancel_modal.warning')}</p>
            <textarea rows={3} className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-red-500 outline-none resize-none" placeholder={t('cancel_modal.placeholder')} value={motivoCancelacion} onChange={e => setMotivoCancelacion(e.target.value)} autoFocus />
            <div className="flex gap-3 justify-end">
              <button onClick={() => { setCancelTarget(null); setMotivoCancelacion(''); }} className="px-5 py-2 border border-slate-200 rounded-lg text-slate-600 font-medium hover:bg-slate-50 transition">{t('cancel_modal.btn_back')}</button>
              <button onClick={confirmarCancelacion} disabled={cancelling || !motivoCancelacion.trim()} className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg transition disabled:opacity-50 flex items-center gap-2">
                {cancelling ? <Loader2 size={16} className="animate-spin" /> : <XCircle size={16} />}
                {t('cancel_modal.btn_confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Entregar Vehículo Modal ── */}
      {entregarTarget && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center gap-3 text-emerald-600 mb-4">
              <CheckSquare size={28} />
              <h2 className="text-xl font-bold text-slate-900">{t('checkout.btn_entregar')}</h2>
            </div>
            <p className="text-slate-600 mb-6">
              ¿Confirmas que deseas registrar la entrega del vehículo <strong>{entregarTarget.taller_vehiculos?.placa}</strong>? 
              La orden pasará al historial de vehículos entregados.
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setEntregarTarget(null)} className="px-4 py-2 border border-slate-200 rounded-lg text-slate-600 font-medium hover:bg-slate-50 transition">{t('diagnostico.btn_cancelar')}</button>
              <button onClick={confirmarEntrega} disabled={entregando} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg transition disabled:opacity-50 flex items-center gap-2">
                {entregando ? <Loader2 size={16} className="animate-spin" /> : <CheckSquare size={16} />}
                {t('checkout.btn_entregar')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Assign Technicians Modal ── */}
      {ingresoParaAsignar && (
        <ModalAsignarTecnicos
          ingresoId={ingresoParaAsignar.id}
          tecnicosAsignadosIds={(ingresoParaAsignar.taller_ingresos_tecnicos || []).map(t => t.taller_tecnicos.id)}
          onClose={() => setIngresoParaAsignar(null)}
          onSuccess={() => { setIngresoParaAsignar(null); fetchIngresos(); }}
        />
      )}

      {/* ── Ver Diagnóstico Modal (solo lectura) ── */}
      {ingresoVerDiag && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-100 rounded-full"><FileSearch size={20} className="text-indigo-600" /></div>
                <div>
                  <h3 className="font-bold text-slate-900 text-lg">Diagnóstico</h3>
                  <p className="text-slate-500 text-sm">Placa: <strong>{ingresoVerDiag.taller_vehiculos?.placa}</strong></p>
                </div>
              </div>
              <button onClick={() => setIngresoVerDiag(null)} className="text-slate-400 hover:text-slate-700 transition"><XCircle size={22} /></button>
            </div>
            <div className="bg-slate-50 rounded-xl p-4 space-y-3">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Motivo de visita</p>
                <p className="text-slate-800 text-sm leading-relaxed">{ingresoVerDiag.motivo_visita || '—'}</p>
              </div>
              {ingresoVerDiag.diagnostico_mecanico && Object.keys(ingresoVerDiag.diagnostico_mecanico).length > 0 ? (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Diagnóstico mecánico</p>
                  <div className="space-y-2">
                    {Object.entries(ingresoVerDiag.diagnostico_mecanico).map(([sistema, detalle]: [string, any]) => (
                      detalle?.estado && detalle.estado !== 'buen_estado' ? (
                        <div key={sistema} className="bg-white border border-slate-200 rounded-lg p-3">
                          <p className="font-semibold text-slate-800 capitalize text-sm">{sistema.replace(/_/g, ' ')}</p>
                          <p className="text-xs text-slate-500 mt-0.5">Estado: <span className="font-medium text-amber-600">{detalle.estado?.replace(/_/g, ' ')}</span></p>
                          {detalle.notas && <p className="text-xs text-slate-600 mt-1">"{detalle.notas}"</p>}
                        </div>
                      ) : null
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-400 italic">Sin diagnóstico mecánico registrado.</p>
              )}
            </div>
            <button onClick={() => setIngresoVerDiag(null)} className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-xl transition text-sm">Cerrar</button>
          </div>
        </div>
      )}

      {/* ── Visualizar Orden Modal (solo lectura) ── */}
      {ingresoVerOrden && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-100 rounded-full"><Receipt size={20} className="text-emerald-600" /></div>
                <div>
                  <h3 className="font-bold text-slate-900 text-lg">Orden de Servicio</h3>
                  <p className="text-slate-500 text-sm">Placa: <strong>{ingresoVerOrden.taller_vehiculos?.placa}</strong></p>
                </div>
              </div>
              <button onClick={() => setIngresoVerOrden(null)} className="text-slate-400 hover:text-slate-700 transition"><XCircle size={22} /></button>
            </div>

            <div className="bg-slate-50 rounded-xl p-4 space-y-3">
              {ingresoVerOrden.items_factura && ingresoVerOrden.items_factura.length > 0 ? (
                <>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Servicios y Repuestos</p>
                  <div className="space-y-2">
                    {ingresoVerOrden.items_factura.map((item: any) => (
                      <div key={item.id} className="bg-white border border-slate-200 rounded-lg px-3 py-2 flex justify-between items-center">
                        <div>
                          <p className="font-medium text-slate-800 text-sm">{item.descripcion}</p>
                          <p className="text-xs text-slate-500">{item.tipo === 'repuesto' ? 'Repuesto' : 'Mano de obra'} · Cant: {item.cantidad}</p>
                        </div>
                        <p className="font-bold text-slate-800 text-sm">${item.total.toLocaleString('es-CO')}</p>
                      </div>
                    ))}
                  </div>
                  <div className="border-t border-slate-200 pt-3 flex justify-between items-center">
                    <span className="font-bold text-slate-700">Total</span>
                    <span className="text-xl font-black text-indigo-700">${calcularTotales(ingresoVerOrden)}</span>
                  </div>
                </>
              ) : (
                <p className="text-sm text-slate-400 italic text-center py-2">No se han registrado ítems en la orden.</p>
              )}
              {ingresoVerOrden.notas_factura && (
                <div className="border-t border-slate-100 pt-3">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Notas</p>
                  <p className="text-sm text-slate-600 italic">"{ingresoVerOrden.notas_factura}"</p>
                </div>
              )}
            </div>
            <button onClick={() => setIngresoVerOrden(null)} className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-xl transition text-sm">Cerrar</button>
          </div>
        </div>
      )}

      {/* ── Rediagnosticar Confirm Modal ── */}
      {rediagTarget && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-full"><RotateCcw size={20} className="text-amber-600" /></div>
              <div>
                <h3 className="font-bold text-slate-900 text-lg">¿Rediagnosticar?</h3>
                <p className="text-slate-500 text-sm">Placa: <strong>{rediagTarget.taller_vehiculos?.placa}</strong></p>
              </div>
            </div>
            <p className="text-slate-600 text-sm leading-relaxed">
              El vehículo volverá al estado de <strong>Diagnóstico</strong>. El tiempo de reparación actual se guardará y el cronómetro de diagnóstico se reanudará.
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setRediagTarget(null)} className="px-5 py-2 border border-slate-200 rounded-lg text-slate-600 font-medium hover:bg-slate-50 transition">Cancelar</button>
              <button onClick={confirmarRediagnosticar} disabled={rediagnosticando} className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-lg transition disabled:opacity-50 flex items-center gap-2">
                {rediagnosticando ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />}
                Sí, rediagnosticar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">{t('dashboard.title')}</h1>
          <p className="text-slate-500 mt-1">{t('dashboard.subtitle')}</p>
        </div>
        <button onClick={() => navigate(`/${slug}/historial`)} className="flex items-center gap-2 border border-slate-200 bg-white text-slate-600 hover:text-indigo-600 hover:border-indigo-300 px-4 py-2 rounded-xl font-medium text-sm transition shadow-sm">
          <History size={16} /> {t('dashboard.btn_historial')}
        </button>
      </div>

      {/* ── Cards ── */}
      {ingresos.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center flex flex-col items-center">
          <div className="bg-slate-50 p-4 rounded-full mb-4"><CheckCircle2 size={48} className="text-slate-300" /></div>
          <h3 className="text-xl font-medium text-slate-900">{t('dashboard.no_vehicles')}</h3>
          <p className="text-slate-500 mt-2 max-w-md">{t('dashboard.no_vehicles_desc')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {ingresos.map((ingreso) => {
            const enDiagnostico = ['recepcion', 'diagnostico'].includes(ingreso.estado);
            const enOrden = ['esperando_aprobacion', 'en_reparacion'].includes(ingreso.estado);
            const tieneOrden = enOrden && Array.isArray(ingreso.items_factura) && ingreso.items_factura.length > 0;

            return (
              <div key={ingreso.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-shadow duration-300 flex flex-col">
                <div className="p-6 flex-1">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                      <div className="bg-slate-100 p-3 rounded-xl text-slate-700"><Car size={24} /></div>
                      <div>
                        <h3 className="text-xl font-bold text-slate-900 leading-tight">{ingreso.taller_vehiculos?.placa}</h3>
                        <p className="text-sm text-slate-500">{ingreso.taller_vehiculos?.marca} {ingreso.taller_vehiculos?.linea}</p>
                      </div>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${estadoColors[ingreso.estado] || 'bg-slate-100 text-slate-800 border-slate-200'}`}>
                      {t(`estado.${ingreso.estado}`)}
                    </span>
                  </div>

                  {ingreso.estado_desde && (
                    <div className="mt-2 flex justify-end">
                      <CronometroInteligente estadoDesde={ingreso.estado_desde} promedioHistorico={promediosSLA[ingreso.estado] || 0} />
                    </div>
                  )}

                  <div className="space-y-2.5 mt-4">
                    <div className="flex items-center gap-3 text-slate-600 text-sm">
                      <FileText size={15} className="text-slate-400 shrink-0" />
                      <span className="truncate" title={ingreso.motivo_visita}>
                        <span className="font-medium text-slate-900 mr-1">{t('card.motivo')}</span>{ingreso.motivo_visita}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-slate-600 text-sm">
                      <Key size={15} className="text-slate-400 shrink-0" />
                      <span>
                        <span className="font-medium text-slate-900 mr-1">{t('card.cliente')}</span>
                        {ingreso.taller_vehiculos?.taller_clientes?.nombre_completo}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-slate-600 text-sm">
                      <CalendarDays size={15} className="text-slate-400 shrink-0" />
                      <span>
                        <span className="font-medium text-slate-900 mr-1">{t('card.ingreso')}</span>
                        {new Date(ingreso.fecha_ingreso).toLocaleDateString()}
                      </span>
                    </div>
                    {ingreso.taller_ingresos_tecnicos && ingreso.taller_ingresos_tecnicos.length > 0 && (
                      <div className="flex items-start gap-3 text-slate-600 text-sm">
                        <Wrench size={15} className="text-slate-400 shrink-0 mt-0.5" />
                        <span>
                          <span className="font-medium text-slate-900 mr-1">{t('dashboard.tecnicos')}:</span>
                          {ingreso.taller_ingresos_tecnicos.map(t => t.taller_tecnicos.nombre).join(', ')}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* ── Botones de acción ── */}
                <div className="bg-slate-50 px-4 py-3 border-t border-slate-200 flex flex-wrap gap-2">

                  {/* Asignar técnicos — siempre */}
                  <button onClick={() => setIngresoParaAsignar(ingreso)} className="w-full flex items-center justify-center gap-2 border border-indigo-200 text-indigo-700 hover:bg-indigo-50 font-medium py-2 px-3 rounded-lg transition text-sm mb-1">
                    <Wrench size={15} /> {t('dashboard.asignar_tecnicos')}
                  </button>

                  {/* Botones de Diagnóstico extra: Ver diagnóstico (solo en_reparacion) + Rediagnosticar */}
                  {ingreso.estado === 'en_reparacion' && (
                    <>
                      <button onClick={() => setIngresoVerDiag(ingreso)} className="flex-1 flex items-center justify-center gap-1.5 border border-slate-200 text-slate-600 hover:bg-slate-100 font-medium py-2 px-3 rounded-lg transition text-sm" title="Ver diagnóstico">
                        <FileSearch size={15} /> Ver diagnóstico
                      </button>
                      <button onClick={() => setRediagTarget(ingreso)} className="flex-1 flex items-center justify-center gap-1.5 border border-amber-200 text-amber-700 hover:bg-amber-50 font-medium py-2 px-3 rounded-lg transition text-sm" title="Rediagnosticar">
                        <RotateCcw size={15} /> Rediagnosticar
                      </button>
                    </>
                  )}

                  {/* Botones de Orden: Visualizar + Editar (solo si ya tiene ítems guardados) */}
                  {tieneOrden && (
                    <>
                      <button onClick={() => setIngresoVerOrden(ingreso)} className="flex-1 flex items-center justify-center gap-1.5 border border-slate-200 text-slate-600 hover:bg-slate-100 font-medium py-2 px-3 rounded-lg transition text-sm">
                        <Eye size={15} /> Visualizar Orden
                      </button>
                      <button onClick={() => navigate(`/${slug}/checkout/${ingreso.id}?edit=true`)} className="flex-1 flex items-center justify-center gap-1.5 border border-indigo-200 text-indigo-700 hover:bg-indigo-50 font-medium py-2 px-3 rounded-lg transition text-sm">
                        <FilePenLine size={15} /> Editar Orden
                      </button>
                    </>
                  )}

                  {/* Cancelar — siempre */}
                  <button onClick={() => setCancelTarget(ingreso)} className="flex items-center justify-center gap-1.5 border border-red-200 text-red-600 hover:bg-red-50 font-medium py-2 px-3 rounded-lg transition text-sm flex-none" title={t('cancel_modal.title')}>
                    <XCircle size={15} />
                  </button>

                  {/* WhatsApp — siempre */}
                  <button onClick={() => window.open(generarLinkWhatsApp(ingreso.taller_vehiculos?.taller_clientes?.telefono || '', t('whatsapp.msg_proceso', { nombre: ingreso.taller_vehiculos?.taller_clientes?.nombre_completo, taller: empresaNombre || 'TallerPro', placa: ingreso.taller_vehiculos?.placa })), '_blank')} className="flex items-center justify-center gap-1.5 border border-green-200 text-green-600 hover:bg-green-50 font-medium py-2 px-3 rounded-lg transition text-sm flex-none" title={t('whatsapp.btn_contactar')}>
                    <MessageCircle size={15} />
                  </button>

                  {/* Botón principal por estado */}
                  {enDiagnostico ? (
                    <button onClick={() => navigate(`/${slug}/diagnostico/${ingreso.id}`)} className="flex-1 flex justify-center items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded-lg transition-colors text-sm">
                      <Wrench size={15} /> {t('card.btn_diagnostico')}
                    </button>
                  ) : ['cotizacion', 'en_reparacion', 'esperando_aprobacion'].includes(ingreso.estado) && !tieneOrden ? (
                    <button onClick={() => navigate(`/${slug}/checkout/${ingreso.id}`)} className="flex-1 flex justify-center items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-medium py-2 px-4 rounded-lg transition-colors text-sm">
                      <FilePenLine size={15} /> Generar Orden de Servicio
                    </button>
                  ) : ingreso.estado === 'en_reparacion' && tieneOrden ? (
                    <button onClick={() => setEntregarTarget(ingreso)} className="flex-1 flex justify-center items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2 px-4 rounded-lg transition-colors text-sm">
                      <CheckSquare size={15} /> {t('checkout.btn_entregar')}
                    </button>
                  ) : null}

                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Dashboard;
