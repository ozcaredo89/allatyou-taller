import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { Loader2, ArrowLeft, AlertCircle, Wrench, Building2, CheckCircle2 } from 'lucide-react';

interface EmpresaItem {
  id: string;
  nombre: string;
  slug: string;
}

const Login: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [empresas, setEmpresas] = useState<EmpresaItem[]>([]);
  const [selectedEmpresa, setSelectedEmpresa] = useState<EmpresaItem | null>(null);
  const [otp, setOtp] = useState('');

  // 1. Cargar las empresas al montar
  useEffect(() => {
    fetchEmpresas();
  }, []);

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

  const handleSelectEmpresa = async (empresa: EmpresaItem) => {
    setLoading(true);
    setError('');
    try {
      // Solicita el OTP que se enviará en bloque
      const { data } = await api.post('/auth/request-otp', { empresa_id: empresa.id });
      if (data.success) {
        setSelectedEmpresa(empresa);
        setStep(2);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error solicitando acceso.');
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
        // En este Kiosco, no guardamos el correo que ingresó, sino uno genérico que devuelve la DB para la sesión
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
    setStep(1);
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

          {step === 2 && selectedEmpresa && (
             <form onSubmit={submitOtp} className="space-y-5 animate-in fade-in slide-in-from-bottom-2">
               
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
                 <p className="text-sm text-slate-500 mt-2 px-4 leading-relaxed">Verifica el correo administrativo del taller e introduce el código de 4 dígitos</p>
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
                 {loading ? <Loader2 className="animate-spin" size={20} /> : 'Autorizar Ingreso'}
               </button>
             </form>
          )}
        </div>
        
      </div>
    </div>
  );
};

export default Login;
