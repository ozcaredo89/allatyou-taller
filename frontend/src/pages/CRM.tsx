import React, { useEffect, useState, useCallback } from 'react';
import {
  Target, Search, Phone, Loader2, MessageCircle,
  Star, CheckCircle2, Clock, Undo2, Settings2,
  AlertTriangle, BellOff, ChevronDown, ChevronUp,
  RefreshCw, Save, X
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import { generarLinkWhatsApp } from '../utils/whatsapp';
import { useAuth } from '../context/AuthContext';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface CrmConfig {
  nombre: string;
  google_review_url: string | null;
  config_crm_intervalos: {
    aceite: { meses: number; km: number };
    frenos: { meses: number; km: number };
    aire: { meses: number; km: number };
    general: { meses: number; km: number };
  };
}

interface ResenaIngreso {
  id: string;
  fecha_ingreso: string;
  resena_estado: 'pendiente' | 'intentado' | 'confirmado';
  resena_solicitada_at: string | null;
  updated_at: string;
  motivo_visita?: string;
  items_factura?: Array<{ descripcion: string }>;
  taller_vehiculos: {
    id: string;
    placa: string;
    marca: string;
    linea: string;
    taller_clientes: {
      id: string;
      nombre_completo: string;
      telefono: string;
      acepta_whatsapp: boolean;
      ultima_resena_solicitada_at: string | null;
    };
  };
}

interface ServicioVencimiento {
  categoria: string;
  ultima_fecha: string;
  ultimo_kilometraje: number;
  fecha_sugerida: string;
  kilometraje_sugerido: number;
  is_vencido: boolean;
}

interface ProspectoAgrupado {
  vehiculo_id: string;
  placa: string;
  marca: string;
  linea: string;
  cliente_id: string;
  cliente_nombre: string;
  cliente_telefono: string;
  empresa_id: string;
  servicios: ServicioVencimiento[];
  fecha_sugerida_min: string;
  algun_vencido: boolean;
}

type Tab = 'resenas' | 'retencion';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const categoriaLabel: Record<string, string> = {
  aceite: 'Cambio de Aceite',
  frenos: 'Revisión de Frenos',
  aire: 'Aire Acondicionado',
  general: 'Mantenimiento General',
};

const categoriaBadgeColor: Record<string, string> = {
  aceite: 'bg-amber-100 text-amber-700',
  frenos: 'bg-red-100 text-red-700',
  aire: 'bg-sky-100 text-sky-700',
  general: 'bg-slate-100 text-slate-600',
};

function formatFecha(iso: string) {
  return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}

function normalizePhone(telefono: string): string {
  const soloDigitos = telefono.replace(/\D/g, '');
  return soloDigitos.startsWith('57') && soloDigitos.length >= 12
    ? soloDigitos
    : `57${soloDigitos}`;
}

// ─── Componente Principal ─────────────────────────────────────────────────────

const CRM: React.FC = () => {
  const { t } = useTranslation();
  const { empresaNombre } = useAuth();

  const [tab, setTab] = useState<Tab>('resenas');
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Config
  const [config, setConfig] = useState<CrmConfig | null>(null);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [configLoading, setConfigLoading] = useState(false);
  const [editGoogleUrl, setEditGoogleUrl] = useState('');
  const [editIntervalos, setEditIntervalos] = useState<CrmConfig['config_crm_intervalos'] | null>(null);

  // Reseñas
  const [resenas, setResenas] = useState<ResenaIngreso[]>([]);
  const [loadingResenas, setLoadingResenas] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Retención
  const [prospectos, setProspectos] = useState<ProspectoAgrupado[]>([]);
  const [loadingRetencion, setLoadingRetencion] = useState(false);
  const [expandedProspecto, setExpandedProspecto] = useState<string | null>(null);

  // ─── Carga de datos ──────────────────────────────────────────────────────────

  const cargarConfig = useCallback(async () => {
    try {
      const { data } = await api.get('/crm/config');
      setConfig(data);
      setEditGoogleUrl(data.google_review_url || '');
      setEditIntervalos(data.config_crm_intervalos);
    } catch (e) {
      console.error('[CRM] Error cargando config:', e);
    }
  }, []);

  const cargarResenas = useCallback(async () => {
    setLoadingResenas(true);
    try {
      const { data } = await api.get('/crm/resenas');
      setResenas(data || []);
    } catch (e) {
      console.error('[CRM] Error cargando reseñas:', e);
    } finally {
      setLoadingResenas(false);
    }
  }, []);

  const cargarRetencion = useCallback(async () => {
    setLoadingRetencion(true);
    try {
      const { data } = await api.get('/crm/retencion');
      setProspectos(data || []);
    } catch (e) {
      console.error('[CRM] Error cargando retención:', e);
    } finally {
      setLoadingRetencion(false);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await cargarConfig();
      setLoading(false);
    };
    init();
  }, [cargarConfig]);

  useEffect(() => {
    if (tab === 'resenas') cargarResenas();
    if (tab === 'retencion') cargarRetencion();
  }, [tab, cargarResenas, cargarRetencion]);

  // ─── Acciones Reseñas ─────────────────────────────────────────────────────────

  const handleAbrirWhatsAppResena = async (ingreso: ResenaIngreso) => {
    const cliente = ingreso.taller_vehiculos.taller_clientes;
    const vehiculo = ingreso.taller_vehiculos;
    const nombreTaller = config?.nombre || empresaNombre;
    const googleUrl = config?.google_review_url;

    const mensaje = `Hola ${cliente.nombre_completo}, te saluda el equipo de ${nombreTaller}. Gracias por confiar en nosotros con tu ${vehiculo.marca} ${vehiculo.linea} (Placa ${vehiculo.placa}) 🙌${googleUrl ? `\n\nSi tienes un minuto, nos ayudaría muchísimo tu opinión en Google: ${googleUrl}` : ''}\n\nY si algo no quedó como esperabas, cuéntanos por aquí mismo y lo solucionamos de inmediato. 🔧`;

    window.open(generarLinkWhatsApp(cliente.telefono, mensaje), '_blank');

    // Marcar como "intentado" (no enviado aún — el usuario debe confirmar)
    setUpdatingId(ingreso.id);
    try {
      await api.post(`/crm/resenas/${ingreso.id}/intentar`);
      setResenas(prev =>
        prev.map(r => r.id === ingreso.id
          ? { ...r, resena_estado: 'intentado', resena_solicitada_at: new Date().toISOString() }
          : r
        )
      );
    } catch (e) {
      console.error('[CRM] Error marcando intentado:', e);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleConfirmarResena = async (ingreso: ResenaIngreso) => {
    setUpdatingId(ingreso.id);
    try {
      await api.post(`/crm/resenas/${ingreso.id}/confirmar`);
      setResenas(prev =>
        prev.map(r => r.id === ingreso.id
          ? { ...r, resena_estado: 'confirmado', resena_solicitada_at: new Date().toISOString() }
          : r
        )
      );
    } catch (e) {
      console.error('[CRM] Error confirmando reseña:', e);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDeshacerResena = async (ingreso: ResenaIngreso) => {
    setUpdatingId(ingreso.id);
    try {
      await api.post(`/crm/resenas/${ingreso.id}/deshacer`);
      setResenas(prev =>
        prev.map(r => r.id === ingreso.id
          ? { ...r, resena_estado: 'pendiente', resena_solicitada_at: null }
          : r
        )
      );
    } catch (e) {
      console.error('[CRM] Error deshaciendo reseña:', e);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleNoContactar = async (clienteId: string, ingresosIds: string[]) => {
    if (!window.confirm('¿Dar de baja a este cliente de mensajes de WhatsApp? Se excluirá de ambas pestañas de CRM (Ley 1581).')) return;
    try {
      await api.patch(`/crm/clientes/${clienteId}/no-contactar`, { acepta_whatsapp: false });
      // Eliminar de ambas listas localmente
      setResenas(prev => prev.filter(r => r.taller_vehiculos.taller_clientes.id !== clienteId));
      setProspectos(prev => prev.filter(p => p.cliente_id !== clienteId));
    } catch (e) {
      console.error('[CRM] Error actualizando no contactar:', e);
    }
  };

  // ─── Acciones Retención ──────────────────────────────────────────────────────

  const handleWhatsAppRetencion = (prospecto: ProspectoAgrupado) => {
    const nombreTaller = config?.nombre || empresaNombre;
    const serviciosTexto = prospecto.servicios
      .map(s => `*${(categoriaLabel[s.categoria] || s.categoria).toUpperCase()}*`)
      .join(' y ');

    const algunoVencido = prospecto.algun_vencido;
    const mensaje = `Hola ${prospecto.cliente_nombre}, te saludamos de ${nombreTaller}.\n\nNotamos que ya ${algunoVencido ? 'venció' : 'se acerca'} el tiempo sugerido para el mantenimiento de tu ${prospecto.marca} ${prospecto.linea} (Placa ${prospecto.placa}), específicamente para: ${serviciosTexto}.\n\n¿Te gustaría agendar una cita para revisarlo? 🔧`;

    window.open(generarLinkWhatsApp(prospecto.cliente_telefono, mensaje), '_blank');
  };

  // ─── Guardar config ───────────────────────────────────────────────────────────

  const handleGuardarConfig = async () => {
    setConfigLoading(true);
    try {
      await api.put('/crm/config', {
        google_review_url: editGoogleUrl.trim() || null,
        config_crm_intervalos: editIntervalos,
      });
      await cargarConfig();
      setShowConfigModal(false);
    } catch (e) {
      console.error('[CRM] Error guardando config:', e);
    } finally {
      setConfigLoading(false);
    }
  };

  // ─── Filtros ──────────────────────────────────────────────────────────────────

  const resenasFiltradas = resenas.filter(r => {
    const cliente = r.taller_vehiculos.taller_clientes;
    const vehiculo = r.taller_vehiculos;
    const q = searchTerm.toLowerCase();
    return (
      cliente.nombre_completo?.toLowerCase().includes(q) ||
      vehiculo.placa?.toLowerCase().includes(q)
    );
  });

  const prospectosFiltrados = prospectos.filter(p => {
    const q = searchTerm.toLowerCase();
    return (
      p.cliente_nombre?.toLowerCase().includes(q) ||
      p.placa?.toLowerCase().includes(q)
    );
  });

  // ─── Render ───────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="animate-spin text-indigo-500 w-10 h-10" />
      </div>
    );
  }

  const noGoogleUrl = !config?.google_review_url;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
            <div className="p-2 bg-indigo-100 rounded-xl">
              <Target className="text-indigo-600 w-7 h-7" />
            </div>
            CRM de Retención
          </h1>
          <p className="text-slate-500 mt-1 ml-1">Reseñas de Google y Mantenimiento Predictivo</p>
        </div>
        <button
          onClick={() => setShowConfigModal(true)}
          className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-indigo-600 bg-white border border-slate-200 rounded-xl px-4 py-2 shadow-sm hover:shadow transition-all"
        >
          <Settings2 size={16} />
          Configurar CRM
        </button>
      </div>

      {/* Alerta sin Google URL */}
      {noGoogleUrl && tab === 'resenas' && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-800 text-sm">
          <AlertTriangle size={18} className="shrink-0" />
          <span>
            No tienes configurado tu enlace de reseñas de Google.{' '}
            <button onClick={() => setShowConfigModal(true)} className="underline font-semibold">
              Configurarlo ahora
            </button>{' '}
            para que el mensaje incluya el enlace directo.
          </span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 bg-slate-100 rounded-xl p-1 w-fit">
        <button
          onClick={() => { setTab('resenas'); setSearchTerm(''); }}
          className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
            tab === 'resenas'
              ? 'bg-white text-indigo-700 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Star size={16} />
          Reseñas Google
        </button>
        <button
          onClick={() => { setTab('retencion'); setSearchTerm(''); }}
          className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
            tab === 'retencion'
              ? 'bg-white text-indigo-700 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <RefreshCw size={16} />
          Mantenimiento Predictivo
        </button>
      </div>

      {/* Buscador */}
      <div className="flex items-center bg-white rounded-xl shadow-sm border border-slate-200 p-2 max-w-md">
        <Search className="text-slate-400 ml-2" size={20} />
        <input
          type="text"
          placeholder="Buscar por placa o cliente..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="w-full px-3 py-1 outline-none text-sm"
        />
      </div>

      {/* ── Pestaña Reseñas ─────────────────────────────────────────────────── */}
      {tab === 'resenas' && (
        <TabResenas
          loading={loadingResenas}
          resenas={resenasFiltradas}
          updatingId={updatingId}
          onAbrir={handleAbrirWhatsAppResena}
          onConfirmar={handleConfirmarResena}
          onDeshacer={handleDeshacerResena}
          onNoContactar={handleNoContactar}
        />
      )}

      {/* ── Pestaña Retención ───────────────────────────────────────────────── */}
      {tab === 'retencion' && (
        <TabRetencion
          loading={loadingRetencion}
          prospectos={prospectosFiltrados}
          expandedId={expandedProspecto}
          onToggleExpand={setExpandedProspecto}
          onWhatsApp={handleWhatsAppRetencion}
          onNoContactar={handleNoContactar}
        />
      )}

      {/* ── Modal Config ─────────────────────────────────────────────────────── */}
      {showConfigModal && editIntervalos && (
        <ModalConfig
          googleUrl={editGoogleUrl}
          onChangeGoogleUrl={setEditGoogleUrl}
          intervalos={editIntervalos}
          onChangeIntervalos={setEditIntervalos}
          loading={configLoading}
          onGuardar={handleGuardarConfig}
          onCerrar={() => setShowConfigModal(false)}
        />
      )}
    </div>
  );
};

// ─── Subcomponente: Pestaña Reseñas ──────────────────────────────────────────

interface TabResenasProps {
  loading: boolean;
  resenas: ResenaIngreso[];
  updatingId: string | null;
  onAbrir: (ingreso: ResenaIngreso) => void;
  onConfirmar: (ingreso: ResenaIngreso) => void;
  onDeshacer: (ingreso: ResenaIngreso) => void;
  onNoContactar: (clienteId: string, ingresosIds: string[]) => void;
}

const TabResenas: React.FC<TabResenasProps> = ({
  loading, resenas, updatingId, onAbrir, onConfirmar, onDeshacer, onNoContactar,
}) => {
  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-indigo-500 w-10 h-10" /></div>;

  const pendientes = resenas.filter(r => r.resena_estado === 'pendiente');
  const intentados = resenas.filter(r => r.resena_estado === 'intentado');
  const confirmados = resenas.filter(r => r.resena_estado === 'confirmado');

  const grupos = [
    { label: 'Pendientes de enviar', items: pendientes, color: 'text-slate-700' },
    { label: 'Enviado — pendiente de confirmar', items: intentados, color: 'text-amber-700' },
    { label: 'Confirmados ✅', items: confirmados, color: 'text-emerald-700' },
  ];

  if (resenas.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center text-slate-500">
        <Star className="mx-auto text-slate-300 w-16 h-16 mb-4" />
        <p className="text-lg font-medium">No hay clientes pendientes de reseña.</p>
        <p className="text-sm mt-1">Las órdenes entregadas en los últimos 60 días aparecerán aquí.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {grupos.map(grupo => grupo.items.length > 0 && (
        <div key={grupo.label}>
          <h2 className={`text-sm font-bold uppercase tracking-wider mb-4 ${grupo.color}`}>{grupo.label}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {grupo.items.map(ingreso => (
              <TarjetaResena
                key={ingreso.id}
                ingreso={ingreso}
                updating={updatingId === ingreso.id}
                onAbrir={onAbrir}
                onConfirmar={onConfirmar}
                onDeshacer={onDeshacer}
                onNoContactar={onNoContactar}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

// ─── Tarjeta de Reseña ────────────────────────────────────────────────────────

interface TarjetaResenaProps {
  ingreso: ResenaIngreso;
  updating: boolean;
  onAbrir: (ingreso: ResenaIngreso) => void;
  onConfirmar: (ingreso: ResenaIngreso) => void;
  onDeshacer: (ingreso: ResenaIngreso) => void;
  onNoContactar: (clienteId: string, ingresosIds: string[]) => void;
}

const TarjetaResena: React.FC<TarjetaResenaProps> = ({
  ingreso, updating, onAbrir, onConfirmar, onDeshacer, onNoContactar,
}) => {
  const cliente = ingreso.taller_vehiculos.taller_clientes;
  const vehiculo = ingreso.taller_vehiculos;
  const estado = ingreso.resena_estado;

  const estadoConfig = {
    pendiente: { icon: <Clock size={14} />, label: 'Pendiente', cls: 'bg-slate-100 text-slate-600' },
    intentado: { icon: <Clock size={14} />, label: 'Enviado (confirmar)', cls: 'bg-amber-100 text-amber-700' },
    confirmado: { icon: <CheckCircle2 size={14} />, label: 'Confirmado', cls: 'bg-emerald-100 text-emerald-700' },
  }[estado];

  const diasDesdeEntrega = Math.floor(
    (Date.now() - new Date(ingreso.updated_at).getTime()) / 86_400_000
  );

  return (
    <div className={`bg-white rounded-2xl p-5 shadow-sm border transition-shadow hover:shadow-md ${
      estado === 'confirmado' ? 'border-emerald-200 opacity-75' : 'border-slate-200'
    }`}>
      {/* Header */}
      <div className="flex justify-between items-start mb-3">
        <div>
          <h3 className="font-bold text-slate-800">{cliente.nombre_completo}</h3>
          <p className="text-slate-500 text-xs flex items-center gap-1 mt-0.5">
            <Phone size={12} /> {cliente.telefono || 'Sin teléfono'}
          </p>
        </div>
        <span className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg ${estadoConfig.cls}`}>
          {estadoConfig.icon} {estadoConfig.label}
        </span>
      </div>

      {/* Vehículo */}
      <div className="bg-slate-50 rounded-xl p-3 mb-4 border border-slate-100">
        <div className="flex justify-between items-center">
          <span className="text-slate-500 text-xs uppercase font-semibold">{vehiculo.marca} {vehiculo.linea}</span>
          <span className="font-black text-slate-800 text-sm tracking-widest">{vehiculo.placa}</span>
        </div>
        <p className="text-xs text-slate-400 mt-1">
          Entregado hace {diasDesdeEntrega === 0 ? 'hoy' : `${diasDesdeEntrega} día${diasDesdeEntrega !== 1 ? 's' : ''}`}
        </p>
      </div>

      {/* Acciones */}
      {estado === 'pendiente' && (
        <div className="space-y-2">
          <button
            onClick={() => onAbrir(ingreso)}
            disabled={updating || !cliente.telefono}
            className="w-full bg-[#25D366] hover:bg-[#20bd59] disabled:opacity-50 text-white font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 transition-colors text-sm"
          >
            {updating ? <Loader2 size={16} className="animate-spin" /> : <MessageCircle size={16} />}
            Pedir reseña por WhatsApp
          </button>
          <button
            onClick={() => onNoContactar(cliente.id, [ingreso.id])}
            className="w-full text-xs text-slate-400 hover:text-red-500 flex items-center justify-center gap-1 py-1 transition-colors"
          >
            <BellOff size={12} /> No contactar más
          </button>
        </div>
      )}

      {estado === 'intentado' && (
        <div className="space-y-2">
          <p className="text-xs text-amber-600 text-center mb-2">
            ¿Confirmás que el mensaje salió?
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => onConfirmar(ingreso)}
              disabled={updating}
              className="flex-1 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-bold py-2 rounded-xl flex items-center justify-center gap-1 text-sm transition-colors"
            >
              {updating ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              Sí, enviado
            </button>
            <button
              onClick={() => onDeshacer(ingreso)}
              disabled={updating}
              className="flex-1 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 font-bold py-2 rounded-xl flex items-center justify-center gap-1 text-sm transition-colors"
            >
              <Undo2 size={14} /> Deshacer
            </button>
          </div>
          <button
            onClick={() => onAbrir(ingreso)}
            disabled={updating || !cliente.telefono}
            className="w-full text-xs text-[#25D366] hover:underline flex items-center justify-center gap-1 py-1"
          >
            <MessageCircle size={12} /> Reintentar WhatsApp
          </button>
        </div>
      )}

      {estado === 'confirmado' && (
        <div className="text-center">
          <p className="text-emerald-600 text-sm font-semibold flex items-center justify-center gap-1">
            <CheckCircle2 size={16} /> Reseña solicitada
          </p>
          {ingreso.resena_solicitada_at && (
            <p className="text-xs text-slate-400 mt-1">{formatFecha(ingreso.resena_solicitada_at)}</p>
          )}
          <button
            onClick={() => onDeshacer(ingreso)}
            className="text-xs text-slate-400 hover:text-slate-600 mt-2 flex items-center justify-center gap-1 w-full"
          >
            <Undo2 size={11} /> Deshacer
          </button>
        </div>
      )}
    </div>
  );
};

// ─── Subcomponente: Pestaña Retención ────────────────────────────────────────

interface TabRetencionProps {
  loading: boolean;
  prospectos: ProspectoAgrupado[];
  expandedId: string | null;
  onToggleExpand: (id: string | null) => void;
  onWhatsApp: (prospecto: ProspectoAgrupado) => void;
  onNoContactar: (clienteId: string, ingresosIds: string[]) => void;
}

const TabRetencion: React.FC<TabRetencionProps> = ({
  loading, prospectos, expandedId, onToggleExpand, onWhatsApp, onNoContactar,
}) => {
  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-indigo-500 w-10 h-10" /></div>;

  if (prospectos.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center text-slate-500">
        <Target className="mx-auto text-slate-300 w-16 h-16 mb-4" />
        <p className="text-lg font-medium">No hay mantenimientos próximos sugeridos.</p>
        <p className="text-sm mt-1">
          Los vehículos aparecerán aquí cuando se acerque la fecha de su próximo servicio.
        </p>
      </div>
    );
  }

  const vencidos = prospectos.filter(p => p.algun_vencido);
  const proximos = prospectos.filter(p => !p.algun_vencido);

  return (
    <div className="space-y-8">
      {vencidos.length > 0 && (
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider mb-4 text-red-600">⚠️ Vencidos — Contactar cuanto antes</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {vencidos.map(p => (
              <TarjetaRetencion
                key={p.vehiculo_id}
                prospecto={p}
                expanded={expandedId === p.vehiculo_id}
                onToggle={() => onToggleExpand(expandedId === p.vehiculo_id ? null : p.vehiculo_id)}
                onWhatsApp={onWhatsApp}
                onNoContactar={onNoContactar}
              />
            ))}
          </div>
        </div>
      )}
      {proximos.length > 0 && (
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider mb-4 text-amber-600">🔔 Próximos a vencer</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {proximos.map(p => (
              <TarjetaRetencion
                key={p.vehiculo_id}
                prospecto={p}
                expanded={expandedId === p.vehiculo_id}
                onToggle={() => onToggleExpand(expandedId === p.vehiculo_id ? null : p.vehiculo_id)}
                onWhatsApp={onWhatsApp}
                onNoContactar={onNoContactar}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Tarjeta de Retención ─────────────────────────────────────────────────────

interface TarjetaRetencionProps {
  prospecto: ProspectoAgrupado;
  expanded: boolean;
  onToggle: () => void;
  onWhatsApp: (prospecto: ProspectoAgrupado) => void;
  onNoContactar: (clienteId: string, ingresosIds: string[]) => void;
}

const TarjetaRetencion: React.FC<TarjetaRetencionProps> = ({
  prospecto, expanded, onToggle, onWhatsApp, onNoContactar,
}) => {
  const esBorde = prospecto.algun_vencido ? 'border-red-200' : 'border-amber-200';

  return (
    <div className={`bg-white rounded-2xl p-5 shadow-sm border hover:shadow-md transition-shadow ${esBorde}`}>
      {/* Header */}
      <div className="flex justify-between items-start mb-3">
        <div>
          <h3 className="font-bold text-slate-800">{prospecto.cliente_nombre}</h3>
          <p className="text-slate-500 text-xs flex items-center gap-1 mt-0.5">
            <Phone size={12} /> {prospecto.cliente_telefono || 'Sin teléfono'}
          </p>
        </div>
        <span className="font-black text-slate-800 text-sm tracking-widest bg-slate-100 px-2 py-1 rounded-lg">
          {prospecto.placa}
        </span>
      </div>

      {/* Vehículo */}
      <p className="text-xs text-slate-500 mb-3 uppercase tracking-wide font-semibold">
        {prospecto.marca} {prospecto.linea}
      </p>

      {/* Servicios — siempre muestra el primero, el resto colapsable */}
      <div className="space-y-2 mb-4">
        {prospecto.servicios.slice(0, expanded ? undefined : 1).map(s => (
          <div key={s.categoria} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
            <div className="flex justify-between items-center mb-1">
              <span className={`text-xs font-bold px-2 py-0.5 rounded-lg ${categoriaBadgeColor[s.categoria] || categoriaBadgeColor.general}`}>
                {categoriaLabel[s.categoria] || s.categoria}
              </span>
              {s.is_vencido
                ? <span className="text-xs font-bold text-red-600">VENCIDO</span>
                : <span className="text-xs font-semibold text-amber-600">Próximo</span>
              }
            </div>
            <div className="flex justify-between text-xs text-slate-500 mt-1">
              <span>Sugerido: <strong className={s.is_vencido ? 'text-red-600' : 'text-amber-600'}>{formatFecha(s.fecha_sugerida)}</strong></span>
              <span>~{s.kilometraje_sugerido.toLocaleString('es-CO')} km</span>
            </div>
          </div>
        ))}
        {prospecto.servicios.length > 1 && (
          <button
            onClick={onToggle}
            className="text-xs text-indigo-500 hover:text-indigo-700 flex items-center gap-1 w-full justify-center py-1"
          >
            {expanded
              ? <><ChevronUp size={14} /> Ver menos</>
              : <><ChevronDown size={14} /> Ver {prospecto.servicios.length - 1} servicio{prospecto.servicios.length > 2 ? 's' : ''} más</>
            }
          </button>
        )}
      </div>

      {/* Acciones */}
      <button
        onClick={() => onWhatsApp(prospecto)}
        disabled={!prospecto.cliente_telefono}
        className="w-full bg-[#25D366] hover:bg-[#20bd59] disabled:opacity-50 text-white font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 transition-colors text-sm"
      >
        <MessageCircle size={16} />
        Enviar recordatorio ({prospecto.servicios.length} servicio{prospecto.servicios.length !== 1 ? 's' : ''})
      </button>
      <button
        onClick={() => onNoContactar(prospecto.cliente_id, [])}
        className="w-full text-xs text-slate-400 hover:text-red-500 flex items-center justify-center gap-1 py-2 mt-1 transition-colors"
      >
        <BellOff size={12} /> No contactar más
      </button>
    </div>
  );
};

// ─── Modal de Configuración ───────────────────────────────────────────────────

interface ModalConfigProps {
  googleUrl: string;
  onChangeGoogleUrl: (v: string) => void;
  intervalos: CrmConfig['config_crm_intervalos'];
  onChangeIntervalos: (v: CrmConfig['config_crm_intervalos']) => void;
  loading: boolean;
  onGuardar: () => void;
  onCerrar: () => void;
}

const ModalConfig: React.FC<ModalConfigProps> = ({
  googleUrl, onChangeGoogleUrl, intervalos, onChangeIntervalos, loading, onGuardar, onCerrar,
}) => {
  const categorias = [
    { key: 'aceite', label: '🛢️ Cambio de Aceite' },
    { key: 'frenos', label: '🔴 Frenos' },
    { key: 'aire', label: '❄️ Aire Acondicionado' },
    { key: 'general', label: '🔧 Mantenimiento General' },
  ] as const;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center p-6 border-b border-slate-100">
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Settings2 size={20} className="text-indigo-600" />
            Configuración del CRM
          </h2>
          <button onClick={onCerrar} className="text-slate-400 hover:text-slate-700 transition-colors">
            <X size={22} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Google Review URL */}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">
              🌟 Enlace de Reseñas de Google
            </label>
            <input
              type="url"
              value={googleUrl}
              onChange={e => onChangeGoogleUrl(e.target.value)}
              placeholder="https://g.page/r/.../review"
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300"
            />
            <p className="text-xs text-slate-400 mt-1">
              Encuéntalo en Google Business → "Pedir reseñas". Se incluye automáticamente en el mensaje de WhatsApp.
            </p>
          </div>

          {/* Intervalos por categoría */}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-3">
              ⏱️ Intervalos de Mantenimiento Preventivo
            </label>
            <div className="space-y-3">
              {categorias.map(({ key, label }) => (
                <div key={key} className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                  <p className="text-sm font-semibold text-slate-700 mb-3">{label}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Meses</label>
                      <input
                        type="number"
                        min={1}
                        max={60}
                        value={intervalos[key].meses}
                        onChange={e => onChangeIntervalos({
                          ...intervalos,
                          [key]: { ...intervalos[key], meses: Number(e.target.value) }
                        })}
                        className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-200"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Kilómetros</label>
                      <input
                        type="number"
                        min={100}
                        step={500}
                        value={intervalos[key].km}
                        onChange={e => onChangeIntervalos({
                          ...intervalos,
                          [key]: { ...intervalos[key], km: Number(e.target.value) }
                        })}
                        className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-200"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Ley 1581 */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-xs text-blue-700">
            <p className="font-semibold mb-1">📋 Ley 1581 de 2012 – Habeas Data</p>
            <p>
              Puedes dar de baja a cualquier cliente desde cada tarjeta con el botón "No contactar más".
              Esos clientes quedan excluidos automáticamente de ambas pestañas del CRM.
            </p>
          </div>
        </div>

        <div className="flex gap-3 p-6 border-t border-slate-100">
          <button
            onClick={onCerrar}
            className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2.5 rounded-xl transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={onGuardar}
            disabled={loading}
            className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 transition-colors"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Guardar cambios
          </button>
        </div>
      </div>
    </div>
  );
};

export default CRM;
