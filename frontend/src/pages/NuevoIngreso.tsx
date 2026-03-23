import React, { useState } from 'react';
import { UserSearch, CarFront, FileEdit, Check, AlertCircle, Save, CheckCircle2 } from 'lucide-react';
import api from '../services/api';
import { useNavigate } from 'react-router-dom';

const ChecklistItems = [
  { id: 'tiene_gato', label: 'Gato' },
  { id: 'llanta_repuesto', label: 'Llanta de repuesto' },
  { id: 'herramienta', label: 'Herramienta' },
  { id: 'radio', label: 'Radio' },
  { id: 'documentos', label: 'Documentos' },
];

const NivelesGasolina = ['Reserva', '1/4', '1/2', '3/4', 'Lleno'];

const NuevoIngreso: React.FC = () => {
  const navigate = useNavigate();
  // Cliente State
  const [documento, setDocumento] = useState('');
  const [cliente, setCliente] = useState<any>(null);
  const [isCreatingCliente, setIsCreatingCliente] = useState(false);
  const [newCliente, setNewCliente] = useState({ nombre_completo: '', telefono: '', email: '' });

  // Vehículo State
  const [placa, setPlaca] = useState('');
  const [vehiculo, setVehiculo] = useState<any>(null);
  const [isCreatingVehiculo, setIsCreatingVehiculo] = useState(false);
  const [newVehiculo, setNewVehiculo] = useState({ marca: '', linea: '', modelo_anio: '', color: '' });

  // Ingreso State
  const [ingreso, setIngreso] = useState({ kilometraje: '', nivel_gasolina: '1/2', motivo_visita: '', observaciones_recepcion: '' });
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Acciones Cliente
  const buscarCliente = async () => {
    if (!documento) return;
    try {
      setLoading(true);
      setError('');
      const { data } = await api.get(`/clientes/${documento}`);
      setCliente(data);
      setIsCreatingCliente(false);
    } catch (err: any) {
      if (err.response?.status === 404) {
        setCliente(null);
        setIsCreatingCliente(true);
      } else {
        setError('Error buscando cliente.');
      }
    } finally {
      setLoading(false);
    }
  };

  const guardarCliente = async () => {
    try {
      setLoading(true);
      const { data } = await api.post('/clientes', { documento, ...newCliente });
      setCliente(data);
      setIsCreatingCliente(false);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error creando cliente');
    } finally {
      setLoading(false);
    }
  };

  // Acciones Vehículo
  const buscarVehiculo = async () => {
    if (!placa) return;
    try {
      setLoading(true);
      setError('');
      const { data } = await api.get(`/vehiculos/${placa}`);
      setVehiculo(data);
      // Associate with client if not matched? We'll assume the vehicle is tied to this client.
      setIsCreatingVehiculo(false);
    } catch (err: any) {
      if (err.response?.status === 404) {
        setVehiculo(null);
        setIsCreatingVehiculo(true);
      } else {
        setError('Error buscando vehículo.');
      }
    } finally {
      setLoading(false);
    }
  };

  const guardarVehiculo = async () => {
    if (!cliente) return;
    try {
      setLoading(true);
      const payload = {
        cliente_id: cliente.id,
        placa,
        ...newVehiculo,
        modelo_anio: parseInt(newVehiculo.modelo_anio) || null
      };
      const { data } = await api.post('/vehiculos', payload);
      setVehiculo(data);
      setIsCreatingVehiculo(false);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error creando vehículo');
    } finally {
      setLoading(false);
    }
  };

  // Crear Ingreso
  const handleCrearIngreso = async () => {
    if (!vehiculo) {
      setError('Debes seleccionar o crear un vehículo primero.');
      return;
    }
    if (!ingreso.kilometraje || !ingreso.motivo_visita) {
      setError('El kilometraje y motivo son obligatorios.');
      return;
    }

    try {
      setLoading(true);
      const payload = {
        vehiculo_id: vehiculo.id,
        kilometraje: parseInt(ingreso.kilometraje),
        nivel_gasolina: ingreso.nivel_gasolina,
        motivo_visita: ingreso.motivo_visita,
        observaciones_recepcion: ingreso.observaciones_recepcion,
        checklist_inventario: checklist
      };
      await api.post('/ingresos', payload);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error creando ingreso');
    } finally {
      setLoading(false);
    }
  };

  const toggleChecklist = (id: string) => {
    setChecklist(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Nuevo Ingreso</h1>
        <p className="text-slate-500 mt-1">Registra la entrada de un vehículo al taller.</p>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-lg flex items-center gap-3 border border-red-200">
          <AlertCircle size={20} />
          <span>{error}</span>
        </div>
      )}

      {/* SECTION 1: CLIENTE */}
      <section className="bg-white rounded-2xl p-6 md:p-8 shadow-sm border border-slate-200">
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-indigo-100 p-2 rounded-lg">
            <UserSearch className="text-indigo-600 w-6 h-6" />
          </div>
          <h2 className="text-xl font-semibold text-slate-800">1. Datos del Cliente</h2>
        </div>

        {!cliente ? (
          <div className="space-y-6">
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-slate-700 mb-1">Documento</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    className="flex-1 bg-slate-50 border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all outline-none"
                    placeholder="Ej. 10203040"
                    value={documento}
                    onChange={(e) => setDocumento(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && buscarCliente()}
                  />
                  <button 
                    onClick={buscarCliente}
                    disabled={loading || !documento}
                    className="bg-slate-900 hover:bg-slate-800 text-white px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
                  >
                    Buscar
                  </button>
                </div>
              </div>
            </div>

            {isCreatingCliente && (
              <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 space-y-4 animate-in fade-in slide-in-from-top-4">
                <p className="text-sm text-indigo-600 font-medium mb-4">Cliente no encontrado, por favor regístralo:</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Nombre Completo</label>
                    <input 
                      type="text" 
                      className="w-full bg-white border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                      value={newCliente.nombre_completo}
                      onChange={e => setNewCliente({...newCliente, nombre_completo: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Teléfono</label>
                    <input 
                      type="text" 
                      className="w-full bg-white border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                      value={newCliente.telefono}
                      onChange={e => setNewCliente({...newCliente, telefono: e.target.value})}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                    <input 
                      type="email" 
                      className="w-full bg-white border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                      value={newCliente.email}
                      onChange={e => setNewCliente({...newCliente, email: e.target.value})}
                    />
                  </div>
                </div>
                <button 
                  onClick={guardarCliente}
                  disabled={loading || !newCliente.nombre_completo}
                  className="mt-4 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
                >
                  <Save size={18} /> Guardar Cliente
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl flex justify-between items-center">
            <div>
              <p className="font-semibold text-emerald-900">{cliente.nombre_completo}</p>
              <p className="text-sm text-emerald-700">Doc: {cliente.documento} | Tel: {cliente.telefono}</p>
            </div>
            <button 
              onClick={() => { setCliente(null); setIsCreatingCliente(false); setDocumento(''); }}
              className="text-sm font-medium text-emerald-700 hover:text-emerald-900 underline"
            >
              Cambiar
            </button>
          </div>
        )}
      </section>

      {/* SECTION 2: VEHICULO */}
      {cliente && (
        <section className="bg-white rounded-2xl p-6 md:p-8 shadow-sm border border-slate-200 animate-in fade-in slide-in-from-top-4">
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-blue-100 p-2 rounded-lg">
              <CarFront className="text-blue-600 w-6 h-6" />
            </div>
            <h2 className="text-xl font-semibold text-slate-800">2. Datos del Vehículo</h2>
          </div>

          {!vehiculo ? (
            <div className="space-y-6">
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Placa</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      className="flex-1 bg-slate-50 border border-slate-300 rounded-lg px-4 py-2 uppercase focus:ring-2 focus:ring-blue-500 outline-none"
                      placeholder="Ej. AAA123"
                      value={placa}
                      onChange={(e) => setPlaca(e.target.value.toUpperCase())}
                      onKeyDown={(e) => e.key === 'Enter' && buscarVehiculo()}
                    />
                    <button 
                      onClick={buscarVehiculo}
                      disabled={loading || !placa}
                      className="bg-slate-900 hover:bg-slate-800 text-white px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
                    >
                      Buscar
                    </button>
                  </div>
                </div>
              </div>

              {isCreatingVehiculo && (
                <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 space-y-4 animate-in fade-in slide-in-from-top-4">
                  <p className="text-sm text-blue-600 font-medium mb-4">Vehículo no encontrado, por favor regístralo:</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Marca</label>
                      <input 
                        type="text" 
                        className="w-full bg-white border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                        value={newVehiculo.marca}
                        onChange={e => setNewVehiculo({...newVehiculo, marca: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Línea</label>
                      <input 
                        type="text" 
                        className="w-full bg-white border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                        value={newVehiculo.linea}
                        onChange={e => setNewVehiculo({...newVehiculo, linea: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Modelo (Año)</label>
                      <input 
                        type="number" 
                        className="w-full bg-white border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                        value={newVehiculo.modelo_anio}
                        onChange={e => setNewVehiculo({...newVehiculo, modelo_anio: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Color</label>
                      <input 
                        type="text" 
                        className="w-full bg-white border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                        value={newVehiculo.color}
                        onChange={e => setNewVehiculo({...newVehiculo, color: e.target.value})}
                      />
                    </div>
                  </div>
                  <button 
                    onClick={guardarVehiculo}
                    disabled={loading || !newVehiculo.marca}
                    className="mt-4 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
                  >
                    <Save size={18} /> Guardar Vehículo
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl flex justify-between items-center">
              <div>
                <p className="font-semibold text-emerald-900">Placa: {vehiculo.placa}</p>
                <p className="text-sm text-emerald-700">{vehiculo.marca} {vehiculo.linea} - {vehiculo.color}</p>
              </div>
              <button 
                onClick={() => { setVehiculo(null); setIsCreatingVehiculo(false); setPlaca(''); }}
                className="text-sm font-medium text-emerald-700 hover:text-emerald-900 underline"
              >
                Cambiar
              </button>
            </div>
          )}
        </section>
      )}

      {/* SECTION 3: INGRESO & CHECKLIST */}
      {vehiculo && (
        <section className="bg-white rounded-2xl p-6 md:p-8 shadow-sm border border-slate-200 animate-in fade-in slide-in-from-top-4">
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-orange-100 p-2 rounded-lg">
              <FileEdit className="text-orange-600 w-6 h-6" />
            </div>
            <h2 className="text-xl font-semibold text-slate-800">3. Detalles del Ingreso</h2>
          </div>

          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Kilometraje actual</label>
                <input 
                  type="number" 
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-orange-500 outline-none"
                  value={ingreso.kilometraje}
                  onChange={e => setIngreso({...ingreso, kilometraje: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nivel de gasolina</label>
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
              <label className="block text-sm font-medium text-slate-700 mb-1">Motivo de visita</label>
              <textarea 
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-4 py-2 h-24 focus:ring-2 focus:ring-orange-500 outline-none resize-none"
                placeholder="Describe el problema o servicio solicitado..."
                value={ingreso.motivo_visita}
                onChange={e => setIngreso({...ingreso, motivo_visita: e.target.value})}
              />
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="bg-slate-50 px-4 py-3 border-b border-slate-200">
                <span className="font-medium text-slate-800">Checklist de Recepción (Inventario)</span>
              </div>
              <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-4">
                {ChecklistItems.map(item => {
                  const isChecked = !!checklist[item.id];
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
                        {item.label}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Observaciones adicionales (Daños visuales, etc.)</label>
              <textarea 
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-4 py-2 h-20 focus:ring-2 focus:ring-orange-500 outline-none resize-none"
                value={ingreso.observaciones_recepcion}
                onChange={e => setIngreso({...ingreso, observaciones_recepcion: e.target.value})}
              />
            </div>

            <div className="pt-4 border-t border-slate-100 flex justify-end">
              <button 
                onClick={handleCrearIngreso}
                disabled={loading || !ingreso.kilometraje || !ingreso.motivo_visita}
                className="bg-slate-900 hover:bg-slate-800 text-white px-8 py-3 rounded-lg font-bold text-lg transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:shadow-none flex items-center gap-2"
              >
                <CheckCircle2 size={24} /> Registrar Ingreso
              </button>
            </div>
          </div>
        </section>
      )}

    </div>
  );
};

export default NuevoIngreso;
