import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { UserPlus, ShieldCheck, Clock, Loader2, X, Mail, Lock } from 'lucide-react';
import api from '../services/api';

interface Miembro {
  id: string;
  email: string;
  is_verified: boolean;
}

const Equipo: React.FC = () => {
  const { t } = useTranslation();
  const [miembros, setMiembros] = useState<Miembro[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Form
  const [nuevoEmail, setNuevoEmail] = useState('');
  const [nuevoPassword, setNuevoPassword] = useState('');

  useEffect(() => { cargarEquipo(); }, []);

  const cargarEquipo = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/auth/equipo');
      setMiembros(data);
    } catch {
      setError('Error cargando equipo.');
    } finally {
      setLoading(false);
    }
  };

  const crearMiembro = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevoEmail.trim() || !nuevoPassword.trim()) return;
    setSaving(true);
    setError('');
    try {
      await api.post('/auth/equipo', { email: nuevoEmail, password: nuevoPassword });
      setShowModal(false);
      setNuevoEmail('');
      setNuevoPassword('');
      await cargarEquipo();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error creando usuario.');
    } finally {
      setSaving(false);
    }
  };

  const aprobar = async (id: string) => {
    try {
      await api.patch(`/auth/equipo/${id}/aprobar`);
      await cargarEquipo();
    } catch {
      setError('Error aprobando usuario.');
    }
  };

  if (loading) return <div className="flex justify-center items-center h-64"><Loader2 className="animate-spin w-8 h-8 text-indigo-600" /></div>;

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('equipo.title')}</h1>
          <p className="text-slate-500 text-sm">{t('equipo.subtitle')}</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-semibold transition shadow-md text-sm"
        >
          <UserPlus size={18} /> {t('equipo.btn_nuevo')}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm font-medium border border-red-100">
          {error}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-6 py-3 font-semibold text-slate-500 uppercase text-xs tracking-wider">{t('equipo.email')}</th>
              <th className="text-left px-6 py-3 font-semibold text-slate-500 uppercase text-xs tracking-wider">{t('equipo.estado')}</th>
              <th className="px-6 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {miembros.map(m => (
              <tr key={m.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition">
                <td className="px-6 py-4 font-medium text-slate-800">{m.email}</td>
                <td className="px-6 py-4">
                  {m.is_verified ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full">
                      <ShieldCheck size={14} /> {t('equipo.aprobado')}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1 rounded-full">
                      <Clock size={14} /> {t('equipo.pendiente')}
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 text-right">
                  {!m.is_verified && (
                    <button
                      onClick={() => aprobar(m.id)}
                      className="text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-4 py-2 rounded-lg transition"
                    >
                      {t('equipo.btn_aprobar')}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {miembros.length === 0 && (
              <tr>
                <td colSpan={3} className="px-6 py-8 text-center text-slate-400">Sin miembros registrados.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Crear Usuario */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5 relative">
            <button onClick={() => setShowModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
              <X size={20} />
            </button>
            <h2 className="text-xl font-bold text-slate-900">{t('equipo.modal_title')}</h2>
            
            <form onSubmit={crearMiembro} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1.5">
                  <Mail size={14} className="inline mr-1.5 -mt-0.5" />{t('equipo.email')}
                </label>
                <input
                  type="email"
                  required
                  className="block w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="usuario@taller.com"
                  value={nuevoEmail}
                  onChange={e => setNuevoEmail(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1.5">
                  <Lock size={14} className="inline mr-1.5 -mt-0.5" />{t('equipo.password')}
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  className="block w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="••••••••"
                  value={nuevoPassword}
                  onChange={e => setNuevoPassword(e.target.value)}
                />
              </div>
              <button
                type="submit"
                disabled={saving}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition disabled:opacity-50"
              >
                {saving ? <Loader2 className="animate-spin" size={18} /> : <UserPlus size={18} />}
                {t('equipo.btn_guardar')}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Equipo;
