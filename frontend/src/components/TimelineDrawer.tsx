import React, { useEffect, useState } from 'react';
import {
  X, Car, CheckCircle2, Wrench, FileSearch, Receipt, XCircle,
  RotateCcw, Clock, ClipboardList, Users, Loader2, ChevronDown,
  ChevronUp, AlertCircle
} from 'lucide-react';
import api from '../services/api';

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface Evento {
  id: string;
  tipo_evento: string;
  titulo: string;
  descripcion?: string;
  metadata?: Record<string, any>;
  created_at: string;
}

interface TimelineDrawerProps {
  ingresoId: string;
  vehiculoInfo: {
    placa: string;
    marca: string;
    linea: string;
    cliente: string;
    estado: string;
  };
  onClose: () => void;
}

// ─── Config de eventos (icono + color por tipo) ───────────────────────────────
const EVENTO_CONFIG: Record<string, { icon: React.ReactNode; color: string; bg: string; ring: string }> = {
  creacion:           { icon: <Car        size={16} />, color: 'text-blue-600',    bg: 'bg-blue-100',    ring: 'ring-blue-200'    },
  cambio_estado:      { icon: <ClipboardList size={16} />, color: 'text-indigo-600', bg: 'bg-indigo-100',  ring: 'ring-indigo-200'  },
  asignacion_tecnicos:{ icon: <Users      size={16} />, color: 'text-violet-600',  bg: 'bg-violet-100',  ring: 'ring-violet-200'  },
  diagnostico:        { icon: <FileSearch size={16} />, color: 'text-amber-600',   bg: 'bg-amber-100',   ring: 'ring-amber-200'   },
  cotizacion:         { icon: <Receipt    size={16} />, color: 'text-orange-600',  bg: 'bg-orange-100',  ring: 'ring-orange-200'  },
  aprobacion:         { icon: <CheckCircle2 size={16} />, color: 'text-emerald-600', bg: 'bg-emerald-100', ring: 'ring-emerald-200' },
  rediagnostico:      { icon: <RotateCcw  size={16} />, color: 'text-amber-600',   bg: 'bg-amber-100',   ring: 'ring-amber-200'   },
  entrega:            { icon: <CheckCircle2 size={16} />, color: 'text-emerald-600', bg: 'bg-emerald-100', ring: 'ring-emerald-200' },
  cancelacion:        { icon: <XCircle    size={16} />, color: 'text-red-600',     bg: 'bg-red-100',     ring: 'ring-red-200'     },
  nota:               { icon: <ClipboardList size={16} />, color: 'text-slate-600',  bg: 'bg-slate-100',  ring: 'ring-slate-200'   },
};

const defaultConfig = { icon: <Clock size={16} />, color: 'text-slate-500', bg: 'bg-slate-100', ring: 'ring-slate-200' };

// ─── Formateador de fecha ─────────────────────────────────────────────────────
const fmtFecha = (iso: string) => {
  const d = new Date(iso);
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(d);
};

// ─── Renderizador de Metadata ───────────────────────────────────────────────
const renderMetadata = (evento: Evento) => {
  if (!evento.metadata || Object.keys(evento.metadata).length === 0) return null;

  // 1. Diagnóstico: Mostrar solo fallas o notas (ignorar buen_estado vacío)
  if (evento.tipo_evento === 'diagnostico') {
    const sistemasConFallas = Object.entries(evento.metadata).filter(([_, detalle]: [string, any]) => {
      if (typeof detalle !== 'object' || !detalle) return false;
      return (detalle.estado && detalle.estado !== 'buen_estado') || (detalle.notas && detalle.notas.trim() !== '');
    });

    if (sistemasConFallas.length === 0) {
      return (
        <div className="mt-2 text-xs bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 w-fit">
          <CheckCircle2 size={14} /> Inspección superada sin novedades
        </div>
      );
    }

    return (
      <div className="mt-2 space-y-1.5">
        {sistemasConFallas.map(([sistema, detalle]: [string, any]) => (
          <div key={sistema} className="text-xs bg-slate-50 border border-slate-100 rounded-lg p-2">
            <span className="font-semibold text-slate-700 capitalize">{sistema.replace(/_/g, ' ')}:</span>{' '}
            <span className={detalle.estado !== 'buen_estado' ? 'text-amber-600 font-medium' : 'text-slate-600'}>
              {detalle.estado?.replace(/_/g, ' ')}
            </span>
            {detalle.notas && <p className="text-slate-500 mt-0.5 italic">"{detalle.notas}"</p>}
          </div>
        ))}
      </div>
    );
  }

  // 2. Cotización: Mostrar los ítems de la factura si están disponibles
  if (evento.tipo_evento === 'cotizacion' && evento.metadata.items_factura && Array.isArray(evento.metadata.items_factura)) {
    return (
      <div className="mt-2 space-y-1">
        {evento.metadata.items_factura.map((item: any, i: number) => (
          <div key={i} className="text-xs flex justify-between items-center bg-slate-50 px-2 py-1.5 rounded-md border border-slate-100">
            <span className="text-slate-600 truncate mr-2" title={item.descripcion}>
              {item.cantidad}x {item.descripcion}
            </span>
            <strong className="text-slate-700 whitespace-nowrap">
              ${(item.total || 0).toLocaleString('es-CO')}
            </strong>
          </div>
        ))}
      </div>
    );
  }

  // 3. Genérico para otros eventos (excluyendo estados internos)
  const metaEntries = Object.entries(evento.metadata).filter(
    ([k]) => !['estado_anterior', 'estado_nuevo'].includes(k)
  );

  if (metaEntries.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {metaEntries.map(([key, val]) => {
        const display = typeof val === 'object' ? JSON.stringify(val) : String(val);
        if (!display || display === 'null' || display === '{}') return null;
        if (display.startsWith('{') || display.startsWith('[')) {
           // Si es un objeto JSON crudo en otro tipo de evento, mostrar simplificado
           return (
            <span key={key} className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
              {key.replace(/_/g, ' ')}: <strong className="text-slate-700 font-mono text-[10px]">JSON</strong>
            </span>
           );
        }
        return (
          <span key={key} className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
            {key.replace(/_/g, ' ')}: <strong className="text-slate-700">{display}</strong>
          </span>
        );
      })}
    </div>
  );
};

// ─── Tarjeta de evento individual en la línea de tiempo ──────────────────────
const EventoCard: React.FC<{ evento: Evento; isLast: boolean }> = ({ evento, isLast }) => {
  const [expandido, setExpandido] = useState(false);
  const cfg = EVENTO_CONFIG[evento.tipo_evento] || defaultConfig;

  // Metadata relevante a mostrar (excluye campos internos)
  const metaEntries = Object.entries(evento.metadata || {}).filter(
    ([k]) => !['estado_anterior', 'estado_nuevo'].includes(k)
  );

  const descLarga = evento.descripcion && evento.descripcion.length > 100;

  return (
    <div className="flex gap-4">
      {/* Línea vertical + punto */}
      <div className="flex flex-col items-center">
        <div className={`z-10 p-2 rounded-full ring-2 ${cfg.bg} ${cfg.color} ${cfg.ring} shadow-sm shrink-0`}>
          {cfg.icon}
        </div>
        {!isLast && <div className="w-px flex-1 bg-slate-200 mt-1" />}
      </div>

      {/* Contenido */}
      <div className={`pb-6 flex-1 ${isLast ? '' : ''}`}>
        <div className="flex items-start justify-between gap-2">
          <p className={`font-semibold text-sm ${cfg.color}`}>{evento.titulo}</p>
          <time className="text-xs text-slate-400 shrink-0 tabular-nums">{fmtFecha(evento.created_at)}</time>
        </div>

        {evento.descripcion && (
          <div className="mt-1">
            <p className={`text-sm text-slate-600 leading-relaxed ${!expandido && descLarga ? 'line-clamp-2' : ''}`}>
              {evento.descripcion}
            </p>
            {descLarga && (
              <button
                onClick={() => setExpandido(e => !e)}
                className="flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700 mt-0.5 transition"
              >
                {expandido ? <><ChevronUp size={12} /> Ver menos</> : <><ChevronDown size={12} /> Ver más</>}
              </button>
            )}
          </div>
        )}

        {/* Metadata renderizada según el tipo */}
        {renderMetadata(evento)}
      </div>
    </div>
  );
};

// ─── Componente principal del Drawer ─────────────────────────────────────────
const TimelineDrawer: React.FC<TimelineDrawerProps> = ({ ingresoId, vehiculoInfo, onClose }) => {
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    const fetchBitacora = async () => {
      try {
        setLoading(true);
        const res = await api.get(`/ingresos/${ingresoId}/bitacora?limit=100`);
        setEventos(res.data.eventos || []);
      } catch (err: any) {
        setError('No se pudo cargar la bitácora.');
      } finally {
        setLoading(false);
      }
    };
    fetchBitacora();
  }, [ingresoId]);

  // Cerrar con Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      {/* Overlay — click para cerrar */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/*
        Panel adaptativo:
        - Móvil (< sm): bottom-sheet, ocupa toda la pantalla de forma vertical
        - Desktop (sm+): slide-over lateral desde la derecha
      */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Bitácora de la visita"
        className={[
          'fixed z-50 bg-white flex flex-col shadow-2xl',
          // Móvil: desde abajo, ancho completo, altura ~90vh
          'bottom-0 left-0 right-0 max-h-[90vh] rounded-t-2xl',
          // Desktop: lateral derecho, altura completa
          'sm:bottom-auto sm:top-0 sm:left-auto sm:right-0 sm:max-h-full sm:h-full sm:w-full sm:max-w-md sm:rounded-none sm:rounded-l-2xl',
          // Animación de entrada
          'animate-slide-up sm:animate-slide-left',
        ].join(' ')}
      >
        {/* ── Cabecera ── */}
        <div className="flex items-start justify-between p-5 border-b border-slate-100 shrink-0">
          {/* Botón cerrar: arriba-izquierda, táctil (44x44px mínimo) */}
          <button
            onClick={onClose}
            className="p-2 -ml-1 rounded-full hover:bg-slate-100 transition text-slate-500 hover:text-slate-900 min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label="Cerrar bitácora"
          >
            <X size={20} />
          </button>

          <div className="flex-1 ml-3">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-indigo-50 rounded-xl">
                <Car size={18} className="text-indigo-600" />
              </div>
              <div>
                <h2 className="text-lg font-black text-slate-900 leading-tight">{vehiculoInfo.placa}</h2>
                <p className="text-sm text-slate-500">{vehiculoInfo.marca} {vehiculoInfo.linea}</p>
              </div>
            </div>
            <p className="text-sm text-slate-600 mt-2">
              <span className="font-medium">Cliente:</span> {vehiculoInfo.cliente}
            </p>
          </div>
        </div>

        {/* ── Handle visual en móvil (para indicar que se puede swipe down) ── */}
        <div className="flex justify-center pt-2 sm:hidden shrink-0">
          <div className="w-10 h-1 rounded-full bg-slate-200" />
        </div>

        {/* ── Cuerpo con línea de tiempo ── */}
        <div className="flex-1 overflow-y-auto p-5 space-y-0">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-5">
            Bitácora de la Visita
          </p>

          {loading && (
            <div className="flex justify-center items-center py-12">
              <Loader2 className="animate-spin text-indigo-600 w-8 h-8" />
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">
              <AlertCircle size={16} /> {error}
            </div>
          )}

          {!loading && !error && eventos.length === 0 && (
            <div className="text-center py-12 text-slate-400">
              <ClipboardList size={40} className="mx-auto mb-3 opacity-20" />
              <p className="font-medium">Sin eventos registrados</p>
              <p className="text-sm mt-1">Los eventos aparecerán aquí a medida que avance la orden.</p>
            </div>
          )}

          {!loading && eventos.length > 0 && (
            <div>
              {eventos.map((ev, idx) => (
                <EventoCard
                  key={ev.id}
                  evento={ev}
                  isLast={idx === eventos.length - 1}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── Footer con total de eventos ── */}
        {!loading && eventos.length > 0 && (
          <div className="shrink-0 px-5 py-3 border-t border-slate-100 text-xs text-slate-400 text-center">
            {eventos.length} evento{eventos.length !== 1 ? 's' : ''} registrado{eventos.length !== 1 ? 's' : ''} en esta visita
          </div>
        )}
      </div>
    </>
  );
};

export default TimelineDrawer;
