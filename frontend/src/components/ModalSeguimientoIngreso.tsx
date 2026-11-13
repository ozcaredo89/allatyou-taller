import React, { useState } from 'react';
import { X, Clock, CalendarClock, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import api from '../services/api';

interface ModalSeguimientoIngresoProps {
  ingreso: {
    id: string;
    estado: string;
    fecha_entrega_estimada?: string | null;
    horas_sin_actualizacion?: number;
    taller_vehiculos?: {
      placa?: string;
      marca?: string;
      linea?: string;
    };
  };
  onClose: () => void;
  onSuccess: () => void;
}

const OPCIONES_AVANCE = [
  'Avanzando normal',
  'Esperando repuesto',
  'Esperando aprobación del cliente',
  'Falla adicional encontrada',
  'En pruebas de ruta / control de calidad',
  'Listo para entrega'
];

const toLocalDatetimeInput = (iso?: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const ModalSeguimientoIngreso: React.FC<ModalSeguimientoIngresoProps> = ({
  ingreso,
  onClose,
  onSuccess
}) => {
  const [estadoAvance, setEstadoAvance] = useState<string>('Avanzando normal');
  const [nota, setNota] = useState<string>('');
  const [reprogramar, setReprogramar] = useState<boolean>(false);
  const [nuevaFecha, setNuevaFecha] = useState<string>(toLocalDatetimeInput(ingreso.fecha_entrega_estimada));
  const [motivoReprogramacion, setMotivoReprogramacion] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      setError(null);
      const payload: Record<string, any> = {
        estado_avance: estadoAvance,
        nota: nota.trim() || undefined
      };
      if (reprogramar && nuevaFecha) {
        payload.nueva_fecha_entrega_estimada = new Date(nuevaFecha).toISOString();
        if (motivoReprogramacion.trim()) {
          payload.motivo_reprogramacion = motivoReprogramacion.trim();
        }
      }
      await api.post(`/ingresos/${ingreso.id}/seguimiento`, payload);
      onSuccess();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'No se pudo guardar el seguimiento.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-100 text-indigo-600">
              <Clock size={18} />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">Actualizar Estado del Vehículo</h3>
              <p className="text-xs text-slate-500">
                Placa: <strong>{ingreso.taller_vehiculos?.placa || 'S/P'}</strong>
                {ingreso.horas_sin_actualizacion !== undefined && (
                  <> · Sin reporte hace <strong>{ingreso.horas_sin_actualizacion}h</strong></>
                )}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
              <AlertTriangle size={15} />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
              ¿Cómo va el vehículo?
            </label>
            <div className="flex flex-wrap gap-2">
              {OPCIONES_AVANCE.map((opcion) => (
                <button
                  key={opcion}
                  type="button"
                  onClick={() => setEstadoAvance(opcion)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    estadoAvance === opcion
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {opcion}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
              Nota rápida (opcional)
            </label>
            <textarea
              rows={2}
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Ej: Repuesto llega mañana 10 AM, o esperando confirmación del cliente..."
              className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-2 text-sm text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
            />
          </div>

          <div className="border-t border-slate-100 pt-3">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={reprogramar}
                onChange={(e) => setReprogramar(e.target.checked)}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <CalendarClock size={16} className="text-indigo-500" />
              <span>
                {ingreso.fecha_entrega_estimada
                  ? 'Reprogramar fecha/hora estimada de salida'
                  : 'Definir fecha/hora estimada de salida'}
              </span>
            </label>

            {reprogramar && (
              <div className="mt-3 space-y-2.5 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Nueva fecha y hora estimada
                  </label>
                  <input
                    type="datetime-local"
                    value={nuevaFecha}
                    onChange={(e) => setNuevaFecha(e.target.value)}
                    required={reprogramar}
                    className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                {ingreso.fecha_entrega_estimada && (
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Motivo de reprogramación
                    </label>
                    <input
                      type="text"
                      value={motivoReprogramacion}
                      onChange={(e) => setMotivoReprogramacion(e.target.value)}
                      placeholder="Ej: Demora de proveedor de repuestos"
                      className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-sm flex items-center gap-1.5 disabled:opacity-50"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
              Guardar seguimiento
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ModalSeguimientoIngreso;
