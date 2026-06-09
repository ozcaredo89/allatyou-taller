import React, { useEffect, useState } from 'react';
import { Target, Search, Phone, Loader2, MessageCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import { generarLinkWhatsApp } from '../utils/whatsapp';

interface Prospecto {
  vehiculo_id: string;
  placa: string;
  marca: string;
  linea: string;
  cliente_id: string;
  cliente_nombre: string;
  cliente_telefono: string;
  categoria: string;
  ultima_fecha: string;
  ultimo_kilometraje: number;
  fecha_sugerida: string;
  kilometraje_sugerido: number;
}

const CRM: React.FC = () => {
  const { t } = useTranslation();
  const [prospectos, setProspectos] = useState<Prospecto[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    cargarProspectos();
  }, []);

  const cargarProspectos = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/crm/retencion');
      setProspectos(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleWhatsApp = (p: Prospecto) => {
    const isVencido = new Date(p.fecha_sugerida) < new Date();
    const saludo = `Hola ${p.cliente_nombre}, somos tu taller de confianza.`;
    const motivo = `Notamos que ya ${isVencido ? 'pasó' : 'se acerca'} la fecha recomendada para el mantenimiento de tu ${p.marca} ${p.linea} (Placa ${p.placa}), específicamente para: *${p.categoria.toUpperCase()}*.`;
    const desp = `¿Te gustaría agendar una cita para revisarlo?`;
    
    const msg = `${saludo} ${motivo} ${desp}`;
    window.open(generarLinkWhatsApp(p.cliente_telefono, msg), '_blank');
  };

  const filtrados = prospectos.filter(p => 
    p.placa?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.cliente_nombre?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
            <div className="p-2 bg-indigo-100 rounded-xl">
              <Target className="text-indigo-600 w-7 h-7" />
            </div>
            {t('crm.title', 'CRM de Retención')}
          </h1>
          <p className="text-slate-500 mt-1 ml-1">{t('crm.subtitle', 'Mantenimiento Predictivo y Prospectos')}</p>
        </div>
      </div>

      <div className="flex items-center bg-white rounded-xl shadow-sm border border-slate-200 p-2 max-w-md">
        <Search className="text-slate-400 ml-2" size={20} />
        <input 
          type="text" 
          placeholder={t('crm.search', 'Buscar por placa o cliente...')}
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="w-full px-3 py-1 outline-none text-sm"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin text-indigo-500 w-10 h-10" /></div>
      ) : filtrados.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center text-slate-500">
          <Target className="mx-auto text-slate-300 w-16 h-16 mb-4" />
          <p className="text-lg font-medium">{t('crm.no_data', 'No hay mantenimientos próximos sugeridos.')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtrados.map((p, idx) => {
            const isVencido = new Date(p.fecha_sugerida) < new Date();
            return (
              <div key={idx} className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-bold text-slate-800 text-lg">{p.cliente_nombre || 'Cliente'}</h3>
                    <p className="text-slate-500 text-sm flex items-center gap-1">
                      <Phone size={14} /> {p.cliente_telefono || 'Sin teléfono'}
                    </p>
                  </div>
                  <span className="bg-indigo-100 text-indigo-700 font-bold px-2.5 py-1 rounded-lg text-xs uppercase tracking-widest">
                    {p.categoria}
                  </span>
                </div>

                <div className="bg-slate-50 rounded-xl p-4 mb-5 border border-slate-100 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 text-xs uppercase tracking-wider font-semibold">{p.marca} {p.linea}</span>
                    <span className="font-black text-slate-800 tracking-widest">{p.placa}</span>
                  </div>
                  
                  <div className="h-px bg-slate-200 w-full my-2"></div>

                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500">{t('crm.sugerido_para', 'Sugerido para:')}</span>
                    <span className={`font-bold ${isVencido ? 'text-red-600' : 'text-amber-600'}`}>
                      {new Date(p.fecha_sugerida).toLocaleDateString()}
                    </span>
                  </div>
                  
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500">{t('crm.km_estimado', 'KM Estimado:')}</span>
                    <span className="font-semibold text-slate-700">~{p.kilometraje_sugerido?.toLocaleString() || '?'} km</span>
                  </div>
                </div>

                <button 
                  onClick={() => handleWhatsApp(p)}
                  disabled={!p.cliente_telefono}
                  className="w-full bg-[#25D366] hover:bg-[#20bd59] text-white font-bold py-2.5 rounded-xl shadow-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <MessageCircle size={18} /> {t('crm.btn_contactar', 'Contactar Cliente')}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default CRM;
