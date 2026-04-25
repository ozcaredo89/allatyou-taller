import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { UserPlus, ShieldCheck, Clock, Loader2, X, Mail, Lock, Wrench, Users } from 'lucide-react';
import api from '../services/api';

interface Miembro {
  id: string;
  email: string;
  is_verified: boolean;
}

interface Tecnico {
  id: string;
  nombre: string;
  estado: string;
}

const Equipo: React.FC = () => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'usuarios' | 'tecnicos'>('usuarios');

  // --- Estado Usuarios ---
  const [miembros, setMiembros] = useState<Miembro[]>([]);
  const [loadingUsuarios, setLoadingUsuarios] = useState(true);
  const [showModalUsuario, setShowModalUsuario] = useState(false);
  const [savingUsuario, setSavingUsuario] = useState(false);
  const [errorUsuario, setErrorUsuario] = useState('');
  const [nuevoEmail, setNuevoEmail] = useState('');
  const [nuevoPassword, setNuevoPassword] = useState('');

  // --- Estado Técnicos ---
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [loadingTecnicos, setLoadingTecnicos] = useState(false);
  const [showModalTecnico, setShowModalTecnico] = useState(false);
  const [savingTecnico, setSavingTecnico] = useState(false);
  const [errorTecnico, setErrorTecnico] = useState('');
  const [nuevoTecnicoNombre, setNuevoTecnicoNombre] = useState('');

  useEffect(() => {
    if (activeTab === 'usuarios') cargarEquipo();
    if (activeTab === 'tecnicos') cargarTecnicos();
  }, [activeTab]);

  // --- Lógica Usuarios ---
  const cargarEquipo = async () => {
    try {
      setLoadingUsuarios(true);
      const { data } = await api.get('/auth/equipo');
      setMiembros(data);
    } catch {
      setErrorUsuario('Error cargando equipo.');
    } finally {
      setLoadingUsuarios(false);
    }
  };

  const crearMiembro = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevoEmail.trim() || !nuevoPassword.trim()) return;
    setSavingUsuario(true);
    setErrorUsuario('');
    try {
      await api.post('/auth/equipo', { email: nuevoEmail, password: nuevoPassword });
      setShowModalUsuario(false);
      setNuevoEmail('');
      setNuevoPassword('');
      await cargarEquipo();
    } catch (err: any) {
      setErrorUsuario(err.response?.data?.error || 'Error creando usuario.');
    } finally {
      setSavingUsuario(false);
    }
  };

  const aprobar = async (id: string) => {
    try {
      await api.patch(`/auth/equipo/${id}/aprobar`);
      await cargarEquipo();
    } catch {
      setErrorUsuario('Error aprobando usuario.');
    }
  };

  // --- Lógica Técnicos ---
  const cargarTecnicos = async () => {
    try {
      setLoadingTecnicos(true);
      const { data } = await api.get('/tecnicos');
      setTecnicos(data);
    } catch {
      setErrorTecnico('Error cargando técnicos.');
    } finally {
      setLoadingTecnicos(false);
    }
  };

  const crearTecnico = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevoTecnicoNombre.trim()) return;
    setSavingTecnico(true);
    setErrorTecnico('');
    try {
      await api.post('/tecnicos', { nombre: nuevoTecnicoNombre });
      setShowModalTecnico(false);
      setNuevoTecnicoNombre('');
      await cargarTecnicos();
    } catch (err: any) {
      setErrorTecnico(err.response?.data?.error || 'Error creando técnico.');
    } finally {
      setSavingTecnico(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('equipo.title')}</h1>
          <p className="text-slate-500 text-sm">{t('equipo.subtitle')}</p>
        </div>
        
        {/* Tabs */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl w-fit">
          <button
            onClick={() => setActiveTab('usuarios')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition ${activeTab === 'usuarios' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Users size={16} /> {t('equipo.tab_usuarios')}
          </button>
          <button
            onClick={() => setActiveTab('tecnicos')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition ${activeTab === 'tecnicos' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Wrench size={16} /> {t('equipo.tab_tecnicos')}
          </button>
        </div>
      </div>

      {/* ═══════ TAB USUARIOS ═══════ */}
      {activeTab === 'usuarios' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => setShowModalUsuario(true)}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-semibold transition shadow-md text-sm"
            >
              <UserPlus size={18} /> {t('equipo.btn_nuevo')}
            </button>
          </div>

          {errorUsuario && (
            <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm font-medium border border-red-100">
              {errorUsuario}
            </div>
          )}

          {loadingUsuarios ? (
            <div className="flex justify-center items-center h-64"><Loader2 className="animate-spin w-8 h-8 text-indigo-600" /></div>
          ) : (
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
          )}

          {/* Modal Crear Usuario */}
          {showModalUsuario && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5 relative">
                <button onClick={() => setShowModalUsuario(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
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
                    disabled={savingUsuario}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition disabled:opacity-50"
                  >
                    {savingUsuario ? <Loader2 className="animate-spin" size={18} /> : <UserPlus size={18} />}
                    {t('equipo.btn_guardar')}
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════ TAB TÉCNICOS ═══════ */}
      {activeTab === 'tecnicos' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => setShowModalTecnico(true)}
              className="flex items-center gap-2 bg-slate-900 hover:bg-black text-white px-5 py-2.5 rounded-xl font-semibold transition shadow-md text-sm"
            >
              <UserPlus size={18} /> {t('equipo.btn_nuevo_tecnico')}
            </button>
          </div>

          {errorTecnico && (
            <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm font-medium border border-red-100">
              {errorTecnico}
            </div>
          )}

          {loadingTecnicos ? (
            <div className="flex justify-center items-center h-64"><Loader2 className="animate-spin w-8 h-8 text-indigo-600" /></div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-6 py-3 font-semibold text-slate-500 uppercase text-xs tracking-wider">{t('equipo.nombre_tecnico')}</th>
                    <th className="text-left px-6 py-3 font-semibold text-slate-500 uppercase text-xs tracking-wider">{t('equipo.estado')}</th>
                  </tr>
                </thead>
                <tbody>
                  {tecnicos.map(t => (
                    <tr key={t.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition">
                      <td className="px-6 py-4 font-bold text-slate-800">{t.nombre}</td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-3 py-1 rounded-full">
                          {t.estado}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {tecnicos.length === 0 && (
                    <tr>
                      <td colSpan={2} className="px-6 py-8 text-center text-slate-400">{t('equipo.sin_tecnicos')}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Modal Crear Técnico */}
          {showModalTecnico && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5 relative">
                <button onClick={() => setShowModalTecnico(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
                  <X size={20} />
                </button>
                <h2 className="text-xl font-bold text-slate-900">{t('equipo.btn_nuevo_tecnico')}</h2>
                
                <form onSubmit={crearTecnico} className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-600 mb-1.5">
                      <Wrench size={14} className="inline mr-1.5 -mt-0.5" />{t('equipo.nombre_tecnico')}
                    </label>
                    <input
                      type="text"
                      required
                      className="block w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none font-medium"
                      placeholder="Ej. Juan Pérez"
                      value={nuevoTecnicoNombre}
                      onChange={e => setNuevoTecnicoNombre(e.target.value)}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={savingTecnico}
                    className="w-full bg-slate-900 hover:bg-black text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition disabled:opacity-50"
                  >
                    {savingTecnico ? <Loader2 className="animate-spin" size={18} /> : <UserPlus size={18} />}
                    {t('equipo.btn_nuevo_tecnico')}
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Equipo;
