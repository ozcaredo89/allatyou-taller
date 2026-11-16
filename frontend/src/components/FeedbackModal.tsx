import React, { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { X, Lightbulb, Bug, Heart, CheckCircle2, MessageSquarePlus } from 'lucide-react';
import { sendFeedback, seccionDesdePath, type FeedbackTipo } from '../utils/analytics';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const TIPOS: { id: FeedbackTipo; label: string; icon: typeof Lightbulb; placeholder: string }[] = [
  { id: 'idea', label: 'Idea', icon: Lightbulb, placeholder: '¿Qué te gustaría que hiciera el sistema?' },
  { id: 'problema', label: 'Problema', icon: Bug, placeholder: '¿Qué falló o qué te hizo perder tiempo?' },
  { id: 'me_gusta', label: 'Me gusta', icon: Heart, placeholder: '¿Qué es lo que más te sirve?' },
];

export const FeedbackModal: React.FC<FeedbackModalProps> = ({ isOpen, onClose: onCloseProp }) => {
  const location = useLocation();
  const [tipo, setTipo] = useState<FeedbackTipo>('idea');
  const [mensaje, setMensaje] = useState('');
  const [estado, setEstado] = useState<'form' | 'enviado' | 'error'>('form');

  const onClose = useCallback(() => {
    setEstado('form');
    onCloseProp();
  }, [onCloseProp]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const texto = mensaje.trim();
  const tipoActual = TIPOS.find(t => t.id === tipo)!;

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!texto) return;
    if (sendFeedback(tipo, texto, seccionDesdePath(location.pathname))) {
      setMensaje('');
      setEstado('enviado');
    } else {
      setEstado('error');
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Enviar sugerencia"
    >
      <div
        className="bg-white text-slate-900 rounded-3xl shadow-2xl border border-slate-100 max-w-md w-full p-6 relative animate-fade-in-up"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Cerrar"
          className="absolute top-5 right-5 text-slate-400 hover:text-slate-600 p-1 rounded-xl hover:bg-slate-100 transition-colors"
        >
          <X size={20} />
        </button>

        {estado === 'enviado' ? (
          <div className="text-center py-6">
            <CheckCircle2 size={44} className="text-emerald-500 mx-auto mb-3" />
            <h3 className="text-lg font-bold">¡Gracias!</h3>
            <p className="text-sm text-slate-500 mt-1">Leemos cada mensaje para mejorar el sistema.</p>
            <button
              onClick={onClose}
              className="mt-5 py-2.5 px-6 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm transition-colors"
            >
              Cerrar
            </button>
          </div>
        ) : (
          <form onSubmit={enviar}>
            <div className="flex items-start gap-4 mb-4">
              <div className="p-3 rounded-2xl border bg-indigo-50 border-indigo-100 shrink-0">
                <MessageSquarePlus size={24} className="text-indigo-600" />
              </div>
              <div className="pr-6">
                <h3 className="text-lg font-bold tracking-tight leading-snug">Ayúdanos a mejorar</h3>
                <p className="text-sm text-slate-500 mt-1">Cuéntanos qué cambiarías, qué falla o qué te gusta.</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 mb-3">
              {TIPOS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTipo(id)}
                  className={`flex items-center justify-center gap-1.5 py-2 rounded-xl border text-sm font-semibold transition-colors ${
                    tipo === id
                      ? 'bg-indigo-600 border-indigo-600 text-white'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Icon size={15} />
                  {label}
                </button>
              ))}
            </div>

            <textarea
              value={mensaje}
              onChange={e => setMensaje(e.target.value)}
              placeholder={tipoActual.placeholder}
              rows={5}
              maxLength={2000}
              autoFocus
              className="w-full rounded-xl border border-slate-200 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
            <p className="text-xs text-slate-400 mt-1">No incluyas datos de clientes (placas, teléfonos, nombres).</p>

            {estado === 'error' && (
              <p className="text-sm text-red-600 mt-2">
                No pudimos enviar tu mensaje. Intenta de nuevo más tarde.
              </p>
            )}

            <div className="flex items-center gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 px-4 rounded-xl border border-slate-200 text-slate-700 font-semibold hover:bg-slate-50 transition-colors text-sm"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={!texto}
                className="flex-1 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm transition-colors disabled:opacity-50"
              >
                Enviar
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default FeedbackModal;
