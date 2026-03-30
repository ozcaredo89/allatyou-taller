import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Camera, Save, AlertCircle, Loader2, ArrowLeft, CheckCircle2, AlertTriangle, XOctagon, Settings, Eye, EyeOff, Plus, X, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

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

interface ConfigDiagnostico {
  [key: string]: { visible: boolean; fallas_adicionales: string[] };
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
  const { empresaId } = useAuth();
  const { t } = useTranslation();
  
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

  const [isEditMode, setIsEditMode] = useState(false);
  const [configDiagnostico, setConfigDiagnostico] = useState<ConfigDiagnostico>({});
  const [configOriginal, setConfigOriginal] = useState<ConfigDiagnostico>({});
  const [nuevaFalla, setNuevaFalla] = useState('');
  const [sistemaActivoParaFalla, setSistemaActivoParaFalla] = useState<string | null>(null);
  const [savingConfig, setSavingConfig] = useState(false);
  
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
      if (empresaId) {
        const { data: empresaData } = await api.get(`/auth/empresas`);
        const empresa = (empresaData || []).find((e: any) => e.id === empresaId);
        const cfg: ConfigDiagnostico = empresa?.config_diagnostico || {};
        setConfigDiagnostico(cfg);
        setConfigOriginal(cfg);
      }
    } catch (err: any) {
      setError(t('diagnostico.error_load'));
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

  const sistemasVisibles = SISTEMAS.filter(sys => {
    if (isEditMode) return true;
    const cfg = configDiagnostico[sys.key];
    return cfg === undefined || cfg.visible !== false;
  });

  const getFallas = (key: string): string[] => {
    const base = FALLAS_COMUNES[key] || [];
    const extras = configDiagnostico[key]?.fallas_adicionales || [];
    return [...base, ...extras];
  };

  const toggleVisibility = (sysKey: string) => {
    setConfigDiagnostico(prev => {
      const current = prev[sysKey] || { visible: true, fallas_adicionales: [] };
      return {
        ...prev,
        [sysKey]: { ...current, visible: !current.visible }
      };
    });
  };

  const addFallaPersonalizada = (sysKey: string) => {
    if (!nuevaFalla.trim()) return;
    setConfigDiagnostico(prev => {
      const current = prev[sysKey] || { visible: true, fallas_adicionales: [] };
      return {
        ...prev,
        [sysKey]: { ...current, fallas_adicionales: [...current.fallas_adicionales, nuevaFalla.trim()] }
      };
    });
    setNuevaFalla('');
    setSistemaActivoParaFalla(null);
  };

  const removeFallaPersonalizada = (sysKey: string, fallaToRemove: string) => {
    setConfigDiagnostico(prev => {
      const current = prev[sysKey] || { visible: true, fallas_adicionales: [] };
      return {
        ...prev,
        [sysKey]: { ...current, fallas_adicionales: current.fallas_adicionales.filter(f => f !== fallaToRemove) }
      };
    });
  };

  const guardarConfiguracion = async () => {
    try {
      setSavingConfig(true);
      await api.patch(`/auth/empresas/${empresaId}/config`, {
        config_diagnostico: configDiagnostico
      });
      setConfigOriginal(configDiagnostico);
      setIsEditMode(false);
    } catch (err: any) {
      setError("Error guardando la configuración de diagnóstico.");
    } finally {
      setSavingConfig(false);
    }
  };

  const cancelarEdicion = () => {
    setConfigDiagnostico(configOriginal);
    setIsEditMode(false);
    setNuevaFalla('');
    setSistemaActivoParaFalla(null);
  };

  if (loading) return <div className="flex justify-center items-center h-64"><Loader2 className="animate-spin text-indigo-600 w-8 h-8" /></div>;
  if (!ingreso) return <div className="p-8 text-center text-red-500">{t('diagnostico.error_load')}</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(`/${slug}`)} className="p-2 bg-white border border-slate-200 rounded-full shadow-sm hover:bg-slate-100 transition">
            <ArrowLeft size={20} className="text-slate-700" />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              {t('diagnostico.title')} <span className="text-indigo-600 font-black">{ingreso.taller_vehiculos?.placa}</span>
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-slate-500 text-sm">{ingreso.taller_vehiculos?.marca} {ingreso.taller_vehiculos?.linea}</span>
              <span className="text-slate-300">•</span>
              <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                {autoSaving ? (
                  <><Loader2 size={10} className="animate-spin" /> {t('diagnostico.btn_guardando')}</>
                ) : (
                  <><Save size={10} /> {t('diagnostico.btn_guardado')}</>
                )}
              </span>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-lg flex items-center gap-3 border border-red-200">
          <AlertCircle size={20} />
          <span>{error}</span>
        </div>
      )}

      {/* Editor Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-slate-900 text-white p-4 rounded-2xl shadow-lg">
        <div className="mb-4 sm:mb-0">
          <h2 className="font-semibold text-lg flex items-center gap-2">
            <Settings size={20} className="text-indigo-400" /> 
            {isEditMode ? t('diagnostico.modo_personalizacion') : t('diagnostico.sistemas_evaluacion')}
          </h2>
          {isEditMode && <p className="text-slate-400 text-sm mt-0.5">Oculta sistemas que no uses, añade fallas comunes personalizadas por sistema.</p>}
        </div>
        <div>
          {!isEditMode ? (
            <button
              onClick={() => setIsEditMode(true)}
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2 rounded-lg text-sm font-medium transition"
            >
              <Settings size={16} /> {t('diagnostico.btn_personalizar')}
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={cancelarEdicion}
                className="flex-[1] flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded-lg text-sm font-medium transition"
              >
                {t('diagnostico.btn_cancelar')}
              </button>
              <button
                onClick={guardarConfiguracion}
                disabled={savingConfig}
                className="flex-[2] flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-bold transition disabled:opacity-50"
              >
                {savingConfig ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} 
                {t('diagnostico.btn_guardar')}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-6">
        {sistemasVisibles.map((sys) => {
          const item = diagnostico[sys.key];
          const fallas = getFallas(sys.key);
          const isVisible = configDiagnostico[sys.key] === undefined || configDiagnostico[sys.key].visible !== false;

          return (
            <div 
              key={sys.key} 
              className={`bg-white rounded-2xl shadow-sm border overflow-hidden transition-all ${
                isEditMode && !isVisible ? 'opacity-60 border-slate-200 bg-slate-50' : 'border-slate-200 hover:shadow-md'
              }`}
            >
              <div className="p-5 border-b border-slate-100 flex flex-wrap gap-4 justify-between items-center bg-slate-50/50">
                <div className="flex items-center gap-3">
                  {isEditMode && (
                    <button 
                      onClick={() => toggleVisibility(sys.key)} 
                      className={`p-1.5 rounded-lg transition ${isVisible ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200' : 'bg-slate-200 text-slate-500 hover:bg-slate-300'}`}
                      title={isVisible ? 'Ocultar sistema' : 'Mostrar sistema'}
                    >
                      {isVisible ? <Eye size={18} /> : <EyeOff size={18} />}
                    </button>
                  )}
                  <h3 className={`font-bold text-lg ${isEditMode && !isVisible ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                    {t(`diagnostico.sistemas.${sys.key}`) || sys.label}
                  </h3>
                </div>
                
                <div className="flex gap-2 w-full sm:w-auto">
                  <button 
                    disabled={isEditMode}
                    onClick={() => updateItem(sys.key, 'estado', 'buen_estado')}
                    className={`flex-1 sm:flex-none flex justify-center items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                      item.estado === 'buen_estado' ? 'bg-emerald-100 text-emerald-800 ring-2 ring-emerald-500 ring-offset-1' : 'bg-white border hover:bg-emerald-50 text-slate-600'
                    }`}
                  >
                    <CheckCircle2 size={16} className={item.estado === 'buen_estado' ? 'text-emerald-600' : ''} /> {t('diagnostico.btn_ok')}
                  </button>
                  <button 
                    disabled={isEditMode}
                    onClick={() => updateItem(sys.key, 'estado', 'revisar')}
                    className={`flex-1 sm:flex-none flex justify-center items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                      item.estado === 'revisar' ? 'bg-amber-100 text-amber-800 ring-2 ring-amber-500 ring-offset-1' : 'bg-white border hover:bg-amber-50 text-slate-600'
                    }`}
                  >
                    <AlertTriangle size={16} className={item.estado === 'revisar' ? 'text-amber-600' : ''} /> {t('diagnostico.btn_revisar')}
                  </button>
                  <button 
                    disabled={isEditMode}
                    onClick={() => updateItem(sys.key, 'estado', 'danado')}
                    className={`flex-1 sm:flex-none flex justify-center items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                      item.estado === 'danado' ? 'bg-red-100 text-red-800 ring-2 ring-red-500 ring-offset-1' : 'bg-white border hover:bg-red-50 text-slate-600'
                    }`}
                  >
                    <XOctagon size={16} className={item.estado === 'danado' ? 'text-red-600' : ''}/> {t('diagnostico.btn_danado')}
                  </button>
                </div>
              </div>

              {(item.estado !== 'buen_estado' || isEditMode) && isVisible && (
                <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in slide-in-from-top-2">
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-sm font-medium text-slate-700">{t('diagnostico.fallas_comunes')}</label>
                      {isEditMode && (
                        <button 
                          onClick={() => setSistemaActivoParaFalla(sistemaActivoParaFalla === sys.key ? null : sys.key)}
                          className="text-xs flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-medium bg-indigo-50 px-2 py-1 rounded"
                        >
                          <Plus size={12} /> {t('diagnostico.anadir_falla')}
                        </button>
                      )}
                    </div>

                    {isEditMode && sistemaActivoParaFalla === sys.key && (
                      <div className="flex gap-2 mb-3 mt-2">
                        <input
                          type="text"
                          value={nuevaFalla}
                          onChange={e => setNuevaFalla(e.target.value)}
                          placeholder={t('diagnostico.nueva_falla')}
                          className="flex-1 border border-indigo-200 bg-indigo-50/50 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                          onKeyDown={e => e.key === 'Enter' && addFallaPersonalizada(sys.key)}
                          autoFocus
                        />
                        <button onClick={() => addFallaPersonalizada(sys.key)} className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-indigo-700">Add</button>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                      {fallas.map(falla => {
                        const isSelected = item.fallas_comunes.includes(falla);
                        const isCustom = configDiagnostico[sys.key]?.fallas_adicionales?.includes(falla);
                        return (
                          <div key={falla} className="flex group">
                            <span 
                              onClick={() => !isEditMode && toggleFalla(sys.key, falla)}
                              className={`text-sm px-3 py-1.5 border rounded-lg cursor-pointer transition-colors ${
                                isEditMode ? 'cursor-default border-slate-200 bg-slate-50 text-slate-700' :
                                isSelected ? 'bg-indigo-50 text-indigo-800 border-indigo-300 font-medium' : 'bg-white text-slate-600 hover:bg-slate-50'
                              } ${isEditMode && isCustom ? 'rounded-r-none border-r-0' : ''}`}
                            >
                              {falla}
                            </span>
                            {isEditMode && isCustom && (
                              <button 
                                onClick={() => removeFallaPersonalizada(sys.key, falla)}
                                className="bg-red-50 text-red-500 hover:bg-red-500 hover:text-white border border-red-200 rounded-r-lg px-2 flex items-center justify-center transition-colors"
                                title="Eliminar falla personalizada"
                              >
                                <X size={14} />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {!isEditMode && (
                    <div className="space-y-4">
                      <textarea
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none h-24"
                        placeholder={t('diagnostico.notas_adicionales')}
                        value={item.notas}
                        onChange={(e) => updateItem(sys.key, 'notas', e.target.value)}
                      />
                      
                      {/* Subida de Fotos */}
                      <div>
                        {item.fotos.length > 0 && (
                          <div className="flex gap-2 overflow-x-auto pb-2 mb-2 snap-x">
                            {item.fotos.map((foto: string, idx: number) => (
                              <div key={idx} className="relative group shrink-0 snap-start">
                                <img src={foto} alt={`Foto ${sys.label}`} className="h-20 w-20 object-cover rounded-xl border border-slate-200" />
                                <button onClick={() => removePhoto(sys.key, idx)} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm hover:bg-red-600">
                                  <XCircle size={14} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                        <label className={`flex items-center justify-center gap-2 border-2 border-dashed rounded-xl p-4 cursor-pointer transition-colors ${
                          uploadingItem === sys.key ? 'bg-indigo-50 border-indigo-300 text-indigo-600' : 'bg-white border-slate-300 hover:bg-slate-50 text-slate-500 hover:text-indigo-600'
                        }`}>
                          <input type="file" multiple accept="image/*" className="hidden" disabled={uploadingItem === sys.key} onChange={(e) => handleFileUpload(e, sys.key)} />
                          {uploadingItem === sys.key ? (
                            <><Loader2 size={20} className="animate-spin" /> <span className="text-sm font-medium">{t('diagnostico.subiendo')}</span></>
                          ) : (
                            <><Camera size={20} /> <span className="text-sm font-medium">{t('diagnostico.adjuntar_fotos')}</span></>
                          )}
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!isEditMode && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/80 backdrop-blur-md border-t border-slate-200 shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.1)] flex justify-center z-40">
          <div className="max-w-4xl w-full flex justify-end">
            <button
              onClick={finalizarDiagnostico}
              disabled={saving}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-3 rounded-xl font-bold text-lg transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:shadow-none flex items-center gap-2"
            >
              {saving ? <Loader2 size={24} className="animate-spin" /> : <Save size={24} />} 
              {t('diagnostico.btn_finalizar')}
            </button>
          </div>
        </div>
      )}

    </div>
  );
};

export default Diagnostico;
