import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import { Loader2, ArrowLeft, AlertCircle, Wrench, Building2, CheckCircle2, Lock, Mail, KeyRound } from 'lucide-react';

interface EmpresaItem {
  id: string;
  nombre: string;
  slug: string;
}

const Login: React.FC = () => {
  const navigate = useNavigate();
  const { login, loginWithPassword } = useAuth();
  const { t } = useTranslation();

  const [step, setStep] = useState<1 | 2>(1);
  const [loginMode, setLoginMode] = useState<'password' | 'otp'>('password');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [empresas, setEmpresas] = useState<EmpresaItem[]>([]);
  const [selectedEmpresa, setSelectedEmpresa] = useState<EmpresaItem | null>(null);
  
  // Password mode
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  // OTP mode
  const [otp, setOtp] = useState('');

  useEffect(() => { fetchEmpresas(); }, []);

  const fetchEmpresas = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/auth/empresas');
      setEmpresas(data);
    } catch (err: any) {
      setError('No se pudo cargar la lista de empresas.');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectEmpresa = (empresa: EmpresaItem) => {
    setSelectedEmpresa(empresa);
    setStep(2);
    setLoginMode('password');
    setError('');
    setEmail('');
    setPassword('');
    setOtp('');
  };

  const handleSwitchToOtp = async () => {
    if (!selectedEmpresa) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await api.post('/auth/request-otp', { empresa_id: selectedEmpresa.id });
      if (data.success) {
        setLoginMode('otp');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error solicitando código.');
    } finally {
      setLoading(false);
    }
  };

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim() || !selectedEmpresa) return;
    
    setLoading(true);
    setError('');
    try {
      const result = await loginWithPassword(selectedEmpresa.id, email, password);
      navigate(`/${result.slug}`);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Credenciales inválidas.');
    } finally {
      setLoading(false);
    }
  };

  const submitOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length !== 4 || !selectedEmpresa) return;
    
    setLoading(true);
    setError('');
    try {
      const { data } = await api.post('/auth/verify-otp', { 
        empresa_id: selectedEmpresa.id, 
        otp 
      });
      
      if (data.token) {
        login(data.token, data.empresa.id, data.empresa.slug, data.empresa.nombre, 'kiosco@taller');
        navigate(`/${data.empresa.slug}`);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Código inválido.');
    } finally {
      setLoading(false);
    }
  };

  const clearSelection = () => {
    setSelectedEmpresa(null);
    setOtp('');
    setEmail('');
    setPassword('');
    setStep(1);
    setLoginMode('password');
    setError('');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        
        {/* App Logo */}
        <div className="flex flex-col items-center justify-center mb-8">
          <div className="p-3 bg-indigo-600 rounded-xl shadow-lg shadow-indigo-500/30 mb-4">
            <Wrench className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">Kiosco AllAtYou</h1>
          <p className="text-slate-500 text-sm mt-1">Selecciona tu sucursal para operar</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-8 border border-slate-100">
          {error && (
            <div className="mb-6 bg-red-50 text-red-600 px-4 py-3 rounded-xl flex items-center gap-3 text-sm font-medium border border-red-100">
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          {/* STEP 1: Selección de empresa */}
          {step === 1 && (
             <div className="space-y-4">
               {loading && empresas.length === 0 ? (
                 <div className="flex justify-center p-6"><Loader2 className="animate-spin text-indigo-600" /></div>
               ) : (
                 <div className="grid grid-cols-1 gap-3">
                   {empresas.map(empresa => (
                     <button
                       key={empresa.id}
                       onClick={() => handleSelectEmpresa(empresa)}
                       disabled={loading}
                       className="flex items-center gap-4 bg-slate-50 hover:bg-slate-100 border border-slate-200 p-4 rounded-xl transition duration-200 disabled:opacity-50 text-left"
                     >
                       <div className="bg-white p-2 border border-slate-200 rounded-lg">
                         <Building2 className="text-indigo-600 shrink-0" size={20} />
                       </div>
                       <div>
                         <strong className="text-slate-800 block text-lg leading-none mb-1">{empresa.nombre}</strong>
                         <span className="text-slate-500 text-xs">Sucursal: {empresa.slug}</span>
                       </div>
                     </button>
                   ))}
                 </div>
               )}
               {empresas.length === 0 && !loading && (
                 <p className="text-center text-slate-500 text-sm">No hay talleres registrados en el sistema.</p>
               )}
             </div>
          )}

          {/* STEP 2: Login Híbrido */}
          {step === 2 && selectedEmpresa && (
            <div className="animate-in fade-in slide-in-from-bottom-2">
              
              <div className="flex items-center gap-2 mb-6 text-sm">
                <button type="button" onClick={clearSelection} className="p-1 rounded bg-slate-100 text-slate-600 hover:bg-slate-200">
                  <ArrowLeft size={16} />
                </button>
                <span className="font-semibold text-slate-700">Volver a sucursales</span>
              </div>

              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full mb-3">
                  <CheckCircle2 size={24} />
                </div>
                <h2 className="text-xl font-bold text-slate-800 tracking-tight">{selectedEmpresa.nombre}</h2>
              </div>

              {/* === PASSWORD MODE === */}
              {loginMode === 'password' && (
                <form onSubmit={submitPassword} className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-600 mb-1.5">
                      <Mail size={14} className="inline mr-1.5 -mt-0.5" />{t('login.email')}
                    </label>
                    <input
                      type="email"
                      required
                      className="block w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 transition-shadow text-sm"
                      placeholder="admin@taller.com"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      disabled={loading}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-600 mb-1.5">
                      <Lock size={14} className="inline mr-1.5 -mt-0.5" />{t('login.password')}
                    </label>
                    <input
                      type="password"
                      required
                      className="block w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 transition-shadow text-sm"
                      placeholder="••••••••"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      disabled={loading}
                    />
                  </div>
                  <button 
                    type="submit" 
                    disabled={loading || !email.trim() || !password.trim()}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 transition disabled:opacity-50"
                  >
                    {loading ? <Loader2 className="animate-spin" size={20} /> : <Lock size={18} />}
                    {t('login.btn_ingresar')}
                  </button>

                  <div className="relative my-4">
                    <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200"></div></div>
                    <div className="relative flex justify-center text-xs"><span className="px-2 bg-white text-slate-400">o</span></div>
                  </div>

                  <button
                    type="button"
                    onClick={handleSwitchToOtp}
                    disabled={loading}
                    className="w-full border border-slate-200 text-slate-600 hover:bg-slate-50 font-medium py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition text-sm disabled:opacity-50"
                  >
                    <KeyRound size={16} />
                    {t('login.btn_usar_codigo')}
                  </button>
                </form>
              )}

              {/* === OTP MODE === */}
              {loginMode === 'otp' && (
                <form onSubmit={submitOtp} className="space-y-5">
                  <p className="text-sm text-slate-500 text-center px-4 leading-relaxed">Verifica el correo administrativo del taller e introduce el código de 4 dígitos</p>

                  <div>
                    <input
                      type="text"
                      required
                      maxLength={4}
                      placeholder="0000"
                      className="block w-full px-4 py-4 text-center tracking-[1em] text-3xl bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 font-bold transition-shadow"
                      value={otp}
                      onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                      disabled={loading}
                    />
                  </div>
                  <button 
                    type="submit" 
                    disabled={loading || otp.length < 4}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 transition disabled:opacity-50"
                  >
                    {loading ? <Loader2 className="animate-spin" size={20} /> : 'Autorizar Ingreso'}
                  </button>

                  <div className="relative my-2">
                    <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200"></div></div>
                    <div className="relative flex justify-center text-xs"><span className="px-2 bg-white text-slate-400">o</span></div>
                  </div>

                  <button
                    type="button"
                    onClick={() => { setLoginMode('password'); setError(''); }}
                    className="w-full border border-slate-200 text-slate-600 hover:bg-slate-50 font-medium py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition text-sm"
                  >
                    <Lock size={16} />
                    {t('login.btn_usar_password')}
                  </button>
                </form>
              )}

            </div>
          )}
        </div>
        
      </div>
    </div>
  );
};

export default Login;
