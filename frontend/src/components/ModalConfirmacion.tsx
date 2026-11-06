import React, { useEffect } from 'react';
import { X, AlertTriangle, Trash2, Info, CheckCircle2, Loader2 } from 'lucide-react';

export type ModalTipoConfirmacion = 'danger' | 'warning' | 'info' | 'success';

export interface ModalConfirmacionProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  tipo?: ModalTipoConfirmacion;
  loading?: boolean;
  icon?: React.ReactNode;
  children?: React.ReactNode;
}

export const ModalConfirmacion: React.FC<ModalConfirmacionProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  tipo = 'danger',
  loading = false,
  icon,
  children,
}) => {
  // Cerrar con Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !loading) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, loading, onClose]);

  if (!isOpen) return null;

  const tipoConfig = {
    danger: {
      icon: icon || <Trash2 size={24} className="text-red-600" />,
      iconBg: 'bg-red-50 border-red-100',
      btnConfirm: 'bg-red-600 hover:bg-red-700 text-white shadow-sm shadow-red-500/20 focus:ring-red-500',
    },
    warning: {
      icon: icon || <AlertTriangle size={24} className="text-amber-600" />,
      iconBg: 'bg-amber-50 border-amber-100',
      btnConfirm: 'bg-amber-600 hover:bg-amber-700 text-white shadow-sm shadow-amber-500/20 focus:ring-amber-500',
    },
    info: {
      icon: icon || <Info size={24} className="text-indigo-600" />,
      iconBg: 'bg-indigo-50 border-indigo-100',
      btnConfirm: 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm shadow-indigo-500/20 focus:ring-indigo-500',
    },
    success: {
      icon: icon || <CheckCircle2 size={24} className="text-emerald-600" />,
      iconBg: 'bg-emerald-50 border-emerald-100',
      btnConfirm: 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm shadow-emerald-500/20 focus:ring-emerald-500',
    },
  }[tipo];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs transition-opacity animate-fade-in"
      onClick={() => { if (!loading) onClose(); }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-md w-full overflow-hidden p-6 relative animate-fade-in-up"
        onClick={e => e.stopPropagation()}
      >
        {/* Botón cerrar X */}
        <button
          onClick={onClose}
          disabled={loading}
          aria-label="Cerrar modal"
          className="absolute top-5 right-5 text-slate-400 hover:text-slate-600 p-1 rounded-xl hover:bg-slate-100 transition-colors disabled:opacity-50"
        >
          <X size={20} />
        </button>

        {/* Encabezado con Icono */}
        <div className="flex items-start gap-4 mb-4">
          <div className={`p-3 rounded-2xl border ${tipoConfig.iconBg} shrink-0`}>
            {tipoConfig.icon}
          </div>
          <div className="pr-6">
            <h3 className="text-lg font-bold text-slate-900 tracking-tight leading-snug">
              {title}
            </h3>
            {description && (
              <div className="text-sm text-slate-500 mt-1 leading-relaxed">
                {description}
              </div>
            )}
          </div>
        </div>

        {/* Contenido / Vista previa opcional */}
        {children && <div className="mb-5">{children}</div>}

        {/* Botones de acción */}
        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="flex-1 py-2.5 px-4 rounded-xl border border-slate-200 text-slate-700 font-semibold hover:bg-slate-50 transition-colors text-sm disabled:opacity-50 cursor-pointer text-center"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`flex-1 py-2.5 px-4 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer ${tipoConfig.btnConfirm} disabled:opacity-50`}
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : null}
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ModalConfirmacion;
