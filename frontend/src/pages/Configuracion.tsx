import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Smartphone, Monitor, Trash2, Loader2, ShieldCheck, AlertCircle, RefreshCw, Laptop, Tablet } from 'lucide-react';
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

// ─── Component ───────────────────────────────────────────────────────────
const Configuracion: React.FC = () => {
  const { t } = useTranslation();

  const [dispositivos, setDispositivos] = useState<Dispositivo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revoking, setRevoking] = useState<string | null>(null);

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

  useEffect(() => {
    cargarDispositivos();
  }, [cargarDispositivos]);

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
    </div>
  );
};

export default Configuracion;
