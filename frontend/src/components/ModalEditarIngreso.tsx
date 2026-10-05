import React, { useState, useEffect } from 'react';
import { 
  X, 
  FileEdit, 
  Loader2, 
  Save, 
  AlertCircle, 
  CheckCircle2, 
  CarFront, 
  Fuel, 
  Gauge, 
  Calendar, 
  ClipboardCheck, 
  FileText, 
  ChevronDown, 
  ChevronUp, 
  User, 
  Phone 
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '../services/api';

interface Props {
  ingresoId: string;
  onClose: () => void;
  onSuccess: (updatedIngreso?: any) => void;
}

const CHECKLIST_ITEMS = [
  { id: 'tiene_gato', label: 'Gato', en_label: 'Jack' },
  { id: 'llanta_repuesto', label: 'Llanta de repuesto', en_label: 'Spare Tire' },
  { id: 'herramienta', label: 'Herramienta', en_label: 'Tools' },
  { id: 'radio', label: 'Radio', en_label: 'Radio' },
  { id: 'documentos', label: 'Documentos', en_label: 'Documents' },
];

const NIVELES_GASOLINA = ['Reserva', '1/4', '1/2', '3/4', 'Lleno'];

export const ModalEditarIngreso: React.FC<Props> = ({ ingresoId, onClose, onSuccess }) => {
  const { t, i18n } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Ingreso form state
  const [motivoVisita, setMotivoVisita] = useState('');
  const [kilometraje, setKilometraje] = useState('');
  const [nivelGasolina, setNivelGasolina] = useState('1/2');
  const [fechaIngreso, setFechaIngreso] = useState('');
  const [initialFechaIngreso, setInitialFechaIngreso] = useState('');
  const [observacionesRecepcion, setObservacionesRecepcion] = useState('');
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});

  // Original state for quick info display
  const [rawIngreso, setRawIngreso] = useState<any>(null);

  // Vehicle & Client editable state (accordion)
  const [showVehicleClient, setShowVehicleClient] = useState(false);
  const [placa, setPlaca] = useState('');
  const [marca, setMarca] = useState('');
  const [linea, setLinea] = useState('');
  const [modeloAnio, setModeloAnio] = useState('');
  const [color, setColor] = useState('');
  const [nombreCliente, setNombreCliente] = useState('');
  const [telefonoCliente, setTelefonoCliente] = useState('');

  useEffect(() => {
    cargarIngreso();
  }, [ingresoId]);

  const cargarIngreso = async () => {
    try {
      setLoading(true);
      setError('');
      const { data } = await api.get(`/ingresos/${ingresoId}`);
      setRawIngreso(data);

      setMotivoVisita(data.motivo_visita || '');
      setKilometraje(data.kilometraje !== undefined && data.kilometraje !== null ? String(data.kilometraje) : '');
      setNivelGasolina(data.nivel_gasolina || '1/2');
      setObservacionesRecepcion(data.observaciones_recepcion || '');
      setChecklist(data.checklist_inventario || {});

      // Format ISO date to YYYY-MM-DDTHH:mm for datetime-local input
      if (data.fecha_ingreso) {
        try {
          const d = new Date(data.fecha_ingreso);
          // Local datetime string
          const pad = (n: number) => String(n).padStart(2, '0');
          const localIso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
          setFechaIngreso(localIso);
          setInitialFechaIngreso(localIso);
        } catch {
          setFechaIngreso('');
          setInitialFechaIngreso('');
        }
      }

      // Vehículo
      const veh = data.taller_vehiculos;
      if (veh) {
        setPlaca(veh.placa || '');
        setMarca(veh.marca || '');
        setLinea(veh.linea || '');
        setModeloAnio(veh.modelo_anio ? String(veh.modelo_anio) : '');
        setColor(veh.color || '');

        // Cliente
        const cli = veh.taller_clientes;
        if (cli) {
          setNombreCliente(cli.nombre_completo || '');
          setTelefonoCliente(cli.telefono || '');
        }
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al cargar los datos de la entrada.');
    } finally {
      setLoading(false);
    }
  };

  const toggleChecklistItem = (id: string) => {
    setChecklist(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!motivoVisita.trim()) {
      setError(t('editar_ingreso.error_motivo_requerido', 'El motivo de visita es obligatorio.'));
      return;
    }

    if (kilometraje === '' || isNaN(Number(kilometraje))) {
      setError(t('editar_ingreso.error_km_requerido', 'El kilometraje es obligatorio y debe ser un número.'));
      return;
    }

    if (showVehicleClient && !placa.trim()) {
      setError(t('editar_ingreso.error_placa_requerida', 'La placa no puede quedar vacía.'));
      return;
    }

    try {
      setSaving(true);
      setError('');
      setSuccessMsg('');

      const payload: any = {
        motivo_visita: motivoVisita.trim(),
        kilometraje: parseInt(kilometraje, 10),
        nivel_gasolina: nivelGasolina,
        observaciones_recepcion: observacionesRecepcion.trim(),
        checklist_inventario: checklist,
      };

      // Solo enviar fecha_ingreso si el usuario la modificó explícitamente para evitar truncar segundos o desfasar huso horario
      if (fechaIngreso && fechaIngreso !== initialFechaIngreso) {
        payload.fecha_ingreso = new Date(fechaIngreso).toISOString();
      }

      if (showVehicleClient && rawIngreso?.taller_vehiculos) {
        payload.vehiculo_datos = {
          placa: placa.trim().toUpperCase(),
          marca: marca.trim(),
          linea: linea.trim(),
          modelo_anio: modeloAnio ? parseInt(modeloAnio, 10) : null,
          color: color.trim()
        };

        if (nombreCliente.trim()) {
          payload.cliente_datos = {
            nombre_completo: nombreCliente.trim(),
            telefono: telefonoCliente.trim()
          };
        }
      }

      const { data } = await api.put(`/ingresos/${ingresoId}`, payload);
      setSuccessMsg(t('editar_ingreso.exito', 'Entrada actualizada correctamente.'));
      
      setTimeout(() => {
        onSuccess(data);
      }, 350);
    } catch (err: any) {
      console.error('[ModalEditarIngreso] Error:', err);
      setError(err.response?.data?.error || t('editar_ingreso.error_guardar', 'Error al guardar los cambios.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-8 overflow-hidden border border-slate-100 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/20 border border-indigo-400/30 rounded-xl text-indigo-300">
              <FileEdit size={22} />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold tracking-tight">
                {t('editar_ingreso.title', 'Editar Entrada del Vehículo')}
              </h2>
              <div className="flex items-center gap-2 text-xs text-slate-300 mt-0.5">
                <span className="font-bold text-indigo-300 tracking-wider">
                  {rawIngreso?.taller_vehiculos?.placa || '...'}
                </span>
                <span>•</span>
                <span>
                  {rawIngreso?.taller_vehiculos?.marca} {rawIngreso?.taller_vehiculos?.linea}
                </span>
                {rawIngreso?.estado && (
                  <>
                    <span>•</span>
                    <span className="capitalize text-slate-400">
                      {String(t(`estado.${rawIngreso.estado}`, rawIngreso.estado))}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition cursor-pointer"
            title={t('editar_ingreso.btn_cancelar', 'Cerrar')}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {error && (
            <div className="bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm font-medium border border-red-200 flex items-center gap-2">
              <AlertCircle size={18} className="shrink-0 text-red-500" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="bg-emerald-50 text-emerald-800 px-4 py-3 rounded-xl text-sm font-medium border border-emerald-200 flex items-center gap-2">
              <CheckCircle2 size={18} className="shrink-0 text-emerald-600" />
              <span>{successMsg}</span>
            </div>
          )}

          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-400">
              <Loader2 className="animate-spin text-indigo-600 w-8 h-8" />
              <p className="text-sm">Cargando datos del ingreso...</p>
            </div>
          ) : (
            <form id="form-editar-ingreso" onSubmit={handleSubmit} className="space-y-5">
              
              {/* Motivo de Visita (Destacado) */}
              <div className="bg-indigo-50/60 border border-indigo-100 rounded-xl p-4 space-y-2">
                <label className="block text-sm font-bold text-slate-900 flex items-center gap-2">
                  <FileText size={16} className="text-indigo-600" />
                  {t('editar_ingreso.motivo_label', 'Motivo de Ingreso / Falla Reportada')}
                  <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={2}
                  value={motivoVisita}
                  onChange={(e) => setMotivoVisita(e.target.value)}
                  placeholder={t('editar_ingreso.motivo_placeholder', 'Ej: Cambio de aceite, Ruido en el motor, Falla en frenos...')}
                  className="w-full bg-white border border-indigo-200 rounded-lg px-3.5 py-2.5 text-sm text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition font-medium resize-none shadow-xs"
                  required
                />
                <p className="text-xs text-slate-500">
                  Modifica este campo si hubo una equivocación al registrar la visita (por ejemplo, corrección de diagnóstico o servicio inicial).
                </p>
              </div>

              {/* Kilometraje y Gasolina */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Kilometraje */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <Gauge size={14} className="text-slate-500" />
                    {t('editar_ingreso.kilometraje_label', 'Kilometraje')}
                    <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={kilometraje}
                    onChange={(e) => setKilometraje(e.target.value)}
                    placeholder={t('editar_ingreso.kilometraje_placeholder', 'Ej: 198000')}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2 text-sm text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none transition"
                    required
                  />
                </div>

                {/* Fecha y Hora de Ingreso */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <Calendar size={14} className="text-slate-500" />
                    {t('editar_ingreso.fecha_ingreso_label', 'Fecha y Hora de Ingreso')}
                  </label>
                  <input
                    type="datetime-local"
                    value={fechaIngreso}
                    onChange={(e) => setFechaIngreso(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none transition"
                  />
                </div>
              </div>

              {/* Nivel de Combustible */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Fuel size={14} className="text-slate-500" />
                  {t('editar_ingreso.nivel_gasolina_label', 'Nivel de Combustible')}
                </label>
                <div className="grid grid-cols-5 gap-2">
                  {NIVELES_GASOLINA.map((nivel) => (
                    <button
                      key={nivel}
                      type="button"
                      onClick={() => setNivelGasolina(nivel)}
                      className={`py-2 text-xs font-bold rounded-lg border transition text-center cursor-pointer ${
                        nivelGasolina === nivel
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {nivel}
                    </button>
                  ))}
                </div>
              </div>

              {/* Observaciones de Recepción */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <FileText size={14} className="text-slate-500" />
                  {t('editar_ingreso.observaciones_label', 'Observaciones de Recepción')}
                </label>
                <textarea
                  rows={2}
                  value={observacionesRecepcion}
                  onChange={(e) => setObservacionesRecepcion(e.target.value)}
                  placeholder={t('editar_ingreso.observaciones_placeholder', 'Rayones, detalles del estado visual, objetos dejados en el vehículo...')}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none transition resize-none"
                />
              </div>

              {/* Checklist de Inventario */}
              <div className="space-y-2 pt-1">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <ClipboardCheck size={14} className="text-slate-500" />
                  {t('editar_ingreso.checklist_title', 'Inventario Recibido')}
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {CHECKLIST_ITEMS.map((item) => {
                    const isChecked = !!checklist[item.id];
                    const label = i18n.language === 'en' ? item.en_label : item.label;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => toggleChecklistItem(item.id)}
                        className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs font-semibold transition text-left cursor-pointer ${
                          isChecked
                            ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                            : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'
                        }`}
                      >
                        <div
                          className={`w-4 h-4 rounded flex items-center justify-center text-[10px] ${
                            isChecked ? 'bg-emerald-600 text-white' : 'border border-slate-300 bg-white'
                          }`}
                        >
                          {isChecked ? '✓' : ''}
                        </div>
                        <span className="truncate">{label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Acordeón para Vehículo y Cliente */}
              <div className="border border-slate-200 rounded-xl overflow-hidden pt-1">
                <button
                  type="button"
                  onClick={() => setShowVehicleClient(!showVehicleClient)}
                  className="w-full flex items-center justify-between p-3.5 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold uppercase tracking-wider transition cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <CarFront size={16} className="text-slate-500" />
                    {t('editar_ingreso.datos_vehiculo_cliente', 'Corregir datos del Vehículo y Cliente (Opcional)')}
                  </span>
                  {showVehicleClient ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>

                {showVehicleClient && (
                  <div className="p-4 space-y-4 bg-white border-t border-slate-200">
                    <p className="text-xs text-slate-500">
                      Si hubo un error de digitación en la placa, marca o datos del propietario, puedes ajustarlos directamente aquí.
                    </p>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Placa</label>
                        <input
                          type="text"
                          value={placa}
                          onChange={(e) => setPlaca(e.target.value.toUpperCase())}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:bg-white focus:ring-1 focus:ring-indigo-500 outline-none uppercase font-bold"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Marca</label>
                        <input
                          type="text"
                          value={marca}
                          onChange={(e) => setMarca(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:bg-white focus:ring-1 focus:ring-indigo-500 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Línea</label>
                        <input
                          type="text"
                          value={linea}
                          onChange={(e) => setLinea(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:bg-white focus:ring-1 focus:ring-indigo-500 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Modelo / Año</label>
                        <input
                          type="number"
                          value={modeloAnio}
                          onChange={(e) => setModeloAnio(e.target.value)}
                          placeholder="Ej: 2018"
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:bg-white focus:ring-1 focus:ring-indigo-500 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Color</label>
                        <input
                          type="text"
                          value={color}
                          onChange={(e) => setColor(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:bg-white focus:ring-1 focus:ring-indigo-500 outline-none"
                        />
                      </div>
                    </div>

                    <div className="border-t border-slate-100 pt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1 flex items-center gap-1">
                          <User size={12} className="text-slate-400" />
                          Nombre del Cliente
                        </label>
                        <input
                          type="text"
                          value={nombreCliente}
                          onChange={(e) => setNombreCliente(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:bg-white focus:ring-1 focus:ring-indigo-500 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1 flex items-center gap-1">
                          <Phone size={12} className="text-slate-400" />
                          Teléfono
                        </label>
                        <input
                          type="text"
                          value={telefonoCliente}
                          onChange={(e) => setTelefonoCliente(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:bg-white focus:ring-1 focus:ring-indigo-500 outline-none"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

            </form>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl text-sm font-semibold hover:bg-slate-100 transition cursor-pointer"
          >
            {t('editar_ingreso.btn_cancelar', 'Cancelar')}
          </button>
          <button
            type="submit"
            form="form-editar-ingreso"
            disabled={saving || loading}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold shadow-md shadow-indigo-600/20 transition flex items-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            {saving ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                {t('editar_ingreso.btn_guardando', 'Guardando...')}
              </>
            ) : (
              <>
                <Save size={16} />
                {t('editar_ingreso.btn_guardar', 'Guardar Cambios')}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ModalEditarIngreso;
