import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Loader2, CheckSquare, Square, Wrench } from 'lucide-react';
import api from '../services/api';

interface Tecnico {
  id: string;
  nombre: string;
  estado: string;
}

interface Props {
  ingresoId: string;
  tecnicosAsignadosIds: string[];
  onClose: () => void;
  onSuccess: () => void;
}

const ModalAsignarTecnicos: React.FC<Props> = ({ ingresoId, tecnicosAsignadosIds, onClose, onSuccess }) => {
  const { t } = useTranslation();
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(tecnicosAsignadosIds));
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchTecnicos = async () => {
      try {
        setLoading(true);
        const { data } = await api.get('/tecnicos');
        setTecnicos(data.filter((t: Tecnico) => t.estado === 'activo'));
      } catch (err) {
        setError('Error al cargar técnicos.');
      } finally {
        setLoading(false);
      }
    };
    fetchTecnicos();
  }, []);

  const toggleSelection = (id: string) => {
    const newSelection = new Set(selectedIds);
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    setSelectedIds(newSelection);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.post(`/ingresos/${ingresoId}/tecnicos`, {
        tecnicos_ids: Array.from(selectedIds)
      });
      onSuccess();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al asignar técnicos.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5 relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
          <X size={20} />
        </button>
        
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-100 rounded-lg text-indigo-600">
            <Wrench size={20} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">{t('dashboard.asignar_tecnicos')}</h2>
            <p className="text-sm text-slate-500">{t('dashboard.selecciona_tecnicos')}</p>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm font-medium border border-red-100">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="animate-spin text-indigo-600" /></div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="max-h-60 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
              {tecnicos.length === 0 ? (
                <p className="text-center text-slate-500 py-4 text-sm">{t('equipo.sin_tecnicos')}</p>
              ) : (
                tecnicos.map(tecnico => (
                  <button
                    key={tecnico.id}
                    type="button"
                    onClick={() => toggleSelection(tecnico.id)}
                    className={`w-full flex items-center justify-between p-3 rounded-xl border transition text-left ${
                      selectedIds.has(tecnico.id)
                        ? 'border-indigo-600 bg-indigo-50/50'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <span className={`font-semibold text-sm ${selectedIds.has(tecnico.id) ? 'text-indigo-900' : 'text-slate-700'}`}>
                      {tecnico.nombre}
                    </span>
                    {selectedIds.has(tecnico.id) ? (
                      <CheckSquare className="text-indigo-600" size={18} />
                    ) : (
                      <Square className="text-slate-300" size={18} />
                    )}
                  </button>
                ))
              )}
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={saving || tecnicos.length === 0}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition disabled:opacity-50"
              >
                {saving ? <Loader2 className="animate-spin" size={18} /> : null}
                {t('dashboard.guardar_asignacion')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default ModalAsignarTecnicos;
