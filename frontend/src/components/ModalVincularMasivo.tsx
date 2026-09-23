import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  X, Loader2, Car, Search, AlertTriangle, Check
} from 'lucide-react';
import api from '../services/api';

interface GastoParaVincular {
  id: string;
  descripcion: string;
  monto: number;
  ingreso_id?: string | null;
  taller_ingresos?: {
    id: string;
    taller_vehiculos?: {
      placa: string;
    };
  } | null;
}

interface ModalVincularMasivoProps {
  open: boolean;
  onClose: () => void;
  gastosSeleccionados: GastoParaVincular[];
  onSuccess: () => Promise<void>;
  formatearDinero: (val: number) => string;
}

export const ModalVincularMasivo: React.FC<ModalVincularMasivoProps> = ({
  open,
  onClose,
  gastosSeleccionados,
  onSuccess,
  formatearDinero,
}) => {
  const { t } = useTranslation();
  const [searchPlaca, setSearchPlaca] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [sugerencias, setSugerencias] = useState<any[]>([]);
  const [ordenSeleccionada, setOrdenSeleccionada] = useState<any | null>(null);
  const [itemsPorGasto, setItemsPorGasto] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const debounceRef = useRef<any>(null);
  const lastQueryRef = useRef<string>('');

  useEffect(() => {
    if (open) {
      setSearchPlaca('');
      setBuscando(false);
      setSugerencias([]);
      setOrdenSeleccionada(null);
      setItemsPorGasto({});
      setError('');
      lastQueryRef.current = '';
    }
  }, [open]);

  if (!open) return null;

  const handleSearchChange = (val: string) => {
    const formatted = val.toUpperCase();
    setSearchPlaca(formatted);
    const clean = formatted.replace(/[^A-Z0-9]/g, '');
    lastQueryRef.current = clean;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (clean.length < 2) {
      setSugerencias([]);
      setBuscando(false);
      return;
    }
    setBuscando(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await api.get(`/ingresos/buscar?q=${encodeURIComponent(clean)}`);
        if (lastQueryRef.current === clean) {
          setSugerencias(res.data || []);
        }
      } catch {
        if (lastQueryRef.current === clean) {
          setSugerencias([]);
        }
      } finally {
        if (lastQueryRef.current === clean) {
          setBuscando(false);
        }
      }
    }, 300);
  };

  const handleSeleccionarOrden = (ord: any) => {
    setOrdenSeleccionada(ord);
    setSearchPlaca('');
    setSugerencias([]);
    setBuscando(false);
    // Inicializar asignación de ítems si la orden tiene repuestos cotizados
    const inicial: Record<string, string> = {};
    gastosSeleccionados.forEach(g => {
      inicial[g.id] = '';
    });
    setItemsPorGasto(inicial);
  };

  const handleGuardar = async () => {
    if (!ordenSeleccionada) {
      setError('Debes buscar y seleccionar una orden de servicio.');
      return;
    }

    try {
      setGuardando(true);
      setError('');

      const vinculos = gastosSeleccionados.map(g => ({
        gasto_id: g.id,
        ingreso_id: ordenSeleccionada.id,
        item_id: itemsPorGasto[g.id] || undefined,
      }));

      await api.patch('/gastos/batch-vinculo', { vinculos });
      await onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Error al vincular los gastos.');
    } finally {
      setGuardando(false);
    }
  };

  const btnTexto = gastosSeleccionados.length === 1
    ? t('gastos.btn_vincular_masivo', { count: 1 })
    : t('gastos.btn_vincular_masivo_plural', { count: gastosSeleccionados.length });

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-slate-900 text-lg flex items-center gap-2">
              <Car className="text-indigo-600" size={20} />
              {t('gastos.masivo_asociar_vehiculo')}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {t('gastos.masivo_seleccionados', { count: gastosSeleccionados.length })}
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl p-3 flex items-center gap-2">
              <AlertTriangle size={15} /> {error}
            </div>
          )}

          {/* Buscador de placa */}
          {!ordenSeleccionada ? (
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700">
                {t('gastos.vincular_orden')} *
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={searchPlaca}
                  onChange={e => handleSearchChange(e.target.value)}
                  placeholder={t('gastos.buscar_placa_placeholder')}
                  className="w-full border border-slate-200 rounded-xl pl-9 pr-9 py-2.5 text-sm uppercase font-semibold focus:ring-2 focus:ring-indigo-500 outline-none"
                  autoFocus
                />
                <Search size={16} className="absolute left-3 top-3 text-slate-400" />
                {buscando && <Loader2 size={16} className="animate-spin absolute right-3 top-3 text-indigo-500" />}
              </div>

              {sugerencias.length > 0 && (
                <div className="border border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto divide-y divide-slate-100 bg-white">
                  {sugerencias.map(ord => (
                    <div
                      key={ord.id}
                      onClick={() => handleSeleccionarOrden(ord)}
                      className="p-3 hover:bg-indigo-50/50 cursor-pointer flex items-center justify-between text-xs transition"
                    >
                      <div className="flex items-center gap-2">
                        <span className="bg-amber-100 text-amber-900 border border-amber-300 font-black px-2 py-0.5 rounded text-xs tracking-wider">
                          {ord.vehiculo?.placa}
                        </span>
                        <span className="font-semibold text-slate-800">
                          {ord.vehiculo?.marca} {ord.vehiculo?.linea}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-400 capitalize">
                        {ord.estado?.replace('_', ' ')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-3 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="bg-amber-100 text-amber-900 border border-amber-300 font-black px-2 py-1 rounded text-xs tracking-wider">
                  {ordenSeleccionada.vehiculo?.placa}
                </span>
                <div>
                  <p className="font-bold text-slate-800 text-xs">
                    {ordenSeleccionada.vehiculo?.marca} {ordenSeleccionada.vehiculo?.linea}
                  </p>
                  <p className="text-[10px] text-slate-500 capitalize">
                    {ordenSeleccionada.estado?.replace('_', ' ')} · Ingreso: {ordenSeleccionada.fecha_ingreso?.split('T')[0]}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOrdenSeleccionada(null)}
                className="text-xs text-red-500 hover:text-red-700 font-semibold"
              >
                {t('gastos.cambiar_orden')}
              </button>
            </div>
          )}

          {/* Lista de gastos a vincular */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-700">
              {t('gastos.gastos_seleccionados_label', { count: gastosSeleccionados.length })}
            </label>
            <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-60 overflow-y-auto bg-slate-50/30">
              {gastosSeleccionados.map(g => {
                const yaVinculadoPlaca = g.taller_ingresos?.taller_vehiculos?.placa;
                return (
                  <div key={g.id} className="p-3 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-800">{g.descripcion}</span>
                      <span className="font-bold text-red-600">{formatearDinero(g.monto)}</span>
                    </div>

                    {/* Advertencia si ya estaba vinculado a otra orden */}
                    {yaVinculadoPlaca && (
                      <div className="flex items-center gap-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">
                        <AlertTriangle size={12} className="shrink-0" />
                        <span>{t('gastos.masivo_advertencia_reasignar', { placa: yaVinculadoPlaca })}</span>
                      </div>
                    )}

                    {/* Selector de repuesto si hay orden seleccionada y tiene ítems */}
                    {ordenSeleccionada?.items_repuesto && ordenSeleccionada.items_repuesto.length > 0 && (
                      <div className="pt-1">
                        <select
                          value={itemsPorGasto[g.id] || ''}
                          onChange={e => setItemsPorGasto(prev => ({ ...prev, [g.id]: e.target.value }))}
                          className="w-full border border-slate-200 rounded-lg px-2 py-1 text-xs focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                        >
                          <option value="">-- {t('gastos.solo_orden')} --</option>
                          {ordenSeleccionada.items_repuesto.map((item: any) => (
                            <option key={item.id} value={item.id}>
                              {item.descripcion} (Venta: {formatearDinero(item.total)})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 border border-slate-200 text-slate-600 py-2.5 rounded-xl font-semibold text-sm hover:bg-white transition"
          >
            {t('gastos.btn_cancelar')}
          </button>
          <button
            type="button"
            onClick={handleGuardar}
            disabled={guardando || !ordenSeleccionada}
            className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-xl font-bold text-sm transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {guardando ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            {btnTexto}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ModalVincularMasivo;