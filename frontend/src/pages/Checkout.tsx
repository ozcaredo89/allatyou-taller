import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Printer, CheckSquare, Loader2, ArrowLeft } from 'lucide-react';
import api from '../services/api';

const Checkout: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const [ingreso, setIngreso] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Estados locales para items facturados si queremos agregar (MVP simple)
  const [total, setTotal] = useState(0);

  useEffect(() => {
    cargarIngreso();
  }, [id]);

  const cargarIngreso = async () => {
    try {
      const { data } = await api.get(`/ingresos/${id}`);
      setIngreso(data);
    } catch (err: any) {
      setError('No se pudo cargar la información del ingreso.');
    } finally {
      setLoading(false);
    }
  };

  const handleEntregar = async () => {
    try {
      setSaving(true);
      await api.put(`/ingresos/${id}`, {
        estado: 'entregado'
      });
      navigate('/');
    } catch (err: any) {
      setError('Error al entregar el vehículo.');
    } finally {
      setSaving(false);
    }
  };

  const handleImprimir = () => {
    window.print();
  };

  if (loading) return <div className="p-8 flex items-center justify-center"><Loader2 className="animate-spin text-blue-500 w-8 h-8" /></div>;
  if (!ingreso) return <div className="p-8 text-center text-red-500">Ingreso no encontrado.</div>;

  const vehiculo = ingreso.taller_vehiculos;
  const cliente = vehiculo?.taller_clientes;
  const diagnostico = ingreso.diagnostico_mecanico || {};

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      {/* Botones Header - Non-printable */}
      <div className="flex justify-between items-center print:hidden">
        <button onClick={() => navigate('/')} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200 transition-colors">
          <ArrowLeft size={20} className="text-slate-700" />
        </button>
        <div className="flex gap-3">
          <button 
            onClick={handleImprimir}
            className="bg-white border text-slate-700 px-6 py-2 rounded-lg font-medium shadow-sm hover:bg-slate-50 transition flex items-center gap-2"
          >
            <Printer size={18} /> Imprimir Factura
          </button>
          <button 
            onClick={handleEntregar}
            disabled={saving || ingreso.estado === 'entregado'}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2 rounded-lg font-bold transition shadow-md disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? <Loader2 className="animate-spin" size={18} /> : <CheckSquare size={18} />}
            Completar y Entregar Vehículo
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-lg flex items-center gap-3 border border-red-200 print:hidden">
          <span>{error}</span>
        </div>
      )}

      {/* FACTURA PRINT UI */}
      <div className="bg-white p-8 md:p-12 border border-slate-200 rounded-lg shadow-sm print:shadow-none print:border-none print:p-0">
        
        {/* Header Factura */}
        <div className="flex justify-between items-start border-b-2 border-slate-800 pb-6 mb-8">
          <div>
            <h1 className="text-4xl font-black text-slate-900 tracking-tighter uppercase">Factura</h1>
            <p className="text-slate-500 font-medium">Orden de Servicio #{ingreso.id}</p>
          </div>
          <div className="text-right">
            <h2 className="text-xl font-bold text-slate-800">Taller Mecánico MVP</h2>
            <p className="text-slate-500 text-sm">NIT: 900.000.000-1</p>
            <p className="text-slate-500 text-sm">Calle Falsa 123, Ciudad</p>
            <p className="text-slate-500 text-sm">Tel: +57 300 000 0000</p>
          </div>
        </div>

        {/* Info Ciente y Entorno */}
        <div className="grid grid-cols-2 gap-8 mb-10">
          <div>
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-3">Facturado a</h3>
            <p className="font-bold text-slate-800 text-lg">{cliente?.nombre_completo}</p>
            <p className="text-slate-600">Doc: {cliente?.documento}</p>
            <p className="text-slate-600">Tel: {cliente?.telefono}</p>
            <p className="text-slate-600">{cliente?.email}</p>
          </div>
          <div className="text-right">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-3">Detalles del Vehículo</h3>
            <p className="font-bold text-slate-800 text-2xl tracking-widest">{vehiculo?.placa}</p>
            <p className="text-slate-600">{vehiculo?.marca} {vehiculo?.linea} {vehiculo?.modelo_anio ? `(${vehiculo.modelo_anio})` : ''}</p>
            <p className="text-slate-600">Color: {vehiculo?.color || 'N/A'}</p>
            <p className="text-slate-600">Kilometraje: {ingreso.kilometraje} km</p>
          </div>
        </div>

        {/* Trabajos Realizados */}
        <div className="mb-10">
           <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4">Servicios y Diagnóstico Realizado</h3>
           
           <div className="bg-slate-50 border border-slate-200 rounded-lg p-6 space-y-4">
             {Object.entries(diagnostico).map(([key, val]: any) => {
               if (!val) return null;
               
               // Soporte para formato antiguo (string) y nuevo (objeto)
               const isObject = typeof val === 'object' && val !== null;
               const estado = isObject ? val.estado : null;
               const notas = isObject ? val.notas : val;
               const fallas = isObject && Array.isArray(val.fallas_comunes) ? val.fallas_comunes : [];
               
               if (!estado && !notas && fallas.length === 0) return null;

               const labelEstado = estado === 'buen_estado' ? 'Buen Estado' : estado === 'revisar' ? 'Requiere Revisión' : estado === 'danado' ? 'Dañado' : '';
               const colorEstado = estado === 'buen_estado' ? 'text-emerald-600' : estado === 'revisar' ? 'text-amber-600' : estado === 'danado' ? 'text-red-600' : 'text-slate-600';

               return (
                 <div key={key} className="pb-3 mb-3 border-b border-slate-100 last:border-0 last:mb-0 last:pb-0">
                   <div className="flex justify-between items-center mb-1">
                     <strong className="capitalize text-slate-800 text-lg">{key.replace('_', ' ')}</strong>
                     {labelEstado && <span className={`font-bold ${colorEstado} uppercase text-xs tracking-wider`}>{labelEstado}</span>}
                   </div>
                   
                   {fallas.length > 0 && (
                     <div className="flex flex-wrap gap-1 mt-2">
                       {fallas.map((f: string, i: number) => (
                         <span key={i} className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-xs border border-slate-200">{f}</span>
                       ))}
                     </div>
                   )}
                   
                   {notas && (typeof notas === 'string') && (
                     <p className="text-slate-600 mt-2 pl-4 border-l-2 border-indigo-200 indent-0 text-sm">{notas}</p>
                   )}
                 </div>
               )
             })}
             {Object.keys(diagnostico).length === 0 && (
               <p className="text-slate-500 italic">No se registraron notas de diagnóstico en el sistema.</p>
             )}
           </div>
        </div>

        {/* Totales MVP (Simple Input) */}
        <div className="flex justify-end border-t-2 border-slate-100 pt-6">
          <div className="w-1/2 md:w-1/3">
            <div className="flex justify-between items-center mb-2">
              <span className="text-slate-500 font-medium">Subtotal</span>
              <span className="text-slate-800">$ 0.00</span>
            </div>
            <div className="flex justify-between items-center mb-4">
              <span className="text-slate-500 font-medium">I.V.A (19%)</span>
              <span className="text-slate-800">$ 0.00</span>
            </div>
            <div className="flex justify-between items-center border-t border-slate-200 pt-4">
              <span className="text-xl font-bold text-slate-800">Total</span>
              <div className="print:hidden">
                <input 
                  type="number" 
                  value={total}
                  onChange={e => setTotal(Number(e.target.value))}
                  className="w-32 text-right bg-slate-50 border border-slate-300 rounded px-2 py-1 font-bold text-xl" 
                  placeholder="0.00"
                />
              </div>
              <span className="text-xl font-bold text-indigo-700 hidden print:block">
                ${total.toLocaleString('es-CO')}
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-16 text-center text-slate-400 text-sm">
          <p>Esta factura de venta se asimila en todos sus efectos a una letra de cambio.</p>
          <p>Gracias por confiar en Taller Mecánico MVP.</p>
        </div>

      </div>
    </div>
  );
};

export default Checkout;
