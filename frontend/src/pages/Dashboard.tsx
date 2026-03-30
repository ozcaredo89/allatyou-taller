import React, { useEffect, useState } from 'react';
import { Car, CalendarDays, Key, FileText, CheckCircle2, Wrench, Receipt, XCircle, Loader2, AlertTriangle, History, MessageCircle } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { generarLinkWhatsApp } from '../utils/whatsapp';

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
  motivo_visita: string;
  tecnico_asignado?: string;
  taller_vehiculos: Vehiculo;
}

const estadoColors: Record<string, string> = {
  recepcion: 'bg-blue-100 text-blue-800 border-blue-200',
  diagnostico: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  en_reparacion: 'bg-purple-100 text-purple-800 border-purple-200',
  cotizacion: 'bg-orange-100 text-orange-800 border-orange-200',
};

const Dashboard: React.FC = () => {
  const [ingresos, setIngresos] = useState<Ingreso[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { slug } = useParams<{ slug: string }>();
  const { t } = useTranslation();
  const { empresaNombre } = useAuth();

  // Cancellation modal state
  const [cancelTarget, setCancelTarget] = useState<Ingreso | null>(null);
  const [motivoCancelacion, setMotivoCancelacion] = useState('');
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => { fetchIngresos(); }, []);

  const fetchIngresos = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/ingresos/activos');
      setIngresos(data || []);
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

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Cancellation Modal */}
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
            <textarea
              rows={3}
              className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-red-500 outline-none resize-none"
              placeholder={t('cancel_modal.placeholder')}
              value={motivoCancelacion}
              onChange={e => setMotivoCancelacion(e.target.value)}
              autoFocus
            />
            <div className="flex gap-3 justify-end">
              <button onClick={() => { setCancelTarget(null); setMotivoCancelacion(''); }} className="px-5 py-2 border border-slate-200 rounded-lg text-slate-600 font-medium hover:bg-slate-50 transition">
                {t('cancel_modal.btn_back')}
              </button>
              <button
                onClick={confirmarCancelacion}
                disabled={cancelling || !motivoCancelacion.trim()}
                className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg transition disabled:opacity-50 flex items-center gap-2"
              >
                {cancelling ? <Loader2 size={16} className="animate-spin" /> : <XCircle size={16} />}
                {t('cancel_modal.btn_confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">{t('dashboard.title')}</h1>
          <p className="text-slate-500 mt-1">{t('dashboard.subtitle')}</p>
        </div>
        <button
          onClick={() => navigate(`/${slug}/historial`)}
          className="flex items-center gap-2 border border-slate-200 bg-white text-slate-600 hover:text-indigo-600 hover:border-indigo-300 px-4 py-2 rounded-xl font-medium text-sm transition shadow-sm"
        >
          <History size={16} /> {t('dashboard.btn_historial')}
        </button>
      </div>

      {ingresos.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center flex flex-col items-center">
          <div className="bg-slate-50 p-4 rounded-full mb-4">
            <CheckCircle2 size={48} className="text-slate-300" />
          </div>
          <h3 className="text-xl font-medium text-slate-900">{t('dashboard.no_vehicles')}</h3>
          <p className="text-slate-500 mt-2 max-w-md">{t('dashboard.no_vehicles_desc')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {ingresos.map((ingreso) => (
            <div key={ingreso.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-shadow duration-300 flex flex-col">
              <div className="p-6 flex-1">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    <div className="bg-slate-100 p-3 rounded-xl text-slate-700">
                      <Car size={24} />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-slate-900 leading-tight">
                        {ingreso.taller_vehiculos?.placa}
                      </h3>
                      <p className="text-sm text-slate-500">
                        {ingreso.taller_vehiculos?.marca} {ingreso.taller_vehiculos?.linea}
                      </p>
                    </div>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${estadoColors[ingreso.estado] || 'bg-slate-100 text-slate-800 border-slate-200'}`}>
                    {t(`estado.${ingreso.estado}`)}
                  </span>
                </div>

                <div className="space-y-2.5 mt-4">
                  <div className="flex items-center gap-3 text-slate-600 text-sm">
                    <FileText size={15} className="text-slate-400 shrink-0" />
                    <span className="truncate" title={ingreso.motivo_visita}>
                      <span className="font-medium text-slate-900 mr-1">{t('card.motivo')}</span>
                      {ingreso.motivo_visita}
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
                  {ingreso.tecnico_asignado && (
                    <div className="flex items-center gap-3 text-slate-600 text-sm">
                      <Wrench size={15} className="text-slate-400 shrink-0" />
                      <span>{t('card.tecnico')} <strong>{ingreso.tecnico_asignado}</strong></span>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-slate-50 px-4 py-3 border-t border-slate-200 flex gap-2">
                <button
                  onClick={() => setCancelTarget(ingreso)}
                  className="flex items-center justify-center gap-1.5 border border-red-200 text-red-600 hover:bg-red-50 font-medium py-2 px-3 rounded-lg transition text-sm flex-none"
                  title={t('cancel_modal.title')}
                >
                  <XCircle size={15} />
                </button>
                <button
                  onClick={() => window.open(generarLinkWhatsApp(ingreso.taller_vehiculos?.taller_clientes?.telefono || '', t('whatsapp.msg_proceso', { nombre: ingreso.taller_vehiculos?.taller_clientes?.nombre_completo, taller: empresaNombre || 'TallerPro', placa: ingreso.taller_vehiculos?.placa })), '_blank')}
                  className="flex items-center justify-center gap-1.5 border border-green-200 text-green-600 hover:bg-green-50 font-medium py-2 px-3 rounded-lg transition text-sm flex-none"
                  title={t('whatsapp.btn_contactar')}
                >
                  <MessageCircle size={15} />
                </button>
                {['recepcion', 'diagnostico'].includes(ingreso.estado) ? (
                  <button
                    onClick={() => navigate(`/${slug}/diagnostico/${ingreso.id}`)}
                    className="flex-1 flex justify-center items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded-lg transition-colors text-sm"
                  >
                    <Wrench size={15} /> {t('card.btn_diagnostico')}
                  </button>
                ) : (
                  <button
                    onClick={() => navigate(`/${slug}/checkout/${ingreso.id}`)}
                    className="flex-1 flex justify-center items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2 px-4 rounded-lg transition-colors text-sm"
                  >
                    <Receipt size={15} /> {t('card.btn_checkout')}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Dashboard;
