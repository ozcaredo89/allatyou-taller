import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { History, Car, CalendarDays, CheckCircle2, XCircle, Loader2, ArrowLeft, ChevronRight, Receipt } from 'lucide-react';
import api from '../services/api';

interface HistorialIngreso {
  id: string;
  fecha_ingreso: string;
  updated_at: string;
  estado: string;
  motivo_visita: string;
  motivo_cancelacion?: string;
  items_factura?: ItemFactura[];
  taller_vehiculos: {
    placa: string;
    marca: string;
    linea: string;
    taller_clientes: { nombre_completo: string; };
  };
}

interface ItemFactura {
  id: string;
  tipo: 'repuesto' | 'mano_obra';
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  total: number;
}

const calcTotal = (items: ItemFactura[] = []) =>
  items.reduce((acc, i) => acc + (i.total || 0), 0);

const Historial: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [registros, setRegistros] = useState<HistorialIngreso[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/ingresos/historial')
      .then(r => setRegistros(r.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex justify-center items-center h-64">
      <Loader2 className="animate-spin text-indigo-600 w-8 h-8" />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate(`/${slug}`)} className="p-2 bg-white border border-slate-200 rounded-full shadow-sm hover:bg-slate-100 transition">
          <ArrowLeft size={20} className="text-slate-700" />
        </button>
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
            <History size={28} className="text-indigo-600" /> Historial de Servicios
          </h1>
          <p className="text-slate-500 mt-1">Servicios finalizados y cancelados.</p>
        </div>
      </div>

      {registros.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center flex flex-col items-center">
          <History size={48} className="text-slate-300 mb-4" />
          <h3 className="text-xl font-medium text-slate-900">No hay registros</h3>
          <p className="text-slate-500 mt-2">Los vehículos entregados o cancelados aparecerán aquí.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="divide-y divide-slate-100">
            {registros.map((reg) => {
              const total = calcTotal(reg.items_factura);
              const isCancelado = reg.estado === 'cancelado';
              return (
                <Link
                  key={reg.id}
                  to={`/${slug}/historial/${reg.id}`}
                  className="flex items-center gap-4 p-5 hover:bg-slate-50 transition group"
                >
                  <div className={`p-2.5 rounded-xl ${isCancelado ? 'bg-red-100' : 'bg-emerald-100'}`}>
                    {isCancelado ? (
                      <XCircle size={22} className="text-red-600" />
                    ) : (
                      <CheckCircle2 size={22} className="text-emerald-600" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-slate-800 text-lg">{reg.taller_vehiculos?.placa}</span>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${isCancelado ? 'bg-red-50 text-red-700 border-red-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                        {isCancelado ? 'Cancelado' : 'Entregado'}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-slate-500">
                      <span className="flex items-center gap-1">
                        <Car size={13} /> {reg.taller_vehiculos?.marca} {reg.taller_vehiculos?.linea}
                      </span>
                      <span className="hidden sm:flex items-center gap-1">
                        {reg.taller_vehiculos?.taller_clientes?.nombre_completo}
                      </span>
                      <span className="flex items-center gap-1">
                        <CalendarDays size={13} /> {new Date(reg.updated_at || reg.fecha_ingreso).toLocaleDateString('es-CO')}
                      </span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    {total > 0 && (
                      <span className="font-bold text-slate-800 flex items-center gap-1 justify-end text-sm">
                        <Receipt size={14} /> ${total.toLocaleString('es-CO')}
                      </span>
                    )}
                    <ChevronRight size={18} className="text-slate-400 mt-1 ml-auto group-hover:text-indigo-500 transition" />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default Historial;
