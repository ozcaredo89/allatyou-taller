import React, { useState, useEffect } from 'react';
import { UserSearch, CarFront, FileEdit, Check, AlertCircle, CheckCircle2 } from 'lucide-react';
import api from '../services/api';
import { useNavigate, useParams } from 'react-router-dom';
import CreatableSelect from 'react-select/creatable';
import { useTranslation } from 'react-i18next';

interface OptionType {
  value: string;
  label: string;
  __isNew__?: boolean;
}

const ChecklistItems = [
  { id: 'tiene_gato', label: 'Gato', en_label: 'Jack' },
  { id: 'llanta_repuesto', label: 'Llanta de repuesto', en_label: 'Spare Tire' },
  { id: 'herramienta', label: 'Herramienta', en_label: 'Tools' },
  { id: 'radio', label: 'Radio', en_label: 'Radio' },
  { id: 'documentos', label: 'Documentos', en_label: 'Documents' },
];

const NivelesGasolina = ['Reserva', '1/4', '1/2', '3/4', 'Lleno'];

const NuevoIngreso: React.FC = () => {
  const navigate = useNavigate();
  const { slug } = useParams<{ slug: string }>();
  const { t, i18n } = useTranslation();
  
  // Vehículo State
  const [placa, setPlaca] = useState('');
  const [hasSearchedPlaca, setHasSearchedPlaca] = useState(false);
  const [vehiculo, setVehiculo] = useState<any>(null);
  const [isCreatingVehiculo, setIsCreatingVehiculo] = useState(false);
  const [newVehiculo, setNewVehiculo] = useState({ marca: '', linea: '', modelo_anio: '', color: '' });

  // Autocomplete State
  const [marcasOptions, setMarcasOptions] = useState<OptionType[]>([]);
  const [lineasOptions, setLineasOptions] = useState<OptionType[]>([]);
  const [selectedMarca, setSelectedMarca] = useState<OptionType | null>(null);
  const [selectedLinea, setSelectedLinea] = useState<OptionType | null>(null);

  // Cliente State
  const [documento, setDocumento] = useState('');
  const [hasSearchedDocumento, setHasSearchedDocumento] = useState(false);
  const [cliente, setCliente] = useState<any>(null);
  const [isCreatingCliente, setIsCreatingCliente] = useState(false);
  const [newCliente, setNewCliente] = useState({ nombre_completo: '', telefono: '', email: '' });

  // Ingreso State
  const [ingreso, setIngreso] = useState({ kilometraje: '', nivel_gasolina: '1/2', motivo_visita: '', observaciones_recepcion: '' });
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Efectos Autocomplete
  useEffect(() => {
    if (isCreatingVehiculo && marcasOptions.length === 0) {
      cargarMarcas();
    }
  }, [isCreatingVehiculo]);

  const cargarMarcas = async () => {
    try {
      const { data } = await api.get('/marcas');
      setMarcasOptions(data.map((m: any) => ({ value: m.id, label: m.nombre })));
    } catch (err) {
      console.error('Error cargando marcas', err);
    }
  };

  const handleMarcaChange = async (newValue: any) => {
    setSelectedMarca(newValue);
    setSelectedLinea(null);
    setNewVehiculo(prev => ({ ...prev, marca: newValue?.label || '', linea: '' }));
    
    if (newValue && !newValue.__isNew__) {
      try {
        const { data } = await api.get(`/marcas/${newValue.value}/lineas`);
        setLineasOptions(data.map((l: any) => ({ value: l.id, label: l.nombre })));
      } catch (err) {
        console.error('Error cargando líneas', err);
      }
    } else {
      setLineasOptions([]);
    }
  };

  const handleLineaChange = (newValue: any) => {
    setSelectedLinea(newValue);
    setNewVehiculo(prev => ({ ...prev, linea: newValue?.label || '' }));
  };

  // 1. Buscar Vehículo
  const buscarVehiculo = async () => {
    if (!placa) return;
    try {
      setLoading(true);
      setError('');
      setHasSearchedPlaca(true);
      const { data } = await api.get(`/vehiculos/${placa}`);
      
      // Si existe, seteamos el vehiculo y auto-completamos el cliente
      setVehiculo(data);
      if (data.taller_clientes) {
        setCliente(data.taller_clientes);
        setDocumento(data.taller_clientes.documento);
        setHasSearchedDocumento(true);
        setIsCreatingCliente(false);
      }
      setIsCreatingVehiculo(false);
    } catch (err: any) {
      if (err.response?.status === 404) {
        setVehiculo(null);
        setCliente(null);
        setDocumento('');
        setHasSearchedDocumento(false);
        setIsCreatingCliente(false);
        setIsCreatingVehiculo(true);
      } else {
        setError(t('nuevo_ingreso.error_search_vehicle'));
      }
    } finally {
      setLoading(false);
    }
  };

  // 2. Buscar Cliente
  const buscarCliente = async () => {
    if (!documento) return;
    try {
      setLoading(true);
      setError('');
      setHasSearchedDocumento(true);
      const { data } = await api.get(`/clientes/${documento}`);
      setCliente(data);
      setIsCreatingCliente(false);
    } catch (err: any) {
      if (err.response?.status === 404) {
        setCliente(null);
        setIsCreatingCliente(true);
      } else {
        setError(t('nuevo_ingreso.error_search_client'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRegistrarIngreso = async () => {
    if (!ingreso.kilometraje || !ingreso.motivo_visita) {
      setError(t('nuevo_ingreso.validation_error'));
      return;
    }

    try {
      setLoading(true);
      setError('');
      
      let currentClienteId = cliente?.id;
      
      if (isCreatingVehiculo && isCreatingCliente && !cliente) {
        const resC = await api.post('/clientes', { documento, ...newCliente });
        currentClienteId = resC.data.id;
        setCliente(resC.data);
      }

      let currentVehiculoId = vehiculo?.id;
      if (isCreatingVehiculo && !vehiculo) {
        let finalMarcaId = selectedMarca && !selectedMarca.__isNew__ ? selectedMarca.value : null;
        if (selectedMarca && selectedMarca.__isNew__) {
          const mRes = await api.post('/marcas', { nombre: selectedMarca.label });
          finalMarcaId = mRes.data.id;
        }

        if (selectedLinea && selectedLinea.__isNew__ && finalMarcaId) {
          await api.post(`/marcas/${finalMarcaId}/lineas`, { nombre: selectedLinea.label });
        }

        const payloadVehiculo = {
          cliente_id: currentClienteId,
          placa,
          ...newVehiculo,
          modelo_anio: parseInt(newVehiculo.modelo_anio) || null
        };
        const resV = await api.post('/vehiculos', payloadVehiculo);
        currentVehiculoId = resV.data.id;
        setVehiculo(resV.data);
      }

      const payloadIngreso = {
        vehiculo_id: currentVehiculoId,
        kilometraje: parseInt(ingreso.kilometraje),
        nivel_gasolina: ingreso.nivel_gasolina,
        motivo_visita: ingreso.motivo_visita,
        observaciones_recepcion: ingreso.observaciones_recepcion,
        checklist_inventario: checklist
      };
      await api.post('/ingresos', payloadIngreso);
      
      navigate(`/${slug}`);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error procesando el registro.');
    } finally {
      setLoading(false);
    }
  };

  const toggleChecklist = (id: string) => {
    setChecklist(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const isFormValid = () => {
    if (!hasSearchedPlaca) return false;
    if (isCreatingVehiculo && (!newVehiculo.marca || !newVehiculo.linea)) return false;
    if (isCreatingVehiculo && !hasSearchedDocumento) return false;
    if (isCreatingVehiculo && isCreatingCliente && !newCliente.nombre_completo) return false;
    if (!ingreso.kilometraje || !ingreso.motivo_visita) return false;
    return true;
  };

  const resetAll = () => {
    setVehiculo(null);
    setCliente(null);
    setIsCreatingVehiculo(false);
    setIsCreatingCliente(false);
    setHasSearchedPlaca(false);
    setHasSearchedDocumento(false);
    setPlaca('');
    setDocumento('');
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">{t('nuevo_ingreso.title')}</h1>
        <p className="text-slate-500 mt-1">{t('nuevo_ingreso.subtitle')}</p>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-lg flex items-center gap-3 border border-red-200">
          <AlertCircle size={20} />
          <span>{error}</span>
        </div>
      )}

      {/* SECTION 1: VEHICULO */}
      <section className="bg-white rounded-2xl p-6 md:p-8 shadow-sm border border-slate-200">
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-blue-100 p-2 rounded-lg">
            <CarFront className="text-blue-600 w-6 h-6" />
          </div>
          <h2 className="text-xl font-semibold text-slate-800">{t('nuevo_ingreso.step_1')}</h2>
        </div>

        {!vehiculo && !isCreatingVehiculo ? (
          <div className="flex gap-4">
            <div className="flex-1 max-w-md">
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('nuevo_ingreso.placa_label')}</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  className="flex-1 bg-slate-50 border border-slate-300 rounded-lg px-4 py-3 uppercase text-lg font-bold tracking-widest focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder={t('nuevo_ingreso.placa_placeholder')}
                  value={placa}
                  onChange={(e) => setPlaca(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === 'Enter' && buscarVehiculo()}
                />
                <button 
                  onClick={buscarVehiculo}
                  disabled={loading || !placa}
                  className="bg-slate-900 hover:bg-slate-800 text-white px-8 py-3 rounded-lg font-medium transition-colors disabled:opacity-50"
                >
                  {t('nuevo_ingreso.btn_search')}
                </button>
              </div>
            </div>
          </div>
        ) : vehiculo ? (
          // Vehículo encontrado
          <div className="space-y-4">
            <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold tracking-widest text-emerald-900 mb-1">{vehiculo.placa}</p>
                <p className="text-sm font-medium text-emerald-700">{vehiculo.marca} {vehiculo.linea} - {vehiculo.color}</p>
              </div>
              <button onClick={resetAll} className="text-sm font-medium text-emerald-700 hover:text-emerald-900 underline">{t('nuevo_ingreso.btn_new_search')}</button>
            </div>
            {cliente && (
              <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl flex items-center gap-3">
                <div className="p-2 bg-slate-200 rounded-full"><UserSearch size={18} className="text-slate-600" /></div>
                <div>
                  <p className="font-semibold text-slate-800">{cliente.nombre_completo}</p>
                  <p className="text-xs text-slate-500">Doc: {cliente.documento} | Tel: {cliente.telefono}</p>
                </div>
              </div>
            )}
          </div>
        ) : (
          // Vehículo NO encontrado
          <div className="space-y-6 animate-in fade-in slide-in-from-top-4">
            <div className="flex justify-between items-center bg-blue-50 border border-blue-200 p-3 rounded-xl">
              <div>
                <p className="text-sm text-blue-800 font-medium">Placa: <span className="font-bold text-lg tracking-widest">{placa}</span></p>
                <p className="text-xs text-blue-600">{t('nuevo_ingreso.not_found')}</p>
              </div>
              <button onClick={resetAll} className="text-xs font-medium text-blue-700 hover:text-blue-900 underline">{t('nuevo_ingreso.btn_change_placa')}</button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('nuevo_ingreso.marca_label')}</label>
                <CreatableSelect
                  options={marcasOptions}
                  value={selectedMarca}
                  onChange={handleMarcaChange}
                  className="react-select-container"
                  classNamePrefix="react-select"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('nuevo_ingreso.linea_label')}</label>
                <CreatableSelect
                  options={lineasOptions}
                  value={selectedLinea}
                  onChange={handleLineaChange}
                  isDisabled={!selectedMarca}
                  className="react-select-container"
                  classNamePrefix="react-select"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('nuevo_ingreso.modelo_label')}</label>
                <input 
                  type="number" 
                  className="w-full bg-white border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                  value={newVehiculo.modelo_anio}
                  onChange={e => setNewVehiculo({...newVehiculo, modelo_anio: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('nuevo_ingreso.color_label')}</label>
                <input 
                  type="text" 
                  className="w-full bg-white border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                  value={newVehiculo.color}
                  onChange={e => setNewVehiculo({...newVehiculo, color: e.target.value})}
                />
              </div>
            </div>

            <hr className="border-slate-200" />
            
            <div className="pt-2">
              <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <UserSearch size={20} className="text-slate-400" />
                {t('nuevo_ingreso.propietario_title')}
              </h3>

              {!cliente && !isCreatingCliente ? (
                <div className="flex gap-4 max-w-md">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-slate-700 mb-1">{t('nuevo_ingreso.doc_label')}</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        className="flex-1 bg-slate-50 border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                        placeholder={t('nuevo_ingreso.doc_placeholder')}
                        value={documento}
                        onChange={(e) => setDocumento(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && buscarCliente()}
                      />
                      <button 
                        onClick={buscarCliente}
                        disabled={loading || !documento}
                        className="bg-slate-200 hover:bg-slate-300 text-slate-800 px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
                      >
                        {t('nuevo_ingreso.btn_search')}
                      </button>
                    </div>
                  </div>
                </div>
              ) : cliente ? (
                <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-emerald-900">{cliente.nombre_completo}</p>
                    <p className="text-sm text-emerald-700">Doc: {cliente.documento} | Tel: {cliente.telefono}</p>
                  </div>
                  <button onClick={() => { setCliente(null); setHasSearchedDocumento(false); }} className="text-sm font-medium text-emerald-700 underline">{t('nuevo_ingreso.btn_change_doc')}</button>
                </div>
              ) : (
                <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 space-y-4 animate-in fade-in slide-in-from-top-4">
                  <div className="flex justify-between">
                    <p className="text-sm text-indigo-600 font-medium">{t('nuevo_ingreso.client_not_found')}</p>
                    <button onClick={() => { setIsCreatingCliente(false); setHasSearchedDocumento(false); }} className="text-xs font-medium text-indigo-700 underline">{t('nuevo_ingreso.btn_change_doc')}</button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">{t('nuevo_ingreso.nombre_label')}</label>
                      <input 
                        type="text" 
                        className="w-full bg-white border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                        value={newCliente.nombre_completo}
                        onChange={e => setNewCliente({...newCliente, nombre_completo: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">{t('nuevo_ingreso.telefono_label')}</label>
                      <input 
                        type="text" 
                        className="w-full bg-white border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                        value={newCliente.telefono}
                        onChange={e => setNewCliente({...newCliente, telefono: e.target.value})}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-slate-700 mb-1">{t('nuevo_ingreso.email_label')}</label>
                      <input 
                        type="email" 
                        className="w-full bg-white border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                        value={newCliente.email}
                        onChange={e => setNewCliente({...newCliente, email: e.target.value})}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* SECTION 2: INGRESO & CHECKLIST */}
      {hasSearchedPlaca && (vehiculo || hasSearchedDocumento) && (
        <section className="bg-white rounded-2xl p-6 md:p-8 shadow-sm border border-slate-200 animate-in fade-in slide-in-from-top-4">
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-orange-100 p-2 rounded-lg">
              <FileEdit className="text-orange-600 w-6 h-6" />
            </div>
            <h2 className="text-xl font-semibold text-slate-800">{t('nuevo_ingreso.step_2')}</h2>
          </div>

          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('nuevo_ingreso.km_label')}</label>
                <input 
                  type="number" 
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-orange-500 outline-none"
                  value={ingreso.kilometraje}
                  onChange={e => setIngreso({...ingreso, kilometraje: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('nuevo_ingreso.gasOLINA_label')}</label>
                <select 
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-orange-500 outline-none"
                  value={ingreso.nivel_gasolina}
                  onChange={e => setIngreso({...ingreso, nivel_gasolina: e.target.value})}
                >
                  {NivelesGasolina.map(nivel => (
                    <option key={nivel} value={nivel}>{nivel}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('nuevo_ingreso.motivo_label')}</label>
              <textarea 
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-4 py-2 h-24 focus:ring-2 focus:ring-orange-500 outline-none resize-none"
                placeholder={t('nuevo_ingreso.motivo_placeholder')}
                value={ingreso.motivo_visita}
                onChange={e => setIngreso({...ingreso, motivo_visita: e.target.value})}
              />
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="bg-slate-50 px-4 py-3 border-b border-slate-200">
                <span className="font-medium text-slate-800">{t('nuevo_ingreso.checklist_title')}</span>
              </div>
              <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-4">
                {ChecklistItems.map(item => {
                  const isChecked = !!checklist[item.id];
                  const label = i18n.language === 'en' && item.en_label ? item.en_label : item.label;
                  return (
                    <div 
                      key={item.id} 
                      onClick={() => toggleChecklist(item.id)}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                        isChecked ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded-md flex items-center justify-center border ${isChecked ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300'}`}>
                        {isChecked && <Check size={14} className="text-white" />}
                      </div>
                      <span className={`text-sm select-none ${isChecked ? 'text-indigo-900 font-medium' : 'text-slate-700'}`}>
                        {label}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('nuevo_ingreso.observaciones_label')}</label>
              <textarea 
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-4 py-2 h-20 focus:ring-2 focus:ring-orange-500 outline-none resize-none"
                value={ingreso.observaciones_recepcion}
                onChange={e => setIngreso({...ingreso, observaciones_recepcion: e.target.value})}
              />
            </div>

            <div className="pt-4 border-t border-slate-100 flex justify-end">
              <button 
                onClick={handleRegistrarIngreso}
                disabled={loading || !isFormValid()}
                className="bg-slate-900 hover:bg-slate-800 text-white px-8 py-3 rounded-lg font-bold text-lg transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:shadow-none flex items-center gap-2"
              >
                <CheckCircle2 size={24} /> {t('nuevo_ingreso.btn_register')}
              </button>
            </div>
          </div>
        </section>
      )}

    </div>
  );
};

export default NuevoIngreso;
