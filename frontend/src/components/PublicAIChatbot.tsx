import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Turnstile } from '@marsidev/react-turnstile';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Mensaje {
  role: 'user' | 'model';
  parts: { text: string }[];
  timestamp?: Date;
}

interface LeadForm {
  nombre: string;
  telefono: string;
  vehiculo_marca: string;
  vehiculo_linea: string;
  acepta_terminos: boolean;
}

interface PublicAIChatbotProps {
  /** Slug del taller (requerido). Ejemplo: 'eurofrenos' */
  empresaSlug: string;
  /** Site Key de Cloudflare Turnstile para el dominio de esta landing page */
  turnstileSiteKey?: string;
  /** Nombre visible del taller en el encabezado del widget */
  workshopName?: string;
  /** Número de WhatsApp del taller para el botón de contacto directo */
  phoneNumber?: string;
  /** URL base de la API del backend */
  apiUrl?: string;
  /** Color primario del widget en formato hex (default: #4f46e5 — índigo) */
  primaryColor?: string;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const API_URL_DEFAULT = import.meta.env.VITE_API_URL ?? 'http://localhost:3001/api';
const TURNSTILE_KEY_DEFAULT = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? '';

// ─── Helper: Parsear texto del modelo para sugerencias y contenido limpio ─────

interface MensajeParsed {
  texto: string;
  sugerencias: string[];
}

function parsearMensaje(text: string): MensajeParsed {
  const regex = /\[SUGERENCIA:\s*(.*?)\]/g;
  const sugerencias: string[] = [];
  const matches = [...text.matchAll(regex)];
  matches.forEach(m => sugerencias.push(m[1].trim()));
  const texto = text.replace(regex, '').trim();
  return { texto, sugerencias };
}

function generarLinkWA(phone: string, mensaje: string): string {
  const tel = phone.replace(/\D/g, '');
  return `https://wa.me/${tel.startsWith('57') ? tel : `57${tel}`}?text=${encodeURIComponent(mensaje)}`;
}

// ─── Subcomponente: Burbuja de Mensaje ────────────────────────────────────────

const BurbujaMensaje: React.FC<{
  mensaje: Mensaje;
  onSugerencia: (texto: string) => void;
  primaryColor: string;
}> = ({ mensaje, onSugerencia, primaryColor }) => {
  const esUsuario = mensaje.role === 'user';
  const { texto, sugerencias } = parsearMensaje(mensaje.parts[0]?.text ?? '');

  // Detectar si el texto contiene la Regla de Oro para resaltarla
  const tieneReglaDeOro = texto.includes('⚠️') || texto.toLowerCase().includes('orientativa');

  return (
    <div className={`ai-chatbot-msg ${esUsuario ? 'ai-msg-user' : 'ai-msg-bot'}`}>
      {!esUsuario && (
        <div className="ai-avatar ai-avatar-bot" style={{ background: primaryColor }}>
          🔧
        </div>
      )}
      <div className={`ai-bubble ${esUsuario ? 'ai-bubble-user' : 'ai-bubble-bot'}`}
        style={esUsuario ? { background: primaryColor } : undefined}>
        {tieneReglaDeOro && !esUsuario ? (
          <div className="ai-bubble-content">
            {texto.split(/(⚠️[^⚠️]*)/g).map((parte, i) =>
              parte.startsWith('⚠️') ? (
                <div key={i} className="ai-regla-de-oro">
                  {parte}
                </div>
              ) : (
                <span key={i} style={{ whiteSpace: 'pre-wrap' }}>{parte}</span>
              )
            )}
          </div>
        ) : (
          <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{texto}</p>
        )}

        {sugerencias.length > 0 && (
          <div className="ai-sugerencias">
            {sugerencias.map((sug, idx) => (
              <button
                key={idx}
                onClick={() => onSugerencia(sug)}
                className="ai-sugerencia-btn"
                style={{ borderColor: primaryColor, color: primaryColor }}
              >
                {sug}
              </button>
            ))}
          </div>
        )}
      </div>
      {esUsuario && (
        <div className="ai-avatar ai-avatar-user" style={{ background: primaryColor }}>
          👤
        </div>
      )}
    </div>
  );
};

// ─── Subcomponente: Indicador de escritura ────────────────────────────────────

const TypingIndicator: React.FC<{ primaryColor: string }> = ({ primaryColor }) => (
  <div className="ai-chatbot-msg ai-msg-bot">
    <div className="ai-avatar ai-avatar-bot" style={{ background: primaryColor }}>🔧</div>
    <div className="ai-bubble ai-bubble-bot ai-typing">
      <span style={{ background: primaryColor }} />
      <span style={{ background: primaryColor }} />
      <span style={{ background: primaryColor }} />
    </div>
  </div>
);

// ─── Subcomponente: Modal de Captura de Lead ──────────────────────────────────

const ModalLead: React.FC<{
  onClose: () => void;
  onSubmit: (form: LeadForm) => Promise<void>;
  workshopName: string;
  primaryColor: string;
  loading: boolean;
}> = ({ onClose, onSubmit, workshopName, primaryColor, loading }) => {
  const [form, setForm] = useState<LeadForm>({
    nombre: '',
    telefono: '',
    vehiculo_marca: '',
    vehiculo_linea: '',
    acepta_terminos: false,
  });
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.acepta_terminos) {
      setError('Debes aceptar el tratamiento de datos para continuar.');
      return;
    }
    if (!form.telefono.trim()) {
      setError('El número de teléfono es obligatorio.');
      return;
    }
    setError('');
    await onSubmit(form);
  };

  return (
    <div className="ai-modal-overlay" onClick={onClose}>
      <div className="ai-modal" onClick={e => e.stopPropagation()}>
        <button className="ai-modal-close" onClick={onClose}>✕</button>
        <div className="ai-modal-header" style={{ background: primaryColor }}>
          <span style={{ fontSize: 24 }}>📅</span>
          <div>
            <h3 style={{ margin: 0, fontSize: 16 }}>Agendar cita</h3>
            <p style={{ margin: 0, fontSize: 12, opacity: 0.9 }}>{workshopName}</p>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="ai-modal-form">
          <div className="ai-form-group">
            <label>Tu nombre</label>
            <input
              type="text"
              placeholder="Ej: Juan García"
              value={form.nombre}
              onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))}
            />
          </div>
          <div className="ai-form-group">
            <label>Teléfono / WhatsApp <span className="ai-required">*</span></label>
            <input
              type="tel"
              placeholder="Ej: 3001234567"
              value={form.telefono}
              onChange={e => setForm(p => ({ ...p, telefono: e.target.value }))}
              required
            />
          </div>
          <div className="ai-form-row">
            <div className="ai-form-group">
              <label>Marca del vehículo</label>
              <input
                type="text"
                placeholder="Ej: Chevrolet"
                value={form.vehiculo_marca}
                onChange={e => setForm(p => ({ ...p, vehiculo_marca: e.target.value }))}
              />
            </div>
            <div className="ai-form-group">
              <label>Línea / Modelo</label>
              <input
                type="text"
                placeholder="Ej: Spark 2019"
                value={form.vehiculo_linea}
                onChange={e => setForm(p => ({ ...p, vehiculo_linea: e.target.value }))}
              />
            </div>
          </div>

          {/* Cumplimiento Ley 1581 de 2012 – Habeas Data Colombia */}
          <label className="ai-checkbox-label">
            <input
              type="checkbox"
              checked={form.acepta_terminos}
              onChange={e => setForm(p => ({ ...p, acepta_terminos: e.target.checked }))}
              required
            />
            <span>
              Autorizo el tratamiento de mis datos personales conforme a la{' '}
              <strong>Ley 1581 de 2012</strong> y la política de privacidad de{' '}
              {workshopName} para ser contactado sobre este servicio.{' '}
              <span className="ai-required">*</span>
            </span>
          </label>

          {error && <p className="ai-form-error">{error}</p>}

          <button
            type="submit"
            className="ai-submit-btn"
            style={{ background: primaryColor }}
            disabled={loading || !form.acepta_terminos}
          >
            {loading ? 'Enviando...' : '📞 Solicitar que me contacten'}
          </button>
        </form>
      </div>
    </div>
  );
};

// ─── Componente Principal: PublicAIChatbot ────────────────────────────────────

export const PublicAIChatbot: React.FC<PublicAIChatbotProps> = ({
  empresaSlug,
  turnstileSiteKey = TURNSTILE_KEY_DEFAULT,
  workshopName = 'Nuestro Taller',
  phoneNumber,
  apiUrl = API_URL_DEFAULT,
  primaryColor = '#4f46e5',
}) => {
  const [abierto, setAbierto] = useState(false);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [input, setInput] = useState('');
  const [cargando, setCargando] = useState(false);
  const [telefonoTaller, setTelefonoTaller] = useState<string | null>(phoneNumber ?? null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [showLead, setShowLead] = useState(false);
  const [leadLoading, setLeadLoading] = useState(false);
  const [leadExito, setLeadExito] = useState(false);
  const [fallback, setFallback] = useState(false);
  const [ultimaCotizacion, setUltimaCotizacion] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => { scrollBottom(); }, [mensajes, cargando]);

  // Saludo inicial automático al abrir el widget
  useEffect(() => {
    if (abierto && mensajes.length === 0) {
      setMensajes([{
        role: 'model',
        parts: [{
          text: `¡Hola! 👋 Soy el Asesor Virtual de **${workshopName}**.\n\n¿En qué problema del vehículo te puedo ayudar hoy? Cuéntame los síntomas y te daré una estimación de costos.\n[SUGERENCIA: ¿Cuánto cuesta un cambio de pastillas de freno?]\n[SUGERENCIA: ¿Cuánto vale un cambio de aceite para un Renault Sandero?]`,
        }],
        timestamp: new Date(),
      }]);
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [abierto, mensajes.length, workshopName]);

  const enviarMensaje = useCallback(async (texto: string) => {
    if (!texto.trim() || cargando) return;

    const mensajeUsuario: Mensaje = {
      role: 'user',
      parts: [{ text: texto.trim() }],
      timestamp: new Date(),
    };

    const historialActualizado = [...mensajes, mensajeUsuario];
    setMensajes(historialActualizado);
    setInput('');
    setCargando(true);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (turnstileToken) headers['cf-turnstile-token'] = turnstileToken;

      const response = await fetch(`${apiUrl}/ai/public/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          empresa_slug: empresaSlug,
          messages: historialActualizado.map(m => ({ role: m.role, parts: m.parts })),
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        if (data.fallback) {
          setFallback(true);
        }
        throw new Error(data.error || 'Error de conexión');
      }

      const data = await response.json();

      // Guardar el teléfono del taller si viene en la respuesta
      if (data.telefono_taller) setTelefonoTaller(data.telefono_taller);

      // Detectar si la respuesta contiene una cotización para el modal de leads
      const tieneCotizacion = /(\$[\d.,]+|[\d.,]+ COP|costo|valor|estimad)/i.test(data.text ?? '');
      if (tieneCotizacion) {
        setUltimaCotizacion(data.text ?? '');
      }

      setMensajes(prev => [
        ...prev,
        {
          role: 'model',
          parts: [{ text: data.text ?? 'No se recibió respuesta.' }],
          timestamp: new Date(),
        },
      ]);

      // Mostrar CTA de lead después de la primera cotización
      if (tieneCotizacion && !leadExito) {
        setTimeout(() => setShowLead(true), 2500);
      }

    } catch (err: any) {
      setMensajes(prev => [
        ...prev,
        {
          role: 'model',
          parts: [{
            text: fallback || err.message?.includes('servicio')
              ? `Lo siento, el asistente no está disponible en este momento. 😔\n\n${telefonoTaller ? `Contáctanos directamente al **${telefonoTaller}** y con gusto te atendemos.` : 'Por favor contáctanos directamente para cotizar.'}`
              : '⚠️ Error de conexión. Por favor intenta de nuevo en un momento.',
          }],
          timestamp: new Date(),
        },
      ]);
    } finally {
      setCargando(false);
    }
  }, [mensajes, cargando, turnstileToken, apiUrl, empresaSlug, fallback, telefonoTaller, leadExito]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    enviarMensaje(input);
  };

  const handleLead = async (form: LeadForm) => {
    setLeadLoading(true);
    try {
      await fetch(`${apiUrl}/ai/public/lead`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empresa_slug: empresaSlug,
          nombre: form.nombre,
          telefono: form.telefono,
          vehiculo_marca: form.vehiculo_marca,
          vehiculo_linea: form.vehiculo_linea,
          motivo_consulta: mensajes.find(m => m.role === 'user')?.parts[0]?.text,
          cotizacion_estimada: ultimaCotizacion.slice(0, 500),
          acepta_terminos: form.acepta_terminos,
          origen_url: window.location.href,
        }),
      });
      setLeadExito(true);
      setShowLead(false);
      setMensajes(prev => [
        ...prev,
        {
          role: 'model',
          parts: [{ text: `✅ ¡Perfecto! Hemos registrado tu solicitud de cita. El equipo de **${workshopName}** te contactará pronto al número ${form.telefono}.\n\n¿Tienes alguna otra pregunta sobre tu vehículo?` }],
          timestamp: new Date(),
        },
      ]);
    } catch {
      // Lead silenciosamente fallido — no interrumpir la conversación
    } finally {
      setLeadLoading(false);
    }
  };

  const whatsappUrl = telefonoTaller
    ? generarLinkWA(telefonoTaller, `Hola, me comunico desde su página web. Quisiera cotizar un servicio para mi vehículo.`)
    : null;

  // Número de mensajes no leídos (para el badge del FAB)
  const mensajesNoVistos = !abierto && mensajes.length > 0 ? mensajes.filter(m => m.role === 'model').length : 0;

  return (
    <>
      {/* ── Estilos del Widget ── */}
      <style>{`
        .ai-chatbot-fab {
          position: fixed;
          bottom: 24px;
          right: 24px;
          z-index: 9998;
          width: 60px;
          height: 60px;
          border-radius: 50%;
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 28px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.25);
          transition: transform 0.2s ease, box-shadow 0.2s ease;
          animation: ai-fab-pulse 2.5s infinite;
        }
        .ai-chatbot-fab:hover {
          transform: scale(1.1);
          box-shadow: 0 12px 40px rgba(0,0,0,0.3);
        }
        @keyframes ai-fab-pulse {
          0%, 100% { box-shadow: 0 8px 32px rgba(0,0,0,0.25); }
          50% { box-shadow: 0 8px 48px rgba(79,70,229,0.45); }
        }
        .ai-fab-badge {
          position: absolute;
          top: -4px;
          right: -4px;
          background: #ef4444;
          color: white;
          font-size: 11px;
          font-weight: 700;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 2px solid white;
          animation: ai-badge-bounce 1s ease infinite alternate;
        }
        @keyframes ai-badge-bounce {
          from { transform: scale(1); }
          to { transform: scale(1.2); }
        }
        .ai-chatbot-window {
          position: fixed;
          bottom: 96px;
          right: 24px;
          z-index: 9999;
          width: 380px;
          max-width: calc(100vw - 32px);
          height: 560px;
          max-height: calc(100vh - 120px);
          background: #ffffff;
          border-radius: 20px;
          box-shadow: 0 24px 80px rgba(0,0,0,0.2), 0 4px 16px rgba(0,0,0,0.1);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          transform-origin: bottom right;
          transition: transform 0.25s cubic-bezier(0.34,1.56,0.64,1), opacity 0.2s ease;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        .ai-chatbot-window.ai-cerrado {
          transform: scale(0.7) translateY(20px);
          opacity: 0;
          pointer-events: none;
        }
        .ai-chatbot-header {
          padding: 14px 16px;
          display: flex;
          align-items: center;
          gap: 10px;
          flex-shrink: 0;
          color: white;
        }
        .ai-header-icon {
          font-size: 22px;
          width: 36px;
          height: 36px;
          background: rgba(255,255,255,0.2);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .ai-header-text { flex: 1; min-width: 0; }
        .ai-header-text h4 {
          margin: 0;
          font-size: 14px;
          font-weight: 700;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ai-header-text p {
          margin: 0;
          font-size: 11px;
          opacity: 0.85;
        }
        .ai-header-online {
          width: 8px;
          height: 8px;
          background: #4ade80;
          border-radius: 50%;
          flex-shrink: 0;
          box-shadow: 0 0 6px #4ade80;
          animation: ai-online-blink 2s ease infinite;
        }
        @keyframes ai-online-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        .ai-header-close {
          background: rgba(255,255,255,0.15);
          border: none;
          color: white;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          transition: background 0.15s;
          flex-shrink: 0;
        }
        .ai-header-close:hover { background: rgba(255,255,255,0.3); }
        .ai-chatbot-messages {
          flex: 1;
          overflow-y: auto;
          padding: 16px 12px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          background: #f8fafc;
          scroll-behavior: smooth;
        }
        .ai-chatbot-messages::-webkit-scrollbar { width: 4px; }
        .ai-chatbot-messages::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 2px; }
        .ai-chatbot-msg {
          display: flex;
          align-items: flex-end;
          gap: 8px;
        }
        .ai-msg-user { flex-direction: row-reverse; }
        .ai-msg-bot { flex-direction: row; }
        .ai-avatar {
          width: 30px;
          height: 30px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          flex-shrink: 0;
          box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        }
        .ai-bubble {
          max-width: 82%;
          padding: 10px 13px;
          border-radius: 16px;
          font-size: 13.5px;
          line-height: 1.5;
          word-break: break-word;
        }
        .ai-bubble-user {
          color: white;
          border-bottom-right-radius: 4px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        }
        .ai-bubble-bot {
          background: white;
          color: #1e293b;
          border-bottom-left-radius: 4px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.08);
          border: 1px solid #e2e8f0;
        }
        .ai-bubble-content { display: flex; flex-direction: column; gap: 6px; }
        .ai-regla-de-oro {
          background: #fffbeb;
          border: 1px solid #fcd34d;
          border-radius: 8px;
          padding: 8px 10px;
          font-size: 12px;
          color: #78350f;
          line-height: 1.4;
        }
        .ai-sugerencias {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 8px;
        }
        .ai-sugerencia-btn {
          font-size: 11.5px;
          padding: 4px 10px;
          border-radius: 20px;
          border: 1.5px solid;
          background: transparent;
          cursor: pointer;
          transition: all 0.15s ease;
          font-weight: 500;
          white-space: nowrap;
        }
        .ai-sugerencia-btn:hover {
          opacity: 0.8;
          transform: translateY(-1px);
        }
        .ai-typing {
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 12px 16px;
        }
        .ai-typing span {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          display: block;
          animation: ai-bounce 1.2s infinite ease-in-out;
        }
        .ai-typing span:nth-child(1) { animation-delay: 0s; }
        .ai-typing span:nth-child(2) { animation-delay: 0.2s; }
        .ai-typing span:nth-child(3) { animation-delay: 0.4s; }
        @keyframes ai-bounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.5; }
          30% { transform: translateY(-6px); opacity: 1; }
        }
        .ai-chatbot-footer {
          padding: 10px 12px;
          background: white;
          border-top: 1px solid #e2e8f0;
          flex-shrink: 0;
        }
        .ai-footer-actions {
          display: flex;
          gap: 6px;
          margin-bottom: 8px;
        }
        .ai-btn-lead, .ai-btn-wa {
          flex: 1;
          font-size: 12px;
          font-weight: 600;
          padding: 7px 8px;
          border-radius: 10px;
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          transition: opacity 0.15s, transform 0.15s;
          text-decoration: none;
        }
        .ai-btn-lead:hover, .ai-btn-wa:hover {
          opacity: 0.88;
          transform: translateY(-1px);
        }
        .ai-btn-wa {
          background: #25d366;
          color: white;
        }
        .ai-input-row {
          display: flex;
          gap: 8px;
          align-items: center;
        }
        .ai-input-row input {
          flex: 1;
          padding: 9px 14px;
          border-radius: 22px;
          border: 1.5px solid #e2e8f0;
          font-size: 13.5px;
          outline: none;
          transition: border-color 0.15s;
          background: #f8fafc;
        }
        .ai-input-row input:focus { border-color: var(--ai-primary, #4f46e5); background: white; }
        .ai-input-row button {
          width: 38px;
          height: 38px;
          border-radius: 50%;
          border: none;
          color: white;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 17px;
          transition: transform 0.15s, opacity 0.15s;
          flex-shrink: 0;
        }
        .ai-input-row button:hover:not(:disabled) { transform: scale(1.1); }
        .ai-input-row button:disabled { opacity: 0.5; cursor: not-allowed; }
        .ai-powered {
          text-align: center;
          font-size: 10px;
          color: #94a3b8;
          margin-top: 6px;
        }
        /* ── Modal de Lead ── */
        .ai-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.5);
          z-index: 10000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
          backdrop-filter: blur(4px);
        }
        .ai-modal {
          background: white;
          border-radius: 20px;
          width: 100%;
          max-width: 400px;
          overflow: hidden;
          box-shadow: 0 32px 80px rgba(0,0,0,0.25);
          position: relative;
          animation: ai-modal-in 0.25s cubic-bezier(0.34,1.56,0.64,1);
        }
        @keyframes ai-modal-in {
          from { transform: scale(0.85); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        .ai-modal-close {
          position: absolute;
          top: 12px;
          right: 12px;
          background: rgba(255,255,255,0.2);
          border: none;
          color: white;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          cursor: pointer;
          font-size: 14px;
          z-index: 1;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .ai-modal-header {
          padding: 20px 20px 16px;
          display: flex;
          align-items: center;
          gap: 12px;
          color: white;
        }
        .ai-modal-header h3 { font-size: 17px; font-weight: 700; }
        .ai-modal-form { padding: 16px 20px 20px; display: flex; flex-direction: column; gap: 12px; }
        .ai-form-group { display: flex; flex-direction: column; gap: 4px; }
        .ai-form-group label { font-size: 12px; font-weight: 600; color: #475569; }
        .ai-form-group input {
          padding: 9px 12px;
          border-radius: 10px;
          border: 1.5px solid #e2e8f0;
          font-size: 14px;
          outline: none;
          transition: border-color 0.15s;
        }
        .ai-form-group input:focus { border-color: #4f46e5; }
        .ai-form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .ai-required { color: #ef4444; }
        .ai-checkbox-label {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          font-size: 12px;
          color: #475569;
          line-height: 1.4;
          cursor: pointer;
        }
        .ai-checkbox-label input { margin-top: 2px; flex-shrink: 0; }
        .ai-form-error { font-size: 12px; color: #ef4444; margin: 0; }
        .ai-submit-btn {
          padding: 12px;
          border-radius: 12px;
          border: none;
          color: white;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          transition: opacity 0.15s;
        }
        .ai-submit-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        @media (max-width: 430px) {
          .ai-chatbot-window {
            bottom: 0;
            right: 0;
            width: 100vw;
            height: 100dvh;
            max-height: 100dvh;
            border-radius: 0;
          }
          .ai-chatbot-fab { bottom: 16px; right: 16px; }
        }
      `}</style>

      {/* ── Turnstile invisible (se renderiza oculto para obtener el token) ── */}
      {turnstileSiteKey && (
        <Turnstile
          siteKey={turnstileSiteKey}
          onSuccess={token => setTurnstileToken(token)}
          onError={() => setTurnstileToken(null)}
          options={{ theme: 'light', size: 'invisible' }}
          style={{ display: 'none' }}
        />
      )}

      {/* ── Ventana de Chat ── */}
      <div className={`ai-chatbot-window ${abierto ? '' : 'ai-cerrado'}`} role="dialog" aria-label={`Chat con ${workshopName}`}>
        {/* Header */}
        <div className="ai-chatbot-header" style={{ background: primaryColor }}>
          <div className="ai-header-icon">🔧</div>
          <div className="ai-header-text">
            <h4>Asesor Virtual — {workshopName}</h4>
            <p>Cotizaciones orientativas • En línea</p>
          </div>
          <div className="ai-header-online" title="En línea" />
          <button className="ai-header-close" onClick={() => setAbierto(false)} aria-label="Cerrar chat">✕</button>
        </div>

        {/* Área de mensajes */}
        <div className="ai-chatbot-messages" role="log" aria-live="polite">
          {mensajes.map((msg, idx) => (
            <BurbujaMensaje
              key={idx}
              mensaje={msg}
              onSugerencia={texto => enviarMensaje(texto)}
              primaryColor={primaryColor}
            />
          ))}
          {cargando && <TypingIndicator primaryColor={primaryColor} />}
          <div ref={messagesEndRef} />
        </div>

        {/* Footer: acciones + input */}
        <div className="ai-chatbot-footer">
          <div className="ai-footer-actions">
            <button
              className="ai-btn-lead"
              style={{ background: primaryColor, color: 'white' }}
              onClick={() => setShowLead(true)}
            >
              📅 Agendar cita
            </button>
            {whatsappUrl && (
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ai-btn-wa"
                aria-label="Contactar por WhatsApp"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                  <path d="M12 0C5.373 0 0 5.373 0 12c0 2.115.549 4.103 1.506 5.83L0 24l6.335-1.499C8.035 23.47 9.981 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.896 0-3.674-.497-5.215-1.362l-.375-.223-3.872.916.977-3.769-.245-.39C2.486 15.653 2 13.885 2 12 2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
                </svg>
                WhatsApp
              </a>
            )}
          </div>
          <form className="ai-input-row" onSubmit={handleSubmit}>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Describe el problema de tu vehículo..."
              disabled={cargando}
              aria-label="Escribe tu mensaje"
              maxLength={500}
            />
            <button
              type="submit"
              disabled={!input.trim() || cargando}
              style={{ background: primaryColor }}
              aria-label="Enviar mensaje"
            >
              ➤
            </button>
          </form>
          <p className="ai-powered">Cotizaciones orientativas · {workshopName} · Powered by IA</p>
        </div>
      </div>

      {/* ── Floating Action Button ── */}
      <button
        className="ai-chatbot-fab"
        style={{ background: primaryColor }}
        onClick={() => setAbierto(prev => !prev)}
        aria-label={abierto ? 'Cerrar asistente virtual' : 'Abrir asistente virtual'}
        title={`Cotiza con ${workshopName}`}
      >
        {abierto ? '✕' : '💬'}
        {mensajesNoVistos > 0 && !abierto && (
          <span className="ai-fab-badge">{mensajesNoVistos > 9 ? '9+' : mensajesNoVistos}</span>
        )}
      </button>

      {/* ── Modal de Captura de Lead ── */}
      {showLead && !leadExito && (
        <ModalLead
          onClose={() => setShowLead(false)}
          onSubmit={handleLead}
          workshopName={workshopName}
          primaryColor={primaryColor}
          loading={leadLoading}
        />
      )}
    </>
  );
};

export default PublicAIChatbot;
