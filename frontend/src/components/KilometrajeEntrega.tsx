import React, { useEffect, useRef, useState } from 'react';
import { Gauge, Loader2, CheckSquare } from 'lucide-react';
import { parseKilometraje } from '../services/rentingOdometer';

interface CampoProps {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  autoFocus?: boolean;
  onEnter?: () => void;
}

/** Campo de kilometraje del tablero para entregas con cambio de aceite (flota Renting). */
export const CampoKilometrajeEntrega: React.FC<CampoProps> = ({ value, onChange, error, autoFocus, onEnter }) => {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (autoFocus) ref.current?.focus(); }, [autoFocus]);

  return (
    <div className="bg-sky-50 border border-sky-200 rounded-xl p-3.5">
      <label htmlFor="kilometraje-entrega" className="flex items-center gap-2 text-sm font-bold text-sky-950">
        <Gauge size={16} className="text-sky-600" /> Kilometraje del tablero
      </label>
      <p className="text-xs text-sky-800 mt-0.5 mb-2">La orden incluye cambio de aceite. Se registra en Renting.</p>
      <div className="relative">
        <input
          ref={ref}
          id="kilometraje-entrega"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="Ej: 85400"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onEnter?.(); } }}
          className={`w-full rounded-lg border bg-white px-3 py-2 pr-12 text-slate-900 font-semibold outline-none focus:ring-2 ${error ? 'border-red-400 focus:ring-red-200' : 'border-slate-300 focus:ring-sky-200'}`}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">km</span>
      </div>
      {error && <p className="text-xs text-red-600 mt-1.5">{error}</p>}
    </div>
  );
};

export const ERROR_KILOMETRAJE = 'Ingresa el kilometraje en km, mayor a cero.';

interface ModalProps {
  placa?: string;
  loading: boolean;
  onCancel: () => void;
  onConfirm: (kilometraje: number) => void;
}

/** Modal para pedir el kilometraje antes de entregar (reemplaza window.prompt). */
export const ModalKilometrajeEntrega: React.FC<ModalProps> = ({ placa, loading, onCancel, onConfirm }) => {
  const [lectura, setLectura] = useState('');
  const [error, setError] = useState('');

  const confirmar = () => {
    const km = parseKilometraje(lectura);
    if (km === null) { setError(ERROR_KILOMETRAJE); return; }
    onConfirm(km);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !loading) onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [loading, onCancel]);

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 print:hidden">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center gap-3 text-emerald-600">
          <CheckSquare size={28} />
          <h2 className="text-xl font-bold text-slate-900">Entregar vehículo{placa ? ` ${placa}` : ''}</h2>
        </div>
        <CampoKilometrajeEntrega
          value={lectura}
          onChange={(v) => { setLectura(v); setError(''); }}
          error={error}
          autoFocus
          onEnter={confirmar}
        />
        <div className="flex gap-3 justify-end">
          <button type="button" onClick={onCancel} disabled={loading} className="px-4 py-2 border border-slate-200 rounded-lg text-slate-600 font-medium hover:bg-slate-50 transition cursor-pointer disabled:opacity-50">
            Cancelar
          </button>
          <button type="button" onClick={confirmar} disabled={loading} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg transition disabled:opacity-50 flex items-center gap-2 cursor-pointer">
            {loading ? <Loader2 size={16} className="animate-spin" /> : <CheckSquare size={16} />}
            Entregar
          </button>
        </div>
      </div>
    </div>
  );
};
