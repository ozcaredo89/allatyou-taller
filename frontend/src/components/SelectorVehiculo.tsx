import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Search } from 'lucide-react';
import api from '../services/api';

interface SelectorVehiculoProps {
  /** Orden seleccionada (resultado de /ingresos/buscar) o null si no hay ninguna. */
  value: any | null;
  onChange: (orden: any | null) => void;
}

const estadoClase = (estado: string) =>
  estado === 'en_reparacion'
    ? 'bg-blue-50 text-blue-700 border border-blue-200'
    : estado === 'entregado'
      ? 'bg-slate-100 text-slate-600'
      : 'bg-amber-50 text-amber-700 border border-amber-200';

/**
 * Busca un vehículo por placa y devuelve su orden de servicio.
 * Un solo componente para todos los formularios de gastos: antes la búsqueda
 * estaba copiada en cada uno.
 */
export const SelectorVehiculo: React.FC<SelectorVehiculoProps> = ({ value, onChange }) => {
  const { t } = useTranslation();
  const [texto, setTexto] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [sugerencias, setSugerencias] = useState<any[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ultimaConsulta = useRef('');
  const contenedorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const cerrarAlClicFuera = (e: MouseEvent) => {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target as Node)) {
        setSugerencias([]);
      }
    };
    document.addEventListener('mousedown', cerrarAlClicFuera);
    return () => {
      document.removeEventListener('mousedown', cerrarAlClicFuera);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleChange = (val: string) => {
    const formateado = val.toUpperCase();
    setTexto(formateado);
    const limpio = formateado.replace(/[^A-Z0-9]/g, '');
    ultimaConsulta.current = limpio;
    if (timerRef.current) clearTimeout(timerRef.current);

    if (limpio.length < 2) {
      setSugerencias([]);
      setBuscando(false);
      return;
    }

    setBuscando(true);
    timerRef.current = setTimeout(async () => {
      try {
        const res = await api.get(`/ingresos/buscar?q=${encodeURIComponent(limpio)}`);
        // Descartar respuestas de una búsqueda que ya no es la última
        if (ultimaConsulta.current === limpio) setSugerencias(res.data || []);
      } catch {
        if (ultimaConsulta.current === limpio) setSugerencias([]);
      } finally {
        if (ultimaConsulta.current === limpio) setBuscando(false);
      }
    }, 300);
  };

  const seleccionar = (orden: any) => {
    setTexto('');
    setSugerencias([]);
    ultimaConsulta.current = '';
    onChange(orden);
  };

  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 bg-white border border-indigo-100 rounded-lg px-3 py-2 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <span className="bg-amber-100 text-amber-900 border border-amber-300 font-black px-1.5 py-0.5 rounded tracking-wider shrink-0">
            {value.vehiculo?.placa}
          </span>
          <span className="font-semibold text-slate-700 truncate">
            {value.vehiculo?.marca} {value.vehiculo?.linea}
          </span>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize shrink-0 ${estadoClase(value.estado)}`}>
            {String(value.estado || '').replace(/_/g, ' ')}
          </span>
        </div>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="text-red-500 hover:text-red-700 font-semibold shrink-0"
        >
          {t('gastos.quitar_vinculo')}
        </button>
      </div>
    );
  }

  return (
    <div ref={contenedorRef} className="relative">
      <div className="relative">
        <input
          type="text"
          value={texto}
          onChange={e => handleChange(e.target.value)}
          placeholder={t('gastos.buscar_placa_placeholder')}
          className="w-full border border-slate-200 rounded-lg pl-8 pr-8 py-2 text-sm uppercase font-medium focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
        />
        <Search size={14} className="absolute left-2.5 top-3 text-slate-400" />
        {buscando && <Loader2 size={14} className="animate-spin absolute right-2.5 top-3 text-indigo-500" />}
      </div>

      {sugerencias.length > 0 && (
        <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-52 overflow-y-auto divide-y divide-slate-100">
          {sugerencias.map(ord => (
            <div
              key={ord.id}
              onClick={() => seleccionar(ord)}
              className="p-2.5 hover:bg-indigo-50/40 cursor-pointer transition flex items-center justify-between gap-2"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="bg-amber-100 text-amber-900 border border-amber-300 text-xs font-black px-1.5 py-0.5 rounded tracking-wider shrink-0">
                  {ord.vehiculo?.placa}
                </span>
                <span className="text-xs font-semibold text-slate-700 truncate">
                  {ord.vehiculo?.marca} {ord.vehiculo?.linea}
                </span>
              </div>
              <div className="text-right shrink-0">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize ${estadoClase(ord.estado)}`}>
                  {String(ord.estado || '').replace(/_/g, ' ')}
                </span>
                <p className="text-[10px] text-slate-400 mt-0.5">{ord.fecha_ingreso?.split('T')[0]}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SelectorVehiculo;
