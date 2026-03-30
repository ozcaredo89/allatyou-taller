import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, XCircle, Receipt, Wrench } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

interface ItemFactura {
  id: string;
  tipo: 'repuesto' | 'mano_obra';
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  total: number;
}

const HistorialDetalle: React.FC = () => {
  const { id, slug } = useParams<{ id: string; slug: string }>();
  const navigate = useNavigate();
  const { empresaNombre } = useAuth();
  const [ingreso, setIngreso] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/ingresos/${id}`)
      .then(r => setIngreso(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="flex justify-center items-center h-64"><Loader2 className="animate-spin w-8 h-8 text-indigo-600" /></div>;
  if (!ingreso) return <div className="p-8 text-center text-red-500">Ingreso no encontrado.</div>;

  const vehiculo = ingreso.taller_vehiculos;
  const cliente = vehiculo?.taller_clientes;
  const items: ItemFactura[] = ingreso.items_factura || [];
  const diagnostico = ingreso.diagnostico_mecanico || {};
  const total = items.reduce((acc: number, i: ItemFactura) => acc + (i.total || 0), 0);
  const isCancelado = ingreso.estado === 'cancelado';

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      <div className="flex items-center gap-4 print:hidden">
        <button onClick={() => navigate(`/${slug}/historial`)} className="p-2 bg-white border border-slate-200 rounded-full shadow-sm hover:bg-slate-100 transition">
          <ArrowLeft size={20} className="text-slate-700" />
        </button>
        <h1 className="text-2xl font-bold text-slate-900">Detalle del Servicio</h1>
        <span className={`text-xs font-bold px-3 py-1 rounded-full border ${isCancelado ? 'bg-red-50 text-red-700 border-red-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
          {isCancelado ? '✗ Cancelado' : '✓ Entregado'}
        </span>
      </div>

      {isCancelado && ingreso.motivo_cancelacion && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-3">
          <XCircle size={18} className="text-red-500 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold text-red-700 text-sm">Motivo de Cancelación</p>
            <p className="text-red-600 text-sm">{ingreso.motivo_cancelacion}</p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 grid grid-cols-2 gap-6">
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Cliente</p>
          <p className="font-bold text-slate-800 text-lg">{cliente?.nombre_completo}</p>
          <p className="text-slate-500 text-sm">Doc: {cliente?.documento}</p>
          <p className="text-slate-500 text-sm">Tel: {cliente?.telefono}</p>
        </div>
        <div className="text-right">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Vehículo</p>
          <p className="font-bold text-slate-800 text-2xl tracking-widest">{vehiculo?.placa}</p>
          <p className="text-slate-500 text-sm">{vehiculo?.marca} {vehiculo?.linea}</p>
          {ingreso.tecnico_asignado && <p className="text-slate-500 text-sm mt-1">Técnico: <strong>{ingreso.tecnico_asignado}</strong></p>}
        </div>
      </div>

      {/* Diagnóstico Read-Only */}
      {Object.keys(diagnostico).length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <h3 className="font-bold text-slate-700 flex items-center gap-2 mb-4"><Wrench size={16} /> Diagnóstico Registrado</h3>
          <div className="space-y-3">
            {Object.entries(diagnostico).map(([key, val]: any) => {
              if (!val || (val.estado === 'buen_estado' && !val.notas && (!val.fallas_comunes || val.fallas_comunes.length === 0))) return null;
              return (
                <div key={key} className="flex gap-3 text-sm border-b border-slate-100 pb-2 last:border-0">
                  <span className="font-semibold text-slate-700 capitalize w-32 shrink-0">{key.replace(/_/g, ' ')}</span>
                  <div>
                    <span className={`text-xs font-bold uppercase ${val.estado === 'danado' ? 'text-red-600' : val.estado === 'revisar' ? 'text-amber-600' : 'text-emerald-600'}`}>{val.estado?.replace('_', ' ')}</span>
                    {val.fallas_comunes?.length > 0 && <p className="text-slate-500 text-xs mt-0.5">{val.fallas_comunes.join(' · ')}</p>}
                    {val.notas && <p className="text-slate-600 mt-0.5 italic">"{val.notas}"</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Items Factura Read-Only */}
      {items.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <h3 className="font-bold text-slate-700 flex items-center gap-2 mb-4"><Receipt size={16} /> Servicios Facturados</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs font-bold text-slate-400 uppercase border-b border-slate-200">
                <th className="pb-2 text-left">Descripción</th>
                <th className="pb-2 text-center">Tipo</th>
                <th className="pb-2 text-right">Cant.</th>
                <th className="pb-2 text-right">P. Unit.</th>
                <th className="pb-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="py-2 text-slate-800 font-medium">{item.descripcion}</td>
                  <td className="py-2 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${item.tipo === 'repuesto' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>
                      {item.tipo === 'repuesto' ? 'Repuesto' : 'Mano de Obra'}
                    </span>
                  </td>
                  <td className="py-2 text-right text-slate-600">{item.cantidad}</td>
                  <td className="py-2 text-right text-slate-600">${item.precio_unitario.toLocaleString('es-CO')}</td>
                  <td className="py-2 text-right font-bold text-slate-800">${item.total.toLocaleString('es-CO')}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-800">
                <td colSpan={4} className="pt-3 text-right font-bold text-slate-800">TOTAL</td>
                <td className="pt-3 text-right font-black text-indigo-700 text-lg">${total.toLocaleString('es-CO')}</td>
              </tr>
            </tfoot>
          </table>
          {ingreso.notas_factura && (
            <p className="mt-4 text-sm text-slate-500 italic border-t border-slate-100 pt-3">Notas: {ingreso.notas_factura}</p>
          )}
        </div>
      )}

      <div className="text-center text-slate-400 text-sm">
        <p>Gracias por confiar en {empresaNombre || 'TallerPro'}.</p>
      </div>
    </div>
  );
};

export default HistorialDetalle;
