import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Camera, Save, AlertCircle, Loader2, ArrowLeft, CheckCircle2, AlertTriangle, XOctagon } from 'lucide-react';
import api from '../services/api';

type EstadoItem = 'buen_estado' | 'revisar' | 'danado';

interface ItemDiagnostico {
  estado: EstadoItem;
  fallas_comunes: string[];
  notas: string;
  fotos: string[];
}

interface DiagnosticoMecanico {
  rodamientos: ItemDiagnostico;
  frenos: ItemDiagnostico;
  motor: ItemDiagnostico;
  suspension: ItemDiagnostico;
  direccion: ItemDiagnostico;
  pintura: ItemDiagnostico;
  interior_y_accesorios: ItemDiagnostico;
  aire_acondicionado: ItemDiagnostico;
  lavado: ItemDiagnostico;
  lubricacion: ItemDiagnostico;
  [key: string]: any;
}

const defaultItem: ItemDiagnostico = { estado: 'buen_estado', fallas_comunes: [], notas: '', fotos: [] };

const FALLAS_COMUNES: Record<string, string[]> = {
  rodamientos: ['Balineras de rueda', 'Retenedores', 'Bocines', 'Ejes/Semiejes', 'Guardapolvos'],
  frenos: ['Pastillas desgastadas', 'Discos rayados', 'Fuga de líquido', 'Ruido/Chillido'],
  motor: ['Fuga de aceite', 'Ruido extraño', 'Testigo encendido', 'Falla en ralentí'],
  suspension: ['Amortiguador estallado', 'Rótula/Terminal con juego', 'Bujes dañados'],
  direccion: ['Fuga de líquido', 'Dirección dura', 'Ruido al girar'],
  pintura: ['Rayón superficial', 'Rayón profundo', 'Abolladura', 'Pintura quemada'],
  interior_y_accesorios: ['Cinturones de seguridad', 'Radio / Pantalla', 'Elevavidrios', 'Seguros eléctricos', 'Tablero de instrumentos', 'Tapicería'],
  aire_acondicionado: ['No enfría', 'Ruido en compresor', 'Mal olor'],
  lavado: ['Lavado sencillo', 'Lavado detallado', 'Lavado de motor', 'Polichado', 'Porcelanizado', 'Limpieza de cojinería'],
  lubricacion: ['Cambio de aceite motor', 'Cambio filtro de aceite', 'Cambio filtro de aire', 'Cambio aceite de caja', 'Revisión de niveles', 'Engrase general']
};

const SISTEMAS = [
  { key: 'rodamientos', label: 'Rodamientos' },
  { key: 'frenos', label: 'Frenos' },
  { key: 'motor', label: 'Motor' },
  { key: 'suspension', label: 'Suspensión' },
  { key: 'direccion', label: 'Dirección' },
  { key: 'pintura', label: 'Pintura' },
  { key: 'interior_y_accesorios', label: 'Interior y Accesorios' },
  { key: 'aire_acondicionado', label: 'Aire Acondicionado' },
  { key: 'lavado', label: 'Lavado y Estética' },
  { key: 'lubricacion', label: 'Lubricación y Fluidos' }
];

const Diagnostico: React.FC = () => {
  const { id, slug } = useParams<{ id: string, slug: string }>();
  const navigate = useNavigate();
  
  const [ingreso, setIngreso] = useState<any>(null);
  const [diagnostico, setDiagnostico] = useState<DiagnosticoMecanico>({
    rodamientos: { ...defaultItem },
    frenos: { ...defaultItem },
    motor: { ...defaultItem },
    suspension: { ...defaultItem },
    direccion: { ...defaultItem },
    pintura: { ...defaultItem },
    interior_y_accesorios: { ...defaultItem },
    aire_acondicionado: { ...defaultItem },
    lavado: { ...defaultItem },
    lubricacion: { ...defaultItem }
  });
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [autoSaving, setAutoSaving] = useState(false);
  const [error, setError] = useState('');
  const [uploadingItem, setUploadingItem] = useState<string | null>(null);

  const isFirstRender = useRef(true);

  useEffect(() => {
    cargarIngreso();
  }, [id]);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const timeoutId = setTimeout(() => {
      autoGuardarAvance();
    }, 1500);

    return () => clearTimeout(timeoutId);
  }, [diagnostico]);

  const cargarIngreso = async () => {
    try {
      const { data } = await api.get(`/ingresos/${id}`);
      setIngreso(data);
      
      if (data.diagnostico_mecanico && Object.keys(data.diagnostico_mecanico).length > 0) {
        const incoming = data.diagnostico_mecanico;
        const parseItem = (key: string): ItemDiagnostico => {
          const val = incoming[key];
          if (!val) return { ...defaultItem };
          if (typeof val === 'string') return { estado: 'revisar', fallas_comunes: [], notas: val, fotos: [] };
          return {
            estado: val.estado || 'buen_estado',
            fallas_comunes: val.fallas_comunes || [],
            notas: val.notas || '',
            fotos: val.fotos || []
          };
        }

        setDiagnostico({
          rodamientos: parseItem('rodamientos'),
          frenos: parseItem('frenos'),
          motor: parseItem('motor'),
          suspension: parseItem('suspension'),
          direccion: parseItem('direccion'),
          pintura: parseItem('pintura'),
          interior_y_accesorios: parseItem('interior_y_accesorios'),
          aire_acondicionado: parseItem('aire_acondicionado'),
          lavado: parseItem('lavado'),
          lubricacion: parseItem('lubricacion')
        });
      }
    } catch (err: any) {
      setError('No se pudo cargar la información del ingreso.');
    } finally {
      setLoading(false);
    }
  };

  const updateItem = (key: string, field: keyof ItemDiagnostico, value: any) => {
    setDiagnostico(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        [field]: value
      }
    }));
  };

  const toggleFalla = (sysKey: string, falla: string) => {
    const currentList = diagnostico[sysKey].fallas_comunes || [];
    if (currentList.includes(falla)) {
      updateItem(sysKey, 'fallas_comunes', currentList.filter((f: string) => f !== falla));
    } else {
      updateItem(sysKey, 'fallas_comunes', [...currentList, falla]);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, itemKey: string) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadingItem(itemKey);
    const formData = new FormData();
    Array.from(files).forEach(file => {
      formData.append('archivos', file);
    });

    try {
      const { data } = await api.post('/upload/multiple', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      const currentPhotos = diagnostico[itemKey].fotos || [];
      updateItem(itemKey, 'fotos', [...currentPhotos, ...data.urls]);
      
    } catch (err: any) {
      setError(`Error subiendo fotos para ${itemKey}`);
    } finally {
      setUploadingItem(null);
      e.target.value = '';
    }
  };

  const removePhoto = (itemKey: string, photoIdx: number) => {
    const newPhotos = [...diagnostico[itemKey].fotos];
    newPhotos.splice(photoIdx, 1);
    updateItem(itemKey, 'fotos', newPhotos);
  };

  const autoGuardarAvance = async () => {
    try {
      setAutoSaving(true);
      await api.put(`/ingresos/${id}`, { diagnostico_mecanico: diagnostico });
    } catch (err) {
      console.error("Auto save failed", err);
    } finally {
      setAutoSaving(false);
    }
  };

  const finalizarDiagnostico = async () => {
    try {
      setSaving(true);
      await api.put(`/ingresos/${id}`, {
        diagnostico_mecanico: diagnostico,
        estado: 'en_reparacion'
      });
      navigate(`/${slug}`);
    } catch (err: any) {
      setError('Error al finalizar el diagnóstico.');
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 flex items-center justify-center"><Loader2 className="animate-spin text-blue-500 w-8 h-8" /></div>;
  if (!ingreso) return <div className="p-8 text-center text-red-500">Ingreso no encontrado.</div>;

  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-28">
      {/* Header Sticky para Auto-guardado indicator */}
      <div className="sticky top-0 z-20 bg-slate-50/90 backdrop-blur-md pb-4 pt-4 -mx-4 px-4 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(`/${slug}`)} className="p-2 bg-white border border-slate-200 rounded-full shadow-sm hover:bg-slate-100 transition-colors">
            <ArrowLeft size={20} className="text-slate-700" />
          </button>
          <div>
            <h1 className="text-lg font-black text-slate-800 tracking-tight leading-none">Diagnóstico</h1>
            <p className="text-slate-500 text-xs mt-0.5">{ingreso.taller_vehiculos?.placa}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-1.5 text-xs font-semibold">
          {autoSaving ? (
            <span className="text-slate-400 flex items-center gap-1 bg-white px-2 py-1 rounded-full border border-slate-200"><Loader2 size={12} className="animate-spin" /> Guardando...</span>
          ) : (
            <span className="text-emerald-600 flex items-center gap-1 bg-emerald-50 px-2 py-1 rounded-full border border-emerald-100"><CheckCircle2 size={12} /> Guardado</span>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-3 rounded-lg flex items-center gap-2 text-sm border border-red-200">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      <div className="space-y-4">
        {SISTEMAS.map((sys) => {
          const item = diagnostico[sys.key];
          
          return (
            <section key={sys.key} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-1">
                <h2 className="text-base font-bold text-slate-700">{sys.label}</h2>
                
                {/* Botones de Estado Compactos */}
                <div className="flex rounded-xl bg-slate-100 p-1 self-start sm:self-auto">
                  <button 
                    onClick={() => updateItem(sys.key, 'estado', 'buen_estado')}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                      item.estado === 'buen_estado' 
                        ? 'bg-white text-emerald-600 shadow-sm border border-emerald-200/50' 
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <CheckCircle2 size={14} className={item.estado === 'buen_estado' ? '' : 'opacity-40'} />
                    OK
                  </button>

                  <button 
                    onClick={() => updateItem(sys.key, 'estado', 'revisar')}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                      item.estado === 'revisar' 
                        ? 'bg-white text-amber-600 shadow-sm border border-amber-200/50' 
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <AlertTriangle size={14} className={item.estado === 'revisar' ? '' : 'opacity-40'} />
                    Revisar
                  </button>

                  <button 
                    onClick={() => updateItem(sys.key, 'estado', 'danado')}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                      item.estado === 'danado' 
                        ? 'bg-white text-red-600 shadow-sm border border-red-200/50' 
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <XOctagon size={14} className={item.estado === 'danado' ? '' : 'opacity-40'} />
                    Dañado
                  </button>
                </div>
              </div>

              {/* Progressive Disclosure: Fallas, Notas y Fotos */}
              {(item.estado === 'revisar' || item.estado === 'danado') && (
                <div className="mt-4 pt-4 border-t border-slate-100 animate-in fade-in slide-in-from-top-1 duration-200">
                  
                  {/* Checkboxes Fallas Comunes */}
                  {FALLAS_COMUNES[sys.key] && (
                    <div className="mb-4">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Fallas Comunes</p>
                      <div className="flex flex-wrap gap-2">
                        {FALLAS_COMUNES[sys.key].map(falla => (
                          <button
                            key={falla}
                            onClick={() => toggleFalla(sys.key, falla)}
                            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                              item.fallas_comunes?.includes(falla)
                                ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            {falla}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  <div className="space-y-3">
                    <input 
                      type="text"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                      placeholder="Agrega una nota específica..."
                      value={item.notas}
                      onChange={e => updateItem(sys.key, 'notas', e.target.value)}
                    />

                    <div className="flex flex-wrap items-center gap-3">
                      {/* Subida Fotográfica Compacta */}
                      <label className={`cursor-pointer bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg text-sm font-semibold shadow-sm hover:bg-slate-50 transition flex items-center gap-2 ${uploadingItem === sys.key ? 'opacity-50 pointer-events-none' : ''}`}>
                        {uploadingItem === sys.key ? (
                          <Loader2 className="animate-spin text-slate-400" size={16} />
                        ) : (
                          <Camera className="text-indigo-600" size={16} />
                        )}
                        Adjuntar Evidencia
                        <input type="file" className="hidden" multiple accept="image/*" onChange={(e) => handleFileUpload(e, sys.key)} disabled={uploadingItem === sys.key} />
                      </label>
                      <span className="text-xs text-slate-400">{item.fotos.length} fotos adjuntas</span>
                    </div>

                    {/* Previews en miniatura */}
                    {item.fotos.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {item.fotos.map((url: string, idx: number) => (
                          <div key={idx} className="relative group w-14 h-14 rounded-lg overflow-hidden border border-slate-200">
                            <img src={url} alt={`${sys.label} evidencia ${idx+1}`} className="w-full h-full object-cover" />
                            <button 
                              onClick={() => removePhoto(sys.key, idx)}
                              className="absolute top-0.5 right-0.5 bg-slate-900/60 hover:bg-red-600 text-white p-1 rounded-full"
                            >
                              <XOctagon size={10} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                </div>
              )}
            </section>
          );
        })}
      </div>

      {/* Floating Action/Footer Button */}
      <div className="fixed bottom-0 left-0 right-0 p-3 bg-white/95 backdrop-blur-md border-t border-slate-200 z-30 pb-safe">
        <div className="max-w-2xl mx-auto flex gap-3">
          <button 
            onClick={autoGuardarAvance}
            disabled={autoSaving}
            className="flex-1 bg-slate-100 text-slate-700 font-bold py-3.5 px-4 rounded-xl hover:bg-slate-200 transition flex items-center justify-center gap-2"
          >
            {autoSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            <span className="text-sm">Guardar</span>
          </button>
          <button 
             onClick={finalizarDiagnostico}
             disabled={saving}
             className="flex-[2] bg-slate-900 hover:bg-black text-white font-bold py-3.5 px-4 rounded-xl transition shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle2 size={18} />}
            <span className="text-sm">Pasar a Reparación</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default Diagnostico;
