import appI18n from "../i18n";
import React, { useRef, useState } from 'react';
import { X, Clock, CalendarClock, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import api from '../services/api';
import NotaPorVoz from './NotaPorVoz';

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
  onSuccess: (abrirBitacora: boolean) => void;
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
  const [evidencias, setEvidencias] = useState<File[]>([]);
  const [progreso, setProgreso] = useState<number>();
  const eventoId = useRef<string | undefined>(undefined);

  function agregarEvidencias(archivos: FileList) {
    const seleccion = [...evidencias, ...Array.from(archivos)];
    if (seleccion.length > 4 || seleccion.some(archivo => archivo.size > 25 * 1024 * 1024)) {
      setError('Adjunta hasta 4 archivos de máximo 25 MB cada uno.');
      return;
    }
    setEvidencias(seleccion);
    setError(null);
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter;
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
      const ruta = `/ingresos/${ingreso.id}/seguimiento`;
      if (evidencias.length) {
        eventoId.current ??= crypto.randomUUID();
        const formulario = new FormData();
        for (const [campo, valor] of Object.entries(payload)) {
          if (valor !== undefined) formulario.append(campo, String(valor));
        }
        formulario.append('evento_id', eventoId.current);
        for (const archivo of evidencias) formulario.append('evidencias', archivo);
        await api.post(ruta, formulario, {
          onUploadProgress: ({ progress }) => setProgreso(progress === undefined ? undefined : Math.round(progress * 100))
        });
      } else {
        await api.post(ruta, payload);
      }
      onSuccess(submitter?.getAttribute('value') === 'bitacora');
    } catch (err: any) {
      setError(err?.response?.data?.error || appI18n.t('ui.ModalSeguimientoIngreso.save_error'));
      setSaving(false);
      setProgreso(undefined);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full max-h-[90dvh] overflow-y-auto">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-100 text-indigo-600">
              <Clock size={18} />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">{appI18n.t("ui.ModalSeguimientoIngreso.update_vehicle_status")}</h3>
              <p className="text-xs text-slate-500">
                {appI18n.t("ui.ModalSeguimientoIngreso.plate")} <strong>{ingreso.taller_vehiculos?.placa || 'S/P'}</strong>
                {ingreso.horas_sin_actualizacion !== undefined && (
                  <> {appI18n.t("ui.ModalSeguimientoIngreso.no_update_for")} <strong>{ingreso.horas_sin_actualizacion}h</strong></>
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
              {appI18n.t("ui.ModalSeguimientoIngreso.how_is_the_vehicle_coming_along")}
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
                  {appI18n.t(`ui.ModalSeguimientoIngreso.progress.${opcion}`, { defaultValue: opcion })}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
              {appI18n.t("ui.ModalSeguimientoIngreso.quick_note_optional")}
            </label>
            <NotaPorVoz
              rows={3}
              value={nota}
              onChange={setNota}
              placeholder={appI18n.t("ui.ModalSeguimientoIngreso.e_g_the_part_arrives_tomorrow_at_10")}
              className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-2 text-sm text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
              contexto={{
                tipo: `Nota de seguimiento del vehículo (${estadoAvance})`,
                vehiculo: [ingreso.taller_vehiculos?.marca, ingreso.taller_vehiculos?.linea].filter(Boolean).join(' '),
              }}
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
                  ? appI18n.t('ui.ModalSeguimientoIngreso.reschedule')
                  : appI18n.t('ui.ModalSeguimientoIngreso.schedule')}
              </span>
            </label>

            {reprogramar && (
              <div className="mt-3 space-y-2.5 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    {appI18n.t("ui.ModalSeguimientoIngreso.new_estimated_date_and_time")}
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
                      {appI18n.t("ui.ModalSeguimientoIngreso.reason_for_rescheduling")}
                    </label>
                    <input
                      type="text"
                      value={motivoReprogramacion}
                      onChange={(e) => setMotivoReprogramacion(e.target.value)}
                      placeholder={appI18n.t("ui.ModalSeguimientoIngreso.e_g_parts_supplier_delay")}
                      className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          <fieldset disabled={saving} className="space-y-2">
            <label className="block text-sm font-medium text-slate-700">
              {appI18n.t("ui.ModalSeguimientoIngreso.progress_photos_and_videos")}
              <input type="file" multiple accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm,.mov"
                className="mt-1 block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-indigo-800"
                onChange={e => {
                  if (e.target.files) agregarEvidencias(e.target.files);
                  e.target.value = '';
                }} />
            </label>
            <p className="text-xs text-slate-600">{appI18n.t("ui.ModalSeguimientoIngreso.up_to_4_files_of_25_mb_each")}</p>
            {evidencias.length > 0 && (
              <ul className="space-y-1">
                {evidencias.map((archivo, indice) => (
                  <li key={indice} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 p-2 text-sm">
                    <span className="min-w-0 truncate">{archivo.name}</span>
                    <button type="button" className="shrink-0 text-indigo-800" aria-label={`Quitar ${archivo.name}`}
                      onClick={() => setEvidencias(prev => prev.filter((_, i) => i !== indice))}>{appI18n.t("ui.ModalSeguimientoIngreso.remove")}</button>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>
          {saving && evidencias.length > 0 && (
            <p role="status" className="text-sm text-indigo-800">
              {progreso === 100 ? appI18n.t("ui.ModalSeguimientoIngreso.compressing_and_saving_attachments") : `Subiendo evidencias${progreso === undefined ? '' : ` (${progreso} %)`}…`}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
            >
              {appI18n.t("ui.ModalSeguimientoIngreso.cancel")}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-sm flex items-center gap-1.5 disabled:opacity-50"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
              {appI18n.t("ui.ModalSeguimientoIngreso.save_update")}
            </button>
            <button type="submit" value="bitacora" disabled={saving}
              className="rounded-xl bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-800 disabled:opacity-50">
              {appI18n.t("ui.ModalSeguimientoIngreso.save_and_open_activity_log")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ModalSeguimientoIngreso;
