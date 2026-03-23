import React, { useEffect, useState } from 'react';
import { Car, CalendarDays, Key, FileText, CheckCircle2, ChevronRight } from 'lucide-react';
import api from '../services/api';

interface Cliente {
  id: string;
  nombre_completo: string;
  telefono: string;
}

interface Vehiculo {
  id: string;
  placa: string;
  marca: string;
  linea: string;
  taller_clientes: Cliente;
}

interface Ingreso {
  id: string;
  fecha_ingreso: string;
  estado: string;
  motivo_visita: string;
  taller_vehiculos: Vehiculo;
}

const estadoColors: Record<string, string> = {
  recepcion: 'bg-blue-100 text-blue-800 border-blue-200',
  diagnostico: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  en_reparacion: 'bg-purple-100 text-purple-800 border-purple-200',
  cotizacion: 'bg-orange-100 text-orange-800 border-orange-200',
};

const estadoLabels: Record<string, string> = {
  recepcion: 'Recepción',
  diagnostico: 'Diagnóstico',
  en_reparacion: 'En Reparación',
  cotizacion: 'Cotización',
};

const Dashboard: React.FC = () => {
  const [ingresos, setIngresos] = useState<Ingreso[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchIngresos();
  }, []);

  const fetchIngresos = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/ingresos/activos');
      setIngresos(data || []);
    } catch (error) {
      console.error('Error fetching ingresos:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Vehículos en Taller</h1>
          <p className="text-slate-500 mt-1">Monitorea el estado de los vehículos ingresados actualmente.</p>
        </div>
      </div>

      {ingresos.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center flex flex-col items-center">
          <div className="bg-slate-50 p-4 rounded-full mb-4">
            <CheckCircle2 size={48} className="text-slate-300" />
          </div>
          <h3 className="text-xl font-medium text-slate-900">No hay vehículos en el taller</h3>
          <p className="text-slate-500 mt-2 max-w-md">No tienes vehículos registrados en los estados de recepción, diagnóstico o reparación.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {ingresos.map((ingreso) => (
            <div key={ingreso.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-shadow duration-300 group">
              <div className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    <div className="bg-slate-100 p-3 rounded-xl text-slate-700">
                      <Car size={24} />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-slate-900 leading-tight">
                        {ingreso.taller_vehiculos?.placa}
                      </h3>
                      <p className="text-sm text-slate-500">
                        {ingreso.taller_vehiculos?.marca} {ingreso.taller_vehiculos?.linea}
                      </p>
                    </div>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${estadoColors[ingreso.estado] || 'bg-slate-100 text-slate-800 border-slate-200'}`}>
                    {estadoLabels[ingreso.estado] || ingreso.estado}
                  </span>
                </div>

                <div className="space-y-3 mt-6">
                  <div className="flex items-center gap-3 text-slate-600 text-sm">
                    <FileText size={16} className="text-slate-400" />
                    <span className="truncate" title={ingreso.motivo_visita}>
                      <span className="font-medium text-slate-900 mr-1">Motivo:</span> 
                      {ingreso.motivo_visita}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-3 text-slate-600 text-sm">
                    <Key size={16} className="text-slate-400" />
                    <span>
                      <span className="font-medium text-slate-900 mr-1">Cliente:</span>
                      {ingreso.taller_vehiculos?.taller_clientes?.nombre_completo}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-slate-600 text-sm">
                    <CalendarDays size={16} className="text-slate-400" />
                    <span>
                      <span className="font-medium text-slate-900 mr-1">Ingreso:</span>
                      {new Date(ingreso.fecha_ingreso).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="bg-slate-50 px-6 py-4 border-t border-slate-100 flex justify-between items-center group-hover:bg-indigo-50 transition-colors duration-300 cursor-pointer">
                <span className="text-sm font-medium text-slate-600 group-hover:text-indigo-700">Ver detalles</span>
                <ChevronRight size={18} className="text-slate-400 group-hover:text-indigo-600 transition-transform duration-300 group-hover:translate-x-1" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Dashboard;
