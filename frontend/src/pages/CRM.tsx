import React, { useEffect, useState, useCallback } from 'react';
import {
  Target, Search, Phone, Loader2, MessageCircle,
  Star, CheckCircle2, Clock, Undo2, Settings2,
  AlertTriangle, BellOff, ChevronDown, ChevronUp,
  RefreshCw, Save, X, Trash2, AlertCircle,
  BarChart3, Calendar, TrendingUp
} from 'lucide-react';
import api from '../services/api';
import { generarLinkWhatsApp } from '../utils/whatsapp';
import { useAuth } from '../context/AuthContext';
import ModalConfirmacion from '../components/ModalConfirmacion';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface ResenasStats {
  hoy: number;
  ayer: number;
  confirmadasHoy: number;
  estaSemana: number;
  esteMes: number;
  totalSolicitadas: number;
  confirmadasTotal: number;
  tasaConfirmacion: number;
  pendientes: number;
  ultimosDias: {
    fecha: string;
    diaSemana: string;
    esHoy: boolean;
    label: string;
    total: number;
    confirmadas: number;
  }[];
}

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
  resena_estado: 'pendiente' | 'intentado' | 'confirmado' | 'descartado';
  resena_solicitada_at: string | null;
  resena_descarte_motivo?: string | null;
  updated_at: string;
  motivo_visita?: string;
  diagnostico_mecanico?: Record<string, any>;
  items_factura?: Array<{
    id?: string;
    descripcion: string;
    tipo?: string;
    categoria_crm?: string;
    [key: string]: any;
  }>;
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

export const OPCIONES_MOTIVO_DESCARTE = [
  'No tiene WhatsApp',
  'Número equivocado o inactivo',
  'Cliente no desea ser contactado',
  'Inconformidad o reclamo pendiente',
  'Vehículo de empresa / flota',
  'Descarte masivo / No aplica',
];

/**
 * Detecta qué trabajo, reparación o diagnóstico principal se realizó en el vehículo
 */
export function detectarResumenServicio(ingreso: ResenaIngreso): string {
  const items = Array.isArray(ingreso.items_factura) ? ingreso.items_factura : [];
  
  // Priorizar mano de obra
  const itemsManoObra = items.filter(it => it.tipo === 'mano_obra' && it.descripcion?.trim());
  const itemsRelevantes = itemsManoObra.length > 0 ? itemsManoObra : items.filter(it => it.descripcion?.trim());

  if (itemsRelevantes.length > 0) {
    const nombres = itemsRelevantes
      .slice(0, 2)
      .map(it => it.descripcion.trim().replace(/[.,;]+$/, ''))
      .filter(Boolean);

    if (nombres.length === 1) return nombres[0];
    if (nombres.length >= 2) return `${nombres[0]} y ${nombres[1]}`;
  }

  // Diagnóstico mecánico
  if (ingreso.diagnostico_mecanico) {
    const nombresSistemas: Record<string, string> = {
      frenos: 'el sistema de frenos',
      motor: 'el motor',
      suspension: 'la suspensión',
      direccion: 'la dirección',
      aire_acondicionado: 'el aire acondicionado',
      rodamientos: 'los rodamientos',
      lubricacion: 'la lubricación y cambio de aceite',
      interior_y_accesorios: 'los accesorios',
      lavado: 'el alistamiento',
      pintura: 'la latonería y pintura',
    };

    const fallas = Object.entries(ingreso.diagnostico_mecanico)
      .filter(([_, val]: any) => val && (val.estado === 'danado' || val.estado === 'revisar'))
      .map(([key]) => nombresSistemas[key] || key);

    if (fallas.length === 1) return `trabajo en ${fallas[0]}`;
    if (fallas.length >= 2) return `trabajos en ${fallas[0]} y ${fallas[1]}`;
  }

  // Motivo de visita
  if (ingreso.motivo_visita?.trim()) {
    const motivo = ingreso.motivo_visita.trim().replace(/[.,;]+$/, '');
    if (motivo.length <= 40) return motivo;
  }

  return '';
}

/**
 * Construye el mensaje de WhatsApp para solicitar reseña de Google:
 * 1. Sin placa ni modelo del carro; menciona únicamente "su vehículo".
 * 2. Basado en el diagnóstico y lo que se arregló.
 * 3. Formulado con una pregunta contextual acorde al trabajo.
 */
export function construirMensajeResena(
  ingreso: ResenaIngreso,
  nombreTaller: string,
  googleUrl?: string | null
): string {
  const cliente = ingreso.taller_vehiculos?.taller_clientes;
  const nombreCliente = cliente?.nombre_completo?.trim() || 'estimado cliente';

  const detalle = detectarResumenServicio(ingreso);

  // 1. Personalizar la pregunta contextual según el servicio
  let preguntaContextual = '¿Ha sentido que todo marcha en óptimas condiciones y a su entera satisfacción?';
  const textoParaAnalisis = (detalle || '').toLowerCase();

  if (textoParaAnalisis.includes('freno')) {
    preguntaContextual = '¿Cómo ha sentido la respuesta, suavidad y seguridad en el frenado?';
  } else if (textoParaAnalisis.includes('aceite') || textoParaAnalisis.includes('lubric') || textoParaAnalisis.includes('motor')) {
    preguntaContextual = '¿Cómo ha sentido la fuerza, suavidad y rendimiento del motor?';
  } else if (textoParaAnalisis.includes('suspensi') || textoParaAnalisis.includes('amortiguad') || textoParaAnalisis.includes('direcci') || textoParaAnalisis.includes('alineaci')) {
    preguntaContextual = '¿Cómo ha sentido la estabilidad, suavidad y confort al volante?';
  } else if (textoParaAnalisis.includes('aire') || textoParaAnalisis.includes('a/c') || textoParaAnalisis.includes('clima')) {
    preguntaContextual = '¿Cómo ha sentido la temperatura y el confort del aire acondicionado?';
  } else if (detalle) {
    preguntaContextual = '¿Ha sentido el vehículo funcionando a la perfección tras este arreglo?';
  }

  // 2. Conector gramatical natural para la oración
  let conectorTrabajo = 'tras el servicio y mantenimiento realizado en nuestro taller';
  if (detalle) {
    const dLower = detalle.toLowerCase();
    if (dLower.startsWith('el ') || dLower.startsWith('la ') || dLower.startsWith('los ') || dLower.startsWith('las ')) {
      conectorTrabajo = `tras ${dLower}`;
    } else if (dLower.startsWith('cambio') || dLower.startsWith('ajuste') || dLower.startsWith('mantenimiento') || dLower.startsWith('servicio') || dLower.startsWith('trabajo')) {
      conectorTrabajo = `tras el ${dLower}`;
    } else if (dLower.startsWith('reparación') || dLower.startsWith('revisión') || dLower.startsWith('alineación') || dLower.startsWith('sincronización') || dLower.startsWith('limpieza')) {
      conectorTrabajo = `tras la ${dLower}`;
    } else {
      conectorTrabajo = `tras el arreglo de ${dLower}`;
    }
  }

  // 3. Redacción final
  return `Hola ${nombreCliente}, le saluda el equipo de ${nombreTaller}. Esperamos que se encuentre muy bien 🙌\n\nQueríamos preguntarle: ¿cómo ha sentido su vehículo ${conectorTrabajo}? ${preguntaContextual}${googleUrl ? `\n\nSi está a gusto con el servicio y tiene un minuto, nos ayudaría muchísimo que nos compartiera su opinión en Google: ${googleUrl}` : ''}\n\nY si nota cualquier detalle o algo no quedó exactamente como esperaba, cuéntenos por aquí mismo y con gusto lo revisamos de inmediato. 🔧 ¡Muchas gracias por confiar en nosotros!`;
}

// ─── Componente Principal ─────────────────────────────────────────────────────

const CRM: React.FC = () => {
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
  const [stats, setStats] = useState<ResenasStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  // Retención
  const [prospectos, setProspectos] = useState<ProspectoAgrupado[]>([]);
  const [loadingRetencion, setLoadingRetencion] = useState(false);
  const [expandedProspecto, setExpandedProspecto] = useState<string | null>(null);

  // Modales de confirmación personalizados
  const [ingresoADescartar, setIngresoADescartar] = useState<ResenaIngreso | null>(null);
  const [motivoDescarte, setMotivoDescarte] = useState('');
  const [clienteANoContactar, setClienteANoContactar] = useState<{ id: string; nombre: string } | null>(null);
  const [modalLoading, setModalLoading] = useState(false);

  // Selección múltiple para descarte en lote
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkDescartarModal, setShowBulkDescartarModal] = useState(false);
  const [bulkMotivoDescarte, setBulkMotivoDescarte] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);

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

  const cargarStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const { data } = await api.get('/crm/resenas/stats');
      setStats(data);
    } catch (e) {
      console.error('[CRM] Error cargando stats de reseñas:', e);
    } finally {
      setLoadingStats(false);
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
    if (tab === 'resenas') {
      cargarResenas();
      cargarStats();
    }
    if (tab === 'retencion') cargarRetencion();
  }, [tab, cargarResenas, cargarRetencion, cargarStats]);

  // ─── Acciones Reseñas ─────────────────────────────────────────────────────────

  const handleAbrirWhatsAppResena = async (ingreso: ResenaIngreso) => {
    const cliente = ingreso.taller_vehiculos.taller_clientes;
    const nombreTaller = config?.nombre || empresaNombre;
    const googleUrl = config?.google_review_url;

    const mensaje = construirMensajeResena(ingreso, nombreTaller, googleUrl);

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
      cargarStats();
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
      cargarStats();
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
          ? { ...r, resena_estado: 'pendiente', resena_solicitada_at: null, resena_descarte_motivo: null }
          : r
        )
      );
      cargarStats();
    } catch (e) {
      console.error('[CRM] Error deshaciendo reseña:', e);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDescartarResena = (ingreso: ResenaIngreso) => {
    setIngresoADescartar(ingreso);
    setMotivoDescarte(ingreso.resena_descarte_motivo || '');
  };

  const handleConfirmarDescarte = async () => {
    if (!ingresoADescartar) return;
    setModalLoading(true);
    setUpdatingId(ingresoADescartar.id);
    const motivoFinal = motivoDescarte.trim() || null;
    try {
      await api.post(`/crm/resenas/${ingresoADescartar.id}/descartar`, { motivo: motivoFinal });
      setResenas(prev =>
        prev.map(r => r.id === ingresoADescartar.id
          ? { ...r, resena_estado: 'descartado', resena_solicitada_at: null, resena_descarte_motivo: motivoFinal }
          : r
        )
      );
      setSelectedIds(prev => {
        if (!prev.has(ingresoADescartar.id)) return prev;
        const next = new Set(prev);
        next.delete(ingresoADescartar.id);
        return next;
      });
      setIngresoADescartar(null);
      setMotivoDescarte('');
      cargarStats();
    } catch (e: any) {
      console.error('[CRM] Error descartando reseña:', e);
      alert('Error al descartar la reseña: ' + (e.response?.data?.error || e.message));
    } finally {
      setModalLoading(false);
      setUpdatingId(null);
    }
  };

  const handleToggleSelect = (id: string) => {
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

  const handleSelectAll = (ids: string[]) => {
    setSelectedIds(prev => {
      const allSelected = ids.every(id => prev.has(id));
      const next = new Set(prev);
      if (allSelected) {
        ids.forEach(id => next.delete(id));
      } else {
        ids.forEach(id => next.add(id));
      }
      return next;
    });
  };

  const handleClearSelection = () => {
    setSelectedIds(new Set());
  };

  const handleAbrirBulkDescartar = () => {
    if (selectedIds.size === 0) return;
    setBulkMotivoDescarte('');
    setShowBulkDescartarModal(true);
  };

  const handleConfirmarBulkDescarte = async () => {
    if (selectedIds.size === 0) return;
    setBulkLoading(true);
    const idsArray = Array.from(selectedIds);
    const motivoFinal = bulkMotivoDescarte.trim() || null;
    try {
      await api.post('/crm/resenas/bulk-descartar', {
        ids: idsArray,
        motivo: motivoFinal,
      });

      setResenas(prev =>
        prev.map(r =>
          selectedIds.has(r.id)
            ? {
                ...r,
                resena_estado: 'descartado',
                resena_solicitada_at: null,
                resena_descarte_motivo: motivoFinal,
              }
            : r
        )
      );

      setSelectedIds(new Set());
      setShowBulkDescartarModal(false);
      setBulkMotivoDescarte('');
      cargarStats();
    } catch (e: any) {
      console.error('[CRM] Error al descartar reseñas en lote:', e);
      alert('Error al descartar las reseñas seleccionadas: ' + (e.response?.data?.error || e.message));
    } finally {
      setBulkLoading(false);
    }
  };

  const handleNoContactar = (clienteId: string, _ingresosIds?: string[], clienteNombre?: string) => {
    setClienteANoContactar({ id: clienteId, nombre: clienteNombre || 'este cliente' });
  };

  const handleConfirmarNoContactar = async () => {
    if (!clienteANoContactar) return;
    setModalLoading(true);
    try {
      await api.patch(`/crm/clientes/${clienteANoContactar.id}/no-contactar`, { acepta_whatsapp: false });
      // Eliminar de ambas listas localmente
      setResenas(prev => prev.filter(r => r.taller_vehiculos.taller_clientes.id !== clienteANoContactar.id));
      setProspectos(prev => prev.filter(p => p.cliente_id !== clienteANoContactar.id));
      setClienteANoContactar(null);
    } catch (e: any) {
      console.error('[CRM] Error actualizando no contactar:', e);
      alert('Error al actualizar cliente: ' + (e.response?.data?.error || e.message));
    } finally {
      setModalLoading(false);
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
    const cliente = r.taller_vehiculos?.taller_clientes;
    const vehiculo = r.taller_vehiculos;
    const q = searchTerm.toLowerCase();
    return (
      cliente?.nombre_completo?.toLowerCase().includes(q) ||
      vehiculo?.placa?.toLowerCase().includes(q) ||
      (r.resena_descarte_motivo && r.resena_descarte_motivo.toLowerCase().includes(q))
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
          stats={stats}
          loadingStats={loadingStats}
          resenas={resenasFiltradas}
          updatingId={updatingId}
          selectedIds={selectedIds}
          onToggleSelect={handleToggleSelect}
          onSelectAll={handleSelectAll}
          onClearSelection={handleClearSelection}
          onOpenBulkDescartar={handleAbrirBulkDescartar}
          onAbrir={handleAbrirWhatsAppResena}
          onConfirmar={handleConfirmarResena}
          onDeshacer={handleDeshacerResena}
          onDescartar={handleDescartarResena}
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

      {/* ── Modal Descartar Reseña ── */}
      <ModalConfirmacion
        isOpen={!!ingresoADescartar}
        onClose={() => {
          if (!modalLoading) {
            setIngresoADescartar(null);
            setMotivoDescarte('');
          }
        }}
        onConfirm={handleConfirmarDescarte}
        loading={modalLoading}
        tipo="danger"
        title="¿Descartar solicitud de reseña?"
        description="Esta orden se retirará de las reseñas pendientes porque no se va a solicitar."
        confirmText="Sí, descartar"
        cancelText="Volver"
      >
        {ingresoADescartar && (
          <div className="space-y-3.5 my-2">
            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 space-y-3">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Cliente</p>
                  <p className="text-sm font-bold text-slate-800">
                    {ingresoADescartar.taller_vehiculos.taller_clientes.nombre_completo}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {ingresoADescartar.taller_vehiculos.taller_clientes.telefono || 'Sin teléfono'}
                  </p>
                </div>
                <span className="font-mono font-black text-slate-900 text-sm tracking-widest bg-white border border-slate-200 px-3 py-1 rounded-xl shadow-xs">
                  {ingresoADescartar.taller_vehiculos.placa}
                </span>
              </div>

              <div className="flex justify-between items-center pt-2 border-t border-slate-200/60 text-xs text-slate-600">
                <span className="font-semibold uppercase">
                  {ingresoADescartar.taller_vehiculos.marca} {ingresoADescartar.taller_vehiculos.linea}
                </span>
                <span className="text-slate-400">
                  Entregado {formatFecha(ingresoADescartar.updated_at)}
                </span>
              </div>
            </div>

            {/* Selector de motivo y nota */}
            <div className="bg-white border border-slate-200 rounded-2xl p-3.5 space-y-2.5">
              <label className="block text-xs font-bold text-slate-700">
                ¿Por qué descartas este card? <span className="text-slate-400 font-normal">(opcional)</span>
              </label>

              {/* Chips rápidos */}
              <div className="flex flex-wrap gap-1.5">
                {OPCIONES_MOTIVO_DESCARTE.map(opcion => {
                  const seleccionado = motivoDescarte === opcion;
                  return (
                    <button
                      key={opcion}
                      type="button"
                      onClick={() => setMotivoDescarte(seleccionado ? '' : opcion)}
                      className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-colors text-left ${
                        seleccionado
                          ? 'bg-red-50 border-red-300 text-red-700 font-semibold'
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-800'
                      }`}
                    >
                      {opcion}
                    </button>
                  );
                })}
              </div>

              {/* Campo para escribir nota libre */}
              <textarea
                value={motivoDescarte}
                onChange={e => setMotivoDescarte(e.target.value)}
                placeholder="Escribe o personaliza el motivo (ej: no tiene WhatsApp, teléfono fijo, etc.)..."
                rows={2}
                maxLength={250}
                className="w-full text-xs p-2.5 border border-slate-200 rounded-xl outline-indigo-500 bg-slate-50/60 focus:bg-white resize-none text-slate-800 placeholder:text-slate-400 transition"
              />
            </div>

            <p className="text-[11px] text-slate-500 bg-amber-50/80 border border-amber-200/60 rounded-xl p-2.5">
              💡 <strong>Nota:</strong> No se enviará ningún mensaje. La nota quedará registrada en el card para tu control y podrás restaurar la orden en cualquier momento desde <em>"Ver descartadas"</em>.
            </p>
          </div>
        )}
      </ModalConfirmacion>

      {/* ── Modal Descartar Reseñas en Lote ── */}
      <ModalConfirmacion
        isOpen={showBulkDescartarModal}
        onClose={() => {
          if (!bulkLoading) {
            setShowBulkDescartarModal(false);
            setBulkMotivoDescarte('');
          }
        }}
        onConfirm={handleConfirmarBulkDescarte}
        loading={bulkLoading}
        tipo="danger"
        title={`¿Descartar ${selectedIds.size} solicitudes de reseña?`}
        description="Estas órdenes se retirarán de las reseñas pendientes porque no se van a solicitar."
        confirmText={`Sí, descartar (${selectedIds.size})`}
        cancelText="Volver"
      >
        <div className="space-y-3.5 my-2">
          {/* Resumen de órdenes seleccionadas */}
          <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3 space-y-2">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Órdenes seleccionadas ({selectedIds.size}):
            </p>
            <div className="max-h-32 overflow-y-auto space-y-1 pr-1">
              {resenas
                .filter(r => selectedIds.has(r.id))
                .map(item => (
                  <div
                    key={item.id}
                    className="flex justify-between items-center bg-white border border-slate-200/70 rounded-xl px-2.5 py-1 text-xs"
                  >
                    <span className="font-semibold text-slate-800 truncate mr-2">
                      {item.taller_vehiculos?.taller_clientes?.nombre_completo}
                    </span>
                    <span className="font-mono font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md text-[11px] shrink-0">
                      {item.taller_vehiculos?.placa}
                    </span>
                  </div>
                ))}
            </div>
          </div>

          {/* Selector de motivo y nota para el lote */}
          <div className="bg-white border border-slate-200 rounded-2xl p-3.5 space-y-2.5">
            <label className="block text-xs font-bold text-slate-700">
              ¿Por qué descartas estas órdenes? <span className="text-slate-400 font-normal">(opcional)</span>
            </label>

            {/* Chips rápidos */}
            <div className="flex flex-wrap gap-1.5">
              {OPCIONES_MOTIVO_DESCARTE.map(opcion => {
                const seleccionado = bulkMotivoDescarte === opcion;
                return (
                  <button
                    key={opcion}
                    type="button"
                    onClick={() => setBulkMotivoDescarte(seleccionado ? '' : opcion)}
                    className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-colors text-left cursor-pointer ${
                      seleccionado
                        ? 'bg-red-50 border-red-300 text-red-700 font-semibold'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-800'
                    }`}
                  >
                    {opcion}
                  </button>
                );
              })}
            </div>

            {/* Campo para escribir nota libre */}
            <textarea
              value={bulkMotivoDescarte}
              onChange={e => setBulkMotivoDescarte(e.target.value)}
              placeholder="Escribe o personaliza el motivo para todo el lote (ej: depuración masiva, sin contacto)..."
              rows={2}
              maxLength={250}
              className="w-full text-xs p-2.5 border border-slate-200 rounded-xl outline-indigo-500 bg-slate-50/60 focus:bg-white resize-none text-slate-800 placeholder:text-slate-400 transition"
            />
          </div>

          <p className="text-[11px] text-slate-500 bg-amber-50/80 border border-amber-200/60 rounded-xl p-2.5">
            💡 <strong>Nota:</strong> No se enviará ningún mensaje. La nota quedará registrada en cada orden descartada y podrás restaurar cualquiera de ellas individualmente desde <em>"Ver descartadas"</em>.
          </p>
        </div>
      </ModalConfirmacion>

      {/* ── Modal No Contactar Más (Ley 1581) ── */}
      <ModalConfirmacion
        isOpen={!!clienteANoContactar}
        onClose={() => { if (!modalLoading) setClienteANoContactar(null); }}
        onConfirm={handleConfirmarNoContactar}
        loading={modalLoading}
        tipo="warning"
        icon={<BellOff size={24} className="text-amber-600" />}
        title="¿Dar de baja de WhatsApp?"
        description={
          clienteANoContactar ? (
            <span>
              Se excluirá a <strong>{clienteANoContactar.nombre}</strong> de los envíos de WhatsApp en ambas pestañas (Reseñas y Mantenimiento Predictivo) en cumplimiento de la <strong>Ley 1581 de Protección de Datos</strong>.
            </span>
          ) : undefined
        }
        confirmText="Confirmar baja"
        cancelText="Cancelar"
      />

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

// ─── Componentes de Métricas de Reseñas ──────────────────────────────────────

const ResenasKpiCards: React.FC<{ stats: ResenasStats | null; loading: boolean }> = ({ stats, loading }) => {
  if (loading && !stats) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        {[1, 2, 3, 4].map(n => (
          <div key={n} className="bg-white border border-slate-200/80 rounded-2xl p-4 animate-pulse h-24" />
        ))}
      </div>
    );
  }

  const hoy = stats?.hoy ?? 0;
  const ayer = stats?.ayer ?? 0;
  const confirmadasHoy = stats?.confirmadasHoy ?? 0;
  const estaSemana = stats?.estaSemana ?? 0;
  const esteMes = stats?.esteMes ?? 0;
  const tasaConfirmacion = stats?.tasaConfirmacion ?? 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
      {/* 1. Pedidas Hoy */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs relative overflow-hidden flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Pedidas Hoy</span>
          <div className="p-2 bg-indigo-50 border border-indigo-100 rounded-xl text-indigo-600">
            <MessageCircle size={16} />
          </div>
        </div>
        <div className="mt-2">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900 tracking-tight">{hoy}</span>
            {confirmadasHoy > 0 && (
              <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-2 py-0.5 rounded-full">
                {confirmadasHoy} confirmada{confirmadasHoy > 1 ? 's' : ''}
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5 font-medium">
            {ayer > 0 ? `${ayer} enviada${ayer > 1 ? 's' : ''} ayer` : '0 enviadas ayer'}
          </p>
        </div>
      </div>

      {/* 2. Esta Semana */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs relative overflow-hidden flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Esta Semana</span>
          <div className="p-2 bg-blue-50 border border-blue-100 rounded-xl text-blue-600">
            <Calendar size={16} />
          </div>
        </div>
        <div className="mt-2">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900 tracking-tight">{estaSemana}</span>
            <span className="text-[11px] font-medium text-slate-400">solicitadas</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5 font-medium">Semana en curso (Lun-Dom)</p>
        </div>
      </div>

      {/* 3. Este Mes */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs relative overflow-hidden flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Este Mes</span>
          <div className="p-2 bg-purple-50 border border-purple-100 rounded-xl text-purple-600">
            <TrendingUp size={16} />
          </div>
        </div>
        <div className="mt-2">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900 tracking-tight">{esteMes}</span>
            <span className="text-[11px] font-medium text-slate-400">enviadas</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5 font-medium">Total acumulado del mes</p>
        </div>
      </div>

      {/* 4. Tasa de Confirmación */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs relative overflow-hidden flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Efectividad</span>
          <div className="p-2 bg-emerald-50 border border-emerald-100 rounded-xl text-emerald-600">
            <CheckCircle2 size={16} />
          </div>
        </div>
        <div className="mt-2">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-emerald-600 tracking-tight">{tasaConfirmacion}%</span>
            <span className="text-[11px] font-medium text-slate-400">éxito</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5 font-medium">
            {stats?.confirmadasTotal ?? 0} de {stats?.totalSolicitadas ?? 0} confirmadas
          </p>
        </div>
      </div>
    </div>
  );
};

const ResenasHistorialDiario: React.FC<{ stats: ResenasStats | null; loading: boolean }> = ({ stats }) => {
  const ultimosDias = stats?.ultimosDias || [];
  const maxTotal = Math.max(1, ...ultimosDias.map(d => d.total));
  const totalPeriodo = ultimosDias.reduce((acc, d) => acc + d.total, 0);
  const promedioDiario = (totalPeriodo / (ultimosDias.length || 1)).toFixed(1);

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs space-y-4">
      {/* Header del bloque */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-indigo-50 border border-indigo-100 rounded-xl text-indigo-600">
            <BarChart3 size={18} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Historial de Reseñas por Día</h3>
            <p className="text-xs text-slate-500">Seguimiento de solicitudes en los últimos 14 días (Zona horaria Colombia)</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Promedio diario</span>
            <span className="text-sm font-extrabold text-slate-800">{promedioDiario} / día</span>
          </div>
          <div className="h-7 w-px bg-slate-200" />
          <div className="text-right">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Total 14 días</span>
            <span className="text-sm font-extrabold text-indigo-600">{totalPeriodo} solicitadas</span>
          </div>
        </div>
      </div>

      {/* Gráfico de barras interactivo */}
      <div className="pt-2">
        <div className="grid grid-cols-7 sm:grid-cols-14 gap-1.5 sm:gap-2 items-end min-h-[140px] px-1">
          {ultimosDias.map((dia) => {
            const alturaPct = dia.total > 0 ? Math.max(14, Math.round((dia.total / maxTotal) * 100)) : 8;
            const alturaConfirmadasPct = dia.total > 0 ? Math.round((dia.confirmadas / dia.total) * 100) : 0;

            return (
              <div
                key={dia.fecha}
                className={`group flex flex-col items-center justify-end h-full relative ${
                  dia.esHoy ? 'font-bold' : ''
                }`}
              >
                {/* Tooltip flotante en hover */}
                <div className="opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none absolute -top-11 z-20 bg-slate-900 text-white text-[10px] rounded-lg py-1 px-2 shadow-lg whitespace-nowrap text-center">
                  <div className="font-semibold">{dia.diaSemana} {dia.fecha.slice(5)}</div>
                  <div className="text-slate-300">
                    {dia.total} enviada{dia.total !== 1 ? 's' : ''} · {dia.confirmadas} conf.
                  </div>
                </div>

                {/* Número sobre la barra */}
                <span
                  className={`text-[10px] mb-1 font-bold transition-transform group-hover:-translate-y-0.5 ${
                    dia.total > 0
                      ? dia.esHoy ? 'text-indigo-600' : 'text-slate-700'
                      : 'text-slate-300'
                  }`}
                >
                  {dia.total}
                </span>

                {/* Barra vertical */}
                <div
                  className={`w-full max-w-[28px] rounded-t-lg transition-all relative overflow-hidden flex flex-col justify-end ${
                    dia.total === 0
                      ? 'bg-slate-100 group-hover:bg-slate-200'
                      : dia.esHoy
                        ? 'bg-indigo-500 shadow-sm shadow-indigo-200 ring-2 ring-indigo-400/40 ring-offset-1'
                        : 'bg-indigo-300 group-hover:bg-indigo-400'
                  }`}
                  style={{ height: `${alturaPct}%` }}
                >
                  {/* Segmento verde confirmadas */}
                  {dia.confirmadas > 0 && (
                    <div
                      className="w-full bg-emerald-500 transition-all"
                      style={{ height: `${alturaConfirmadasPct}%` }}
                      title={`${dia.confirmadas} confirmadas`}
                    />
                  )}
                </div>

                {/* Etiqueta del día */}
                <div className="mt-2 text-center select-none">
                  <span
                    className={`text-[10px] block truncate uppercase ${
                      dia.esHoy
                        ? 'text-indigo-600 font-extrabold'
                        : 'text-slate-500 font-medium'
                    }`}
                  >
                    {dia.diaSemana}
                  </span>
                  <span
                    className={`text-[9px] block ${
                      dia.esHoy
                        ? 'text-indigo-700 font-extrabold bg-indigo-50 px-1 rounded-sm'
                        : 'text-slate-400'
                    }`}
                  >
                    {dia.esHoy ? 'Hoy' : dia.fecha.split('-')[2]}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Leyenda y tip de negocio */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 text-xs text-slate-500">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-indigo-500 inline-block" />
            <span className="text-[11px] font-medium text-slate-600">Enviadas por WhatsApp</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" />
            <span className="text-[11px] font-medium text-slate-600">Confirmadas</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-slate-200 inline-block" />
            <span className="text-[11px] font-medium text-slate-400">Sin envíos</span>
          </div>
        </div>

        <p className="text-[11px] text-slate-400 italic">
          💡 Enviar 2 a 5 reseñas por día de forma constante impulsa el ranking de tu taller en Google Maps.
        </p>
      </div>
    </div>
  );
};

// ─── Subcomponente: Pestaña Reseñas ──────────────────────────────────────────

interface TabResenasProps {
  loading: boolean;
  stats: ResenasStats | null;
  loadingStats: boolean;
  resenas: ResenaIngreso[];
  updatingId: string | null;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onSelectAll: (ids: string[]) => void;
  onClearSelection: () => void;
  onOpenBulkDescartar: () => void;
  onAbrir: (ingreso: ResenaIngreso) => void;
  onConfirmar: (ingreso: ResenaIngreso) => void;
  onDeshacer: (ingreso: ResenaIngreso) => void;
  onDescartar: (ingreso: ResenaIngreso) => void;
  onNoContactar: (clienteId: string, ingresosIds: string[], clienteNombre?: string) => void;
}

const TabResenas: React.FC<TabResenasProps> = ({
  loading,
  stats,
  loadingStats,
  resenas,
  updatingId,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
  onOpenBulkDescartar,
  onAbrir,
  onConfirmar,
  onDeshacer,
  onDescartar,
  onNoContactar,
}) => {
  const [colapsados, setColapsados] = useState<Record<string, boolean>>({
    pendientes: false,
    intentados: false,
    confirmados: false,
    descartados: true,
  });

  const toggleColapso = (key: string) => {
    setColapsados(prev => ({ ...prev, [key]: !prev[key] }));
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-indigo-500 w-10 h-10" /></div>;

  const pendientes = resenas.filter(r => r.resena_estado === 'pendiente' || !r.resena_estado);
  const intentados = resenas.filter(r => r.resena_estado === 'intentado');
  const confirmados = resenas.filter(r => r.resena_estado === 'confirmado');
  const descartados = resenas.filter(r => r.resena_estado === 'descartado');

  const elegibles = resenas.filter(r => r.resena_estado !== 'descartado');
  const todosElegiblesSeleccionados = elegibles.length > 0 && elegibles.every(e => selectedIds.has(e.id));
  const selectedCount = selectedIds.size;

  const grupos = [
    {
      key: 'pendientes',
      label: 'Pendientes de enviar',
      items: pendientes,
      color: 'text-slate-800',
      badgeBg: 'bg-slate-100 text-slate-700',
      isColapsado: !!colapsados.pendientes,
      isDescartadoGroup: false,
    },
    {
      key: 'intentados',
      label: 'Enviado — pendiente de confirmar',
      items: intentados,
      color: 'text-amber-800',
      badgeBg: 'bg-amber-100 text-amber-800',
      isColapsado: !!colapsados.intentados,
      isDescartadoGroup: false,
    },
    {
      key: 'confirmados',
      label: 'Confirmados ✅',
      items: confirmados,
      color: 'text-emerald-800',
      badgeBg: 'bg-emerald-100 text-emerald-800',
      isColapsado: !!colapsados.confirmados,
      isDescartadoGroup: false,
    },
    {
      key: 'descartados',
      label: 'Descartadas',
      items: descartados,
      color: 'text-slate-500',
      badgeBg: 'bg-slate-100 text-slate-600',
      isColapsado: !!colapsados.descartados,
      isDescartadoGroup: true,
    },
  ];

  if (resenas.length === 0 || (pendientes.length === 0 && intentados.length === 0 && confirmados.length === 0 && descartados.length === 0)) {
    return (
      <div className="space-y-6">
        <ResenasKpiCards stats={stats} loading={loadingStats} />

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center text-slate-500">
          <Star className="mx-auto text-slate-300 w-16 h-16 mb-4" />
          <p className="text-lg font-medium">No hay clientes pendientes de reseña.</p>
          <p className="text-sm mt-1">Las órdenes entregadas en los últimos 60 días aparecerán aquí.</p>
        </div>

        <ResenasHistorialDiario stats={stats} loading={loadingStats} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Métricas y Contadores (KPI Cards en la parte superior) ── */}
      <ResenasKpiCards stats={stats} loading={loadingStats} />

      {/* Barra de herramientas / Selección masiva */}
      {elegibles.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-2xl px-4 py-2.5 shadow-2xs">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={todosElegiblesSeleccionados}
                onChange={() => onSelectAll(elegibles.map(e => e.id))}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 accent-indigo-600 cursor-pointer"
              />
              <span>
                {todosElegiblesSeleccionados ? 'Deseleccionar todas' : 'Seleccionar todas las activas'}
                <span className="text-slate-400 font-normal ml-1">({elegibles.length})</span>
              </span>
            </label>

            {selectedCount > 0 && (
              <span className="text-xs bg-indigo-50 text-indigo-700 font-bold px-2.5 py-0.5 rounded-lg border border-indigo-200/60">
                {selectedCount} seleccionada{selectedCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {selectedCount > 0 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClearSelection}
                className="text-xs text-slate-500 hover:text-slate-700 font-medium px-2 py-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Limpiar
              </button>
              <button
                type="button"
                onClick={onOpenBulkDescartar}
                className="bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-bold text-xs px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Trash2 size={13} />
                Descartar ({selectedCount})
              </button>
            </div>
          )}
        </div>
      )}

      {grupos.map(grupo => {
        // Mostrar siempre pendientes, intentados y confirmados para visibilidad operativa;
        // y descartados solo si tiene elementos
        if (grupo.isDescartadoGroup && grupo.items.length === 0) return null;

        return (
          <div key={grupo.key} className={grupo.isDescartadoGroup ? 'pt-6 border-t border-slate-200' : ''}>
            <button
              type="button"
              onClick={() => toggleColapso(grupo.key)}
              className="w-full flex items-center justify-between py-2 text-left group cursor-pointer select-none"
            >
              <div className="flex items-center gap-2.5">
                {grupo.isDescartadoGroup && <Trash2 size={15} className="text-slate-400" />}
                <h2 className={`text-sm font-bold uppercase tracking-wider ${grupo.color}`}>
                  {grupo.label}
                </h2>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${grupo.badgeBg}`}>
                  {grupo.items.length}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 group-hover:text-slate-600 transition-colors">
                <span>{grupo.isColapsado ? 'Expandir' : 'Colapsar'}</span>
                {grupo.isColapsado ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
              </div>
            </button>

            {!grupo.isColapsado && (
              grupo.items.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-3">
                  {grupo.items.map(ingreso => (
                    <TarjetaResena
                      key={ingreso.id}
                      ingreso={ingreso}
                      updating={updatingId === ingreso.id}
                      isSelected={selectedIds.has(ingreso.id)}
                      onToggleSelect={onToggleSelect}
                      onAbrir={onAbrir}
                      onConfirmar={onConfirmar}
                      onDeshacer={onDeshacer}
                      onDescartar={onDescartar}
                      onNoContactar={onNoContactar}
                    />
                  ))}
                </div>
              ) : (
                <div className="bg-slate-50 border border-dashed border-slate-200 rounded-2xl p-4 text-center text-xs text-slate-400 mt-2">
                  No hay órdenes en esta sección actualmente.
                </div>
              )
            )}
          </div>
        );
      })}

      {/* ── Estadísticas e Historial por Día (Parte inferior de la UI) ── */}
      <ResenasHistorialDiario stats={stats} loading={loadingStats} />

      {/* Barra flotante de acciones masivas */}
      {selectedCount > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-slate-900/95 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-4 border border-slate-700/80 backdrop-blur-md animate-in fade-in slide-in-from-bottom-3 duration-200">
          <div className="flex items-center gap-2 text-sm font-medium">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-400 animate-pulse" />
            <span>
              <strong className="text-white">{selectedCount}</strong> orden{selectedCount !== 1 ? 'es' : ''} seleccionada{selectedCount !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="h-4 w-px bg-slate-700" />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClearSelection}
              className="text-xs text-slate-400 hover:text-white px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={onOpenBulkDescartar}
              className="bg-red-600 hover:bg-red-500 text-white font-bold px-3.5 py-1.5 rounded-xl flex items-center gap-1.5 text-xs shadow-md transition-colors cursor-pointer"
            >
              <Trash2 size={13} />
              Descartar seleccionadas
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Tarjeta de Reseña ────────────────────────────────────────────────────────

interface TarjetaResenaProps {
  ingreso: ResenaIngreso;
  updating: boolean;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
  onAbrir: (ingreso: ResenaIngreso) => void;
  onConfirmar: (ingreso: ResenaIngreso) => void;
  onDeshacer: (ingreso: ResenaIngreso) => void;
  onDescartar: (ingreso: ResenaIngreso) => void;
  onNoContactar: (clienteId: string, ingresosIds: string[], clienteNombre?: string) => void;
}

const TarjetaResena: React.FC<TarjetaResenaProps> = ({
  ingreso, updating, isSelected, onToggleSelect, onAbrir, onConfirmar, onDeshacer, onDescartar, onNoContactar,
}) => {
  const cliente = ingreso.taller_vehiculos.taller_clientes;
  const vehiculo = ingreso.taller_vehiculos;
  const estado = ingreso.resena_estado;
  const servicioDetectado = detectarResumenServicio(ingreso);

  const estadoConfig = {
    pendiente: { icon: <Clock size={14} />, label: 'Pendiente', cls: 'bg-slate-100 text-slate-600' },
    intentado: { icon: <Clock size={14} />, label: 'Enviado (confirmar)', cls: 'bg-amber-100 text-amber-700' },
    confirmado: { icon: <CheckCircle2 size={14} />, label: 'Confirmado', cls: 'bg-emerald-100 text-emerald-700' },
    descartado: { icon: <X size={14} />, label: 'Descartado', cls: 'bg-slate-100 text-slate-500' },
  }[estado] || { icon: <Clock size={14} />, label: 'Pendiente', cls: 'bg-slate-100 text-slate-600' };

  const diasDesdeEntrega = Math.floor(
    (Date.now() - new Date(ingreso.updated_at).getTime()) / 86_400_000
  );

  return (
    <div className={`bg-white rounded-2xl p-5 shadow-sm border transition-all ${
      isSelected
        ? 'border-indigo-400 ring-2 ring-indigo-500/25 bg-indigo-50/15 shadow-sm'
        : estado === 'confirmado'
        ? 'border-emerald-200 opacity-75'
        : estado === 'descartado'
        ? 'border-slate-200 bg-slate-50/60 opacity-80'
        : 'border-slate-200 hover:shadow-md'
    }`}>
      {/* Header */}
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-start gap-2.5">
          {estado !== 'descartado' && onToggleSelect && (
            <input
              type="checkbox"
              checked={!!isSelected}
              onChange={() => onToggleSelect(ingreso.id)}
              className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 accent-indigo-600 cursor-pointer shrink-0"
              title="Seleccionar para descartar"
            />
          )}
          <div>
            <h3 className="font-bold text-slate-800">{cliente.nombre_completo}</h3>
            <p className="text-slate-500 text-xs flex items-center gap-1 mt-0.5">
              <Phone size={12} /> {cliente.telefono || 'Sin teléfono'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg ${estadoConfig.cls}`}>
            {estadoConfig.icon} {estadoConfig.label}
          </span>
          {estado !== 'descartado' && (
            <button
              onClick={() => onDescartar(ingreso)}
              disabled={updating}
              title="Borrar / descartar reseña (no se va a hacer)"
              className="text-slate-400 hover:text-red-500 hover:bg-red-50 p-1 rounded-lg transition-colors cursor-pointer"
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
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
        {servicioDetectado && (
          <p className="text-[11px] text-indigo-700 bg-indigo-50/80 border border-indigo-100 rounded-lg px-2 py-1 mt-2 font-medium truncate" title={servicioDetectado}>
            🔧 {servicioDetectado}
          </p>
        )}
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
          <div className="flex items-center justify-between pt-1 px-1">
            <button
              onClick={() => onDescartar(ingreso)}
              disabled={updating}
              className="text-xs text-slate-400 hover:text-red-600 flex items-center gap-1 py-1 transition-colors"
              title="Borrar card porque no se va a pedir reseña"
            >
              <Trash2 size={12} /> Descartar
            </button>
            <button
              onClick={() => onNoContactar(cliente.id, [ingreso.id], cliente.nombre_completo)}
              className="text-xs text-slate-400 hover:text-red-500 flex items-center gap-1 py-1 transition-colors"
            >
              <BellOff size={12} /> No contactar más
            </button>
          </div>
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
          <div className="flex items-center justify-between pt-1 px-1">
            <button
              onClick={() => onDescartar(ingreso)}
              disabled={updating}
              className="text-xs text-slate-400 hover:text-red-600 flex items-center gap-1 py-1 transition-colors"
            >
              <Trash2 size={12} /> Descartar
            </button>
            <button
              onClick={() => onAbrir(ingreso)}
              disabled={updating || !cliente.telefono}
              className="text-xs text-[#25D366] hover:underline flex items-center gap-1 py-1"
            >
              <MessageCircle size={12} /> Reintentar WhatsApp
            </button>
          </div>
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
          <div className="flex items-center justify-center gap-4 mt-2">
            <button
              onClick={() => onDeshacer(ingreso)}
              className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1"
            >
              <Undo2 size={11} /> Deshacer
            </button>
            <button
              onClick={() => onDescartar(ingreso)}
              className="text-xs text-slate-400 hover:text-red-600 flex items-center gap-1"
            >
              <Trash2 size={11} /> Descartar
            </button>
          </div>
        </div>
      )}

      {estado === 'descartado' && (
        <div className="space-y-2 pt-1 text-center">
          <p className="text-xs text-slate-400">Reseña descartada (no se solicitará)</p>
          {ingreso.resena_descarte_motivo ? (
            <div className="bg-amber-50/80 border border-amber-200/60 rounded-xl p-2.5 my-1.5 text-left">
              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700 flex items-center gap-1">
                <AlertCircle size={12} /> Motivo del descarte:
              </p>
              <p className="text-xs text-amber-900 mt-0.5 font-medium leading-snug">
                {ingreso.resena_descarte_motivo}
              </p>
            </div>
          ) : (
            <p className="text-[11px] text-slate-400 italic">Sin motivo especificado</p>
          )}
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => onDescartar(ingreso)}
              disabled={updating}
              className="flex-1 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 font-semibold py-1.5 rounded-xl flex items-center justify-center gap-1 text-xs transition-colors cursor-pointer"
              title="Cambiar la nota de descarte"
            >
              Editar nota
            </button>
            <button
              onClick={() => onDeshacer(ingreso)}
              disabled={updating}
              className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-1.5 rounded-xl flex items-center justify-center gap-1 text-xs transition-colors cursor-pointer"
            >
              <Undo2 size={13} /> Restaurar
            </button>
          </div>
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
  onNoContactar: (clienteId: string, ingresosIds: string[], clienteNombre?: string) => void;
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
  onNoContactar: (clienteId: string, ingresosIds: string[], clienteNombre?: string) => void;
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
        onClick={() => onNoContactar(prospecto.cliente_id, [], prospecto.cliente_nombre)}
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
