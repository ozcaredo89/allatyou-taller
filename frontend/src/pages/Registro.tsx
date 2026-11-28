import appI18n from "../i18n";
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { Loader2, ArrowRight, AlertCircle, Wrench, Building2, CheckCircle2 } from 'lucide-react';
import { Turnstile } from '@marsidev/react-turnstile';

const Registro: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Paso 1
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  // Paso 2
  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [otp, setOtp] = useState('');

  const submitRegistro = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim() || !email.trim()) return;
    setLoading(true);
    setError('');

    try {
      const { data } = await api.post('/auth/registro', { nombre, email, turnstileToken });
      if (data.success) {
        setEmpresaId(data.empresa_id);
        setStep(2);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'No se pudo crear el registro.');
    } finally {
      setLoading(false);
    }
  };

  const submitOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length !== 4 || !empresaId) return;
    setLoading(true);
    setError('');

    try {
      const { data } = await api.post('/auth/verify-otp', {
        empresa_id: empresaId,
        otp
      });

      if (data.token) {
        login(data.token, data.empresa.id, data.empresa.slug, data.empresa.nombre, email);
        navigate(`/${data.empresa.slug}`);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Código inválido.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center justify-center mb-8">
          <div className="p-3 bg-indigo-600 rounded-xl shadow-lg shadow-indigo-500/30 mb-4">
            <Wrench className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">{appI18n.t("ui.Registro.create_your_workshop")}</h1>
          <p className="text-slate-500 text-sm mt-1">{appI18n.t("ui.Registro.sign_up_for_free_and_start_managing_your")}</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-8 border border-slate-100">
          {error && (
            <div className="mb-6 bg-red-50 text-red-600 px-4 py-3 rounded-xl flex items-center gap-3 text-sm font-medium border border-red-100">
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          {step === 1 && (
             <form onSubmit={submitRegistro} className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
               <div>
                 <label className="block text-sm font-bold text-slate-700 mb-1.5">{appI18n.t("ui.Registro.workshop_name")}</label>
                 <div className="relative">
                   <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                     <Building2 className="text-slate-400" size={18} />
                   </div>
                   <input
                     type="text"
                     required
                     placeholder={appI18n.t("ui.Registro.e_g_express_motors")}
                     className="block w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 font-medium transition-shadow"
                     value={nombre}
                     onChange={e => setNombre(e.target.value)}
                     disabled={loading}
                   />
                 </div>
               </div>

               <div>
                 <label className="block text-sm font-bold text-slate-700 mb-1.5">{appI18n.t("ui.Registro.administrator_email")}</label>
                 <input
                   type="email"
                   required
                   placeholder="admin@taller.com"
                   className="block w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 font-medium transition-shadow"
                   value={email}
                   onChange={e => setEmail(e.target.value)}
                   disabled={loading}
                 />
               </div>

               <div className="flex justify-center">
                 <Turnstile
                   siteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY || ''}
                   onSuccess={(token) => setTurnstileToken(token)}
                   onError={() => setTurnstileToken(null)}
                   onExpire={() => setTurnstileToken(null)}
                 />
               </div>

               <div className="pt-2">
                 <button
                   type="submit"
                   disabled={loading || !turnstileToken}
                   className="w-full bg-slate-900 hover:bg-black text-white font-bold py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 transition disabled:opacity-50"
                 >
                   {loading ? <Loader2 className="animate-spin" size={20} /> : <ArrowRight size={20} />}
                   {appI18n.t("ui.Registro.create_my_free_account")}
                 </button>
               </div>
               <div className="text-center pt-2">
                 <button
                   type="button"
                   onClick={() => navigate('/login')}
                   className="text-sm text-slate-500 hover:text-indigo-600 font-medium transition-colors"
                 >
                   {appI18n.t("ui.Registro.already_have_a_workshop_account")} <span className="underline">{appI18n.t("ui.Registro.sign_in")}</span>
                 </button>
               </div>
             </form>
          )}

          {step === 2 && (
             <form onSubmit={submitOtp} className="space-y-5 animate-in fade-in slide-in-from-right-4">
               <div className="text-center mb-6">
                 <div className="inline-flex items-center justify-center w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full mb-3 shadow-sm">
                   <CheckCircle2 size={24} />
                 </div>
                 <h2 className="text-xl font-bold text-slate-800 tracking-tight">{appI18n.t("ui.Registro.workshop_created")}</h2>
                 <p className="text-sm text-slate-500 mt-2 px-2 leading-relaxed">
                   {appI18n.t("ui.Registro.enter_the_4_digit_code_we_sent_to")} <strong>{email}</strong> {appI18n.t("ui.Registro.to_open_the_dashboard_for")} <strong>{nombre}</strong>.
                 </p>
               </div>

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
                 {loading ? <Loader2 className="animate-spin" size={20} /> : appI18n.t('ui.Registro.verify_code')}
               </button>
             </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default Registro;
