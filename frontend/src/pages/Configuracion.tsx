import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Smartphone, Monitor, Trash2, Loader2, ShieldCheck, AlertCircle, RefreshCw, Laptop, Tablet, Bot, ToggleLeft, ToggleRight, Users, Zap, Phone, Mail, DollarSign } from 'lucide-react';
import api from '../services/api';

// ─── Types ──────────────────────────────────────────────────────────────
interface Dispositivo {
  id: string;
  device_name: string | null;
  usuario_email: string | null;
  is_active: boolean;
  last_used_at: string;
  expires_at: string;
  created_at: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────
const getDeviceIdFromToken = (): string | null => {
  try {
    const saved = localStorage.getItem('taller_auth');
    if (!saved) return null;
    const { token } = JSON.parse(saved);
    if (!token) return null;
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.device_id ?? null;
  } catch {
    return null;
  }
};

const DeviceIcon: React.FC<{ name: string | null; isCurrentDevice: boolean }> = ({ name, isCurrentDevice }) => {
  const n = (name || '').toLowerCase();
  const cls = `w-10 h-10 shrink-0 ${isCurrentDevice ? 'text-indigo-600' : 'text-slate-400'}`;
  if (n.includes('iphone') || n.includes('android')) return <Smartphone className={cls} />;
  if (n.includes('ipad') || n.includes('tablet')) return <Tablet className={cls} />;
  if (n.includes('mac') || n.includes('linux')) return <Laptop className={cls} />;
  return <Monitor className={cls} />;
};

const formatRelative = (dateStr: string, t: (k: string) => string): string => {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (mins < 2) return t('configuracion.ahora');
  if (mins < 60) return `${t('configuracion.hace')} ${mins} ${t('configuracion.minutos')}`;
  if (hours < 24) return `${t('configuracion.hace')} ${hours} ${t('configuracion.horas')}`;
  return `${t('configuracion.hace')} ${days} ${t('configuracion.dias')}`;
};

// ─── Types: Módulo IA ────────────────────────────────────────────────────
interface ConfigAI {
  activo: boolean;
  modo_precios: 'rangos' | 'exacto';
  presupuesto_diario_usd: number;
  telefono_leads: string | null;
  email_notificaciones: string | null;
}

interface LeadIA {
  id: string;
  nombre: string | null;
  telefono: string;
  vehiculo_marca: string | null;
  vehiculo_linea: string | null;
  motivo_consulta: string | null;
  cotizacion_estimada: string | null;
  estado: 'nuevo' | 'contactado' | 'agendado' | 'descartado';
  created_at: string;
}

interface UsageIA {
  fecha: string;
  presupuesto_diario_usd: number;
  consumido_usd: number;
  porcentaje: number;
  por_proveedor: { proveedor: string; costo_estimado_usd: number; requests_count: number }[];
}

const ESTADOS_LEAD: LeadIA['estado'][] = ['nuevo', 'contactado', 'agendado', 'descartado'];
const ESTADO_COLORS: Record<string, string> = {
  nuevo: 'bg-blue-100 text-blue-700',
  contactado: 'bg-yellow-100 text-yellow-700',
  agendado: 'bg-green-100 text-green-700',
  descartado: 'bg-slate-100 text-slate-500',
};

// ─── Component ───────────────────────────────────────────────────────────
const Configuracion: React.FC = () => {
  const { t } = useTranslation();

  const [dispositivos, setDispositivos] = useState<Dispositivo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revoking, setRevoking] = useState<string | null>(null);

  // ─── Estado: Módulo IA ──────────────────────────────────────────────────
  const [configAI, setConfigAI] = useState<ConfigAI | null>(null);
  const [loadingAI, setLoadingAI] = useState(true);
  const [savingAI, setSavingAI] = useState(false);
  const [leads, setLeads] = useState<LeadIA[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(true);
  const [usage, setUsage] = useState<UsageIA | null>(null);
  const [tabIA, setTabIA] = useState<'config' | 'leads'>('config');

  const currentDeviceId = getDeviceIdFromToken();

  const cargarDispositivos = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get<Dispositivo[]>('/auth/dispositivos');
      // Put current device first
      const sorted = [...data].sort((a, b) => {
        if (a.id === currentDeviceId) return -1;
        if (b.id === currentDeviceId) return 1;
        return new Date(b.last_used_at).getTime() - new Date(a.last_used_at).getTime();
      });
      setDispositivos(sorted);
    } catch {
      setError(t('configuracion.error_cargar'));
    } finally {
      setLoading(false);
    }
  }, [t, currentDeviceId]);

  // ─── Cargar datos del módulo IA ────────────────────────────────────────
  const cargarDatosIA = useCallback(async () => {
    setLoadingAI(true);
    setLoadingLeads(true);
    try {
      const [configRes, leadsRes, usageRes] = await Promise.allSettled([
        api.get<ConfigAI>('/ai/admin/config'),
        api.get<LeadIA[]>('/ai/admin/leads'),
        api.get<UsageIA>('/ai/admin/usage'),
      ]);
      if (configRes.status === 'fulfilled') setConfigAI(configRes.value.data);
      if (leadsRes.status === 'fulfilled') setLeads(leadsRes.value.data);
      if (usageRes.status === 'fulfilled') setUsage(usageRes.value.data);
    } catch { /* silencioso */ } finally {
      setLoadingAI(false);
      setLoadingLeads(false);
    }
  }, []);

  const handleGuardarConfigAI = async () => {
    if (!configAI) return;
    setSavingAI(true);
    try {
      await api.put('/ai/admin/config', configAI);
    } catch { /* silencioso */ } finally {
      setSavingAI(false);
    }
  };

  const handleEstadoLead = async (id: string, estado: LeadIA['estado']) => {
    try {
      await api.put(`/ai/admin/leads/${id}`, { estado });
      setLeads(prev => prev.map(l => l.id === id ? { ...l, estado } : l));
    } catch { /* silencioso */ }
  };

  useEffect(() => {
    cargarDispositivos();
    cargarDatosIA();
  }, [cargarDispositivos, cargarDatosIA]);

  const handleRevocar = async (id: string, name: string | null) => {
    const isCurrentDevice = id === currentDeviceId;
    const displayName = name || t('configuracion.dispositivo_desconocido');
    const confirmMsg = isCurrentDevice
      ? t('configuracion.confirm_revocar_actual')
      : `${t('configuracion.confirm_revocar')} "${displayName}"?`;

    if (!window.confirm(confirmMsg)) return;

    setRevoking(id);
    try {
      await api.delete(`/auth/dispositivos/${id}`);
      setDispositivos(prev => prev.filter(d => d.id !== id));
    } catch {
      setError(t('configuracion.error_revocar'));
    } finally {
      setRevoking(null);
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 bg-indigo-100 rounded-xl">
              <ShieldCheck className="h-6 w-6 text-indigo-600" />
            </div>
            <h1 className="text-2xl font-black text-slate-800 tracking-tight">
              {t('configuracion.titulo')}
            </h1>
          </div>
          <p className="text-slate-500 text-sm ml-14">{t('configuracion.subtitulo')}</p>
        </div>
        <button
          onClick={cargarDispositivos}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 text-sm text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 border border-slate-200 rounded-xl transition-colors disabled:opacity-50"
          title={t('configuracion.actualizar')}
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          <span className="hidden sm:inline">{t('configuracion.actualizar')}</span>
        </button>
      </div>

      {/* Info callout */}
      {!currentDeviceId && (
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3 text-sm text-amber-800">
          <AlertCircle size={16} className="shrink-0 mt-0.5 text-amber-500" />
          <span>{t('configuracion.sin_sesion_persistente')}</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-100 rounded-xl px-4 py-3 flex items-center gap-3 text-sm text-red-600">
          <AlertCircle size={16} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white border border-slate-100 rounded-2xl p-5 flex items-center gap-4 animate-pulse">
              <div className="w-10 h-10 bg-slate-200 rounded-full shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-slate-200 rounded w-1/3" />
                <div className="h-3 bg-slate-100 rounded w-1/2" />
              </div>
              <div className="w-9 h-9 bg-slate-100 rounded-xl" />
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && dispositivos.length === 0 && !error && (
        <div className="text-center py-20 bg-white border border-dashed border-slate-200 rounded-2xl">
          <Monitor className="mx-auto text-slate-300 mb-3" size={40} />
          <p className="text-slate-500 font-medium">{t('configuracion.sin_dispositivos')}</p>
          <p className="text-slate-400 text-sm mt-1">{t('configuracion.sin_dispositivos_desc')}</p>
        </div>
      )}

      {/* Device list */}
      {!loading && dispositivos.length > 0 && (
        <div className="space-y-3">
          {dispositivos.map(dispositivo => {
            const isCurrentDevice = dispositivo.id === currentDeviceId;
            const isExpired = new Date(dispositivo.expires_at) < new Date();
            const isBeingRevoked = revoking === dispositivo.id;

            return (
              <div
                key={dispositivo.id}
                className={`
                  relative bg-white border rounded-2xl p-5 flex items-center gap-4 transition-all duration-200
                  ${isCurrentDevice
                    ? 'border-indigo-200 shadow-sm shadow-indigo-100 ring-1 ring-indigo-100'
                    : 'border-slate-100 hover:border-slate-200 hover:shadow-sm'
                  }
                  ${isBeingRevoked ? 'opacity-50 pointer-events-none' : ''}
                `}
              >
                {/* Device icon */}
                <div className={`p-2.5 rounded-xl ${isCurrentDevice ? 'bg-indigo-50' : 'bg-slate-50'}`}>
                  <DeviceIcon name={dispositivo.device_name} isCurrentDevice={isCurrentDevice} />
                </div>

                {/* Device info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-800 truncate">
                      {dispositivo.device_name || t('configuracion.dispositivo_desconocido')}
                    </span>
                    {isCurrentDevice && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                        <ShieldCheck size={10} />
                        {t('configuracion.sesion_actual')}
                      </span>
                    )}
                    {isExpired && (
                      <span className="text-xs font-medium bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                        {t('configuracion.expirado')}
                      </span>
                    )}
                  </div>
                  {dispositivo.usuario_email && (
                    <p className="text-slate-500 text-xs font-medium mt-0.5 truncate">{dispositivo.usuario_email}</p>
                  )}
                  <p className="text-slate-400 text-sm mt-0.5">
                    {t('configuracion.ultimo_uso')}: {formatRelative(dispositivo.last_used_at, t)}
                  </p>
                  <p className="text-slate-300 text-xs mt-0.5">
                    {t('configuracion.expira')}: {new Date(dispositivo.expires_at).toLocaleString()}
                  </p>
                </div>

                {/* Revoke button */}
                <button
                  onClick={() => handleRevocar(dispositivo.id, dispositivo.device_name)}
                  disabled={isBeingRevoked}
                  className={`
                    p-2.5 rounded-xl border transition-colors shrink-0
                    ${isCurrentDevice
                      ? 'border-red-200 text-red-400 hover:bg-red-50 hover:text-red-600 hover:border-red-300'
                      : 'border-slate-200 text-slate-400 hover:bg-red-50 hover:text-red-600 hover:border-red-200'
                    }
                  `}
                  title={t('configuracion.revocar')}
                >
                  {isBeingRevoked
                    ? <Loader2 size={18} className="animate-spin" />
                    : <Trash2 size={18} />
                  }
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Count footer */}
      {!loading && dispositivos.length > 0 && (
        <p className="text-center text-xs text-slate-400 mt-6">
          {dispositivos.length === 1
            ? t('configuracion.un_dispositivo')
            : `${dispositivos.length} ${t('configuracion.n_dispositivos')}`
          }
        </p>
      )}

      {/* ─── Sección: Asistente Virtual IA ─────────────────────────────── */}
      <div className="mt-12">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-violet-100 rounded-xl">
            <Bot className="h-6 w-6 text-violet-600" />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-800 tracking-tight">Asistente Virtual Público</h2>
            <p className="text-slate-500 text-sm">Chatbot de cotizaciones para tu Landing Page</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 bg-slate-100 p-1 rounded-xl w-fit">
          {(['config', 'leads'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setTabIA(tab)}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                tabIA === tab ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab === 'config' ? '⚙️ Configuración' : `📋 Prospectos (${leads.filter(l => l.estado === 'nuevo').length})`}
            </button>
          ))}
        </div>

        {/* Tab: Configuración */}
        {tabIA === 'config' && (
          <div className="space-y-5">
            {/* Monitor de Consumo */}
            {usage && (
              <div className="bg-white border border-slate-100 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Zap size={15} className="text-violet-500" />
                  <span className="text-sm font-semibold text-slate-700">Consumo de hoy ({usage.fecha})</span>
                </div>
                <div className="flex items-end justify-between mb-2">
                  <span className="text-2xl font-black text-slate-800">${usage.consumido_usd.toFixed(4)}</span>
                  <span className="text-sm text-slate-400">de ${usage.presupuesto_diario_usd.toFixed(2)} USD</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2.5 mb-2">
                  <div
                    className={`h-2.5 rounded-full transition-all ${
                      usage.porcentaje >= 100 ? 'bg-red-500' :
                      usage.porcentaje >= 70 ? 'bg-amber-500' : 'bg-violet-500'
                    }`}
                    style={{ width: `${Math.min(100, usage.porcentaje)}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-slate-400">
                  <span>{usage.porcentaje}% utilizado</span>
                  <span>{usage.por_proveedor.reduce((a, b) => a + b.requests_count, 0)} conversaciones hoy</span>
                </div>
              </div>
            )}

            {loadingAI ? (
              <div className="bg-white border border-slate-100 rounded-2xl p-5 animate-pulse h-56" />
            ) : configAI ? (
              <div className="bg-white border border-slate-100 rounded-2xl p-5 space-y-5">
                {/* Activar / Pausar chatbot */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-slate-800 text-sm">Estado del Chatbot</p>
                    <p className="text-slate-500 text-xs mt-0.5">{configAI.activo ? 'Visible en tu Landing Page' : 'Oculto — no responde solicitudes'}</p>
                  </div>
                  <button
                    onClick={() => setConfigAI(p => p ? { ...p, activo: !p.activo } : p)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold border transition-all ${
                      configAI.activo
                        ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                        : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {configAI.activo ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                    {configAI.activo ? 'Activo' : 'Pausado'}
                  </button>
                </div>

                <hr className="border-slate-100" />

                {/* Modo de Precios */}
                <div>
                  <p className="font-semibold text-slate-800 text-sm mb-1">Modo de Cotización</p>
                  <p className="text-slate-500 text-xs mb-3">"Rangos" oculta tus precios exactos para protegerlos de la competencia.</p>
                  <div className="flex gap-2">
                    {(['rangos', 'exacto'] as const).map(modo => (
                      <button
                        key={modo}
                        onClick={() => setConfigAI(p => p ? { ...p, modo_precios: modo } : p)}
                        className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition-all ${
                          configAI.modo_precios === modo
                            ? 'bg-violet-600 text-white border-violet-600'
                            : 'bg-white text-slate-600 border-slate-200 hover:border-violet-300'
                        }`}
                      >
                        {modo === 'rangos' ? '🔒 Rangos de Seguridad' : '🏷️ Precios Exactos'}
                      </button>
                    ))}
                  </div>
                </div>

                <hr className="border-slate-100" />

                {/* Teléfono y Email */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5 mb-1.5">
                      <Phone size={12} /> WhatsApp de contacto
                    </label>
                    <input
                      type="tel"
                      value={configAI.telefono_leads ?? ''}
                      onChange={e => setConfigAI(p => p ? { ...p, telefono_leads: e.target.value } : p)}
                      placeholder="3001234567"
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-violet-400"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5 mb-1.5">
                      <Mail size={12} /> Email de notificaciones de leads
                    </label>
                    <input
                      type="email"
                      value={configAI.email_notificaciones ?? ''}
                      onChange={e => setConfigAI(p => p ? { ...p, email_notificaciones: e.target.value } : p)}
                      placeholder="taller@ejemplo.com"
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-violet-400"
                    />
                  </div>
                </div>

                {/* Presupuesto Diario */}
                <div>
                  <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5 mb-1.5">
                    <DollarSign size={12} /> Tope de gasto diario (USD)
                  </label>
                  <input
                    type="number"
                    min="0.10"
                    max="10"
                    step="0.10"
                    value={configAI.presupuesto_diario_usd}
                    onChange={e => setConfigAI(p => p ? { ...p, presupuesto_diario_usd: parseFloat(e.target.value) } : p)}
                    className="w-32 px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-violet-400"
                  />
                  <p className="text-xs text-slate-400 mt-1">El chatbot se pausa automáticamente si supera este monto en el día.</p>
                </div>

                {/* Guardar */}
                <button
                  onClick={handleGuardarConfigAI}
                  disabled={savingAI}
                  className="w-full py-2.5 bg-violet-600 text-white font-bold rounded-xl text-sm hover:bg-violet-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {savingAI ? <Loader2 size={16} className="animate-spin" /> : null}
                  {savingAI ? 'Guardando...' : '💾 Guardar Configuración'}
                </button>
              </div>
            ) : (
              <div className="text-center py-10 text-slate-400 text-sm bg-white border border-dashed border-slate-200 rounded-2xl">
                No se pudo cargar la configuración del Asistente Virtual.
              </div>
            )}
          </div>
        )}

        {/* Tab: Prospectos / Leads */}
        {tabIA === 'leads' && (
          <div>
            {loadingLeads ? (
              <div className="space-y-3">
                {[1,2,3].map(i => <div key={i} className="bg-white border border-slate-100 rounded-2xl p-5 animate-pulse h-20" />)}
              </div>
            ) : leads.length === 0 ? (
              <div className="text-center py-20 bg-white border border-dashed border-slate-200 rounded-2xl">
                <Users className="mx-auto text-slate-300 mb-3" size={40} />
                <p className="text-slate-500 font-medium">Aún no hay prospectos</p>
                <p className="text-slate-400 text-sm mt-1">Los clientes que dejen sus datos en el chatbot aparecerán aquí.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {leads.map(lead => (
                  <div key={lead.id} className="bg-white border border-slate-100 rounded-2xl p-4 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-semibold text-slate-800 text-sm">{lead.nombre ?? 'Sin nombre'}</span>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ESTADO_COLORS[lead.estado]}`}>
                          {lead.estado}
                        </span>
                      </div>
                      <p className="text-slate-500 text-xs">
                        📞 {lead.telefono}
                        {lead.vehiculo_marca && ` · ${lead.vehiculo_marca} ${lead.vehiculo_linea ?? ''}`}
                      </p>
                      {lead.motivo_consulta && (
                        <p className="text-slate-400 text-xs mt-0.5 truncate">{lead.motivo_consulta}</p>
                      )}
                      <p className="text-slate-300 text-xs mt-0.5">{new Date(lead.created_at).toLocaleString('es-CO')}</p>
                    </div>
                    <div className="flex flex-col gap-2 shrink-0">
                      {/* Botón de contacto por WhatsApp */}
                      <a
                        href={`https://wa.me/57${lead.telefono.replace(/\D/g, '')}?text=${encodeURIComponent(`Hola ${lead.nombre ?? ''}, te contactamos desde ${configAI?.telefono_leads ? 'el taller' : 'nuestro equipo'} por tu consulta sobre tu vehículo.`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1.5 bg-green-500 text-white rounded-lg text-xs font-semibold hover:bg-green-600 transition-colors text-center"
                      >
                        💬 WA
                      </a>
                      {/* Cambiar estado */}
                      <select
                        value={lead.estado}
                        onChange={e => handleEstadoLead(lead.id, e.target.value as LeadIA['estado'])}
                        className="text-xs border border-slate-200 rounded-lg px-1.5 py-1 focus:outline-none focus:border-violet-400 bg-white"
                      >
                        {ESTADOS_LEAD.map(est => (
                          <option key={est} value={est}>{est}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Configuracion;
