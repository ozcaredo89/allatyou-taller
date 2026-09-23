import React, { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Trash2, Loader2, Car, Search,
  PlusCircle, ChevronDown, ChevronRight, AlertTriangle
} from 'lucide-react';
import api from '../services/api';

export interface BatchFila {
  id: string;
  descripcion: string;
  monto: string;
  montoEditadoManual: boolean;
  cantidad: string;
  valor_unitario: string;
  ingreso_id: string;
  item_id: string;
  searchPlaca: string;
  buscando: boolean;
  sugerencias: any[];
  ordenSeleccionada: any | null;
  mostrarVehiculo: boolean;
}

export const crearNuevaFila = (): BatchFila => ({
  id: crypto.randomUUID(),
  descripcion: '',
  monto: '',
  montoEditadoManual: false,
  cantidad: '',
  valor_unitario: '',
  ingreso_id: '',
  item_id: '',
  searchPlaca: '',
  buscando: false,
  sugerencias: [],
  ordenSeleccionada: null,
  mostrarVehiculo: false,
});

interface EditorLineasGastoProps {
  filas: BatchFila[];
  onChangeFilas: React.Dispatch<React.SetStateAction<BatchFila[]>>;
  totalFactura?: string;
  formatearDinero: (val: number) => string;
  formatearMonto: (val: string) => string;
}

export const EditorLineasGasto: React.FC<EditorLineasGastoProps> = ({
  filas,
  onChangeFilas,
  totalFactura = '',
  formatearDinero,
  formatearMonto,
}) => {
  const { t } = useTranslation();
  const debouncesBatch = useRef<Record<string, any>>({});
  const lastQueryPerFila = useRef<Record<string, string>>({});

  const updateFilaById = (id: string, patch: Partial<BatchFila> | ((prevFila: BatchFila) => Partial<BatchFila>)) => {
    onChangeFilas(prev =>
      prev.map(f => {
        if (f.id !== id) return f;
        const resolvedPatch = typeof patch === 'function' ? patch(f) : patch;
        return { ...f, ...resolvedPatch };
      })
    );
  };

  const handlePlacaChange = (id: string, val: string) => {
    const formatted = val.toUpperCase();
    const clean = formatted.replace(/[^A-Z0-9]/g, '');
    lastQueryPerFila.current[id] = clean;

    if (debouncesBatch.current[id]) {
      clearTimeout(debouncesBatch.current[id]);
    }

    if (clean.length < 2) {
      updateFilaById(id, { searchPlaca: formatted, sugerencias: [], buscando: false });
      return;
    }

    // Actualización atómica de texto y estado de carga
    updateFilaById(id, { searchPlaca: formatted, buscando: true, sugerencias: [] });

    debouncesBatch.current[id] = setTimeout(async () => {
      try {
        const res = await api.get(`/ingresos/buscar?q=${encodeURIComponent(clean)}`);
        // Descartar respuestas desfasadas
        if (lastQueryPerFila.current[id] === clean) {
          updateFilaById(id, { sugerencias: res.data || [], buscando: false });
        }
      } catch {
        if (lastQueryPerFila.current[id] === clean) {
          updateFilaById(id, { sugerencias: [], buscando: false });
        }
      }
    }, 300);
  };

  const handleSeleccionarOrden = (id: string, orden: any) => {
    updateFilaById(id, {
      ordenSeleccionada: orden,
      ingreso_id: orden.id,
      item_id: '',
      searchPlaca: '',
      sugerencias: [],
      mostrarVehiculo: true,
      buscando: false,
    });
  };

  const handleQuitarOrden = (id: string) => {
    updateFilaById(id, {
      ordenSeleccionada: null,
      ingreso_id: '',
      item_id: '',
      searchPlaca: '',
      sugerencias: [],
      buscando: false,
    });
  };

  const handleMontoManualChange = (id: string, val: string) => {
    updateFilaById(id, {
      monto: formatearMonto(val),
      montoEditadoManual: true,
    });
  };

  const handleCantidadChange = (id: string, val: string) => {
    updateFilaById(id, currentFila => {
      const cantNum = parseFloat(val);
      const unitNum = parseInt(currentFila.valor_unitario.replace(/\D/g, ''), 10);
      const updates: Partial<BatchFila> = { cantidad: val };

      if (!currentFila.montoEditadoManual && !isNaN(cantNum) && cantNum > 0 && !isNaN(unitNum) && unitNum > 0) {
        updates.monto = formatearMonto(String(Math.round(cantNum * unitNum)));
      }
      return updates;
    });
  };

  const handleUnitarioChange = (id: string, val: string) => {
    const formattedUnit = formatearMonto(val);
    const unitNum = parseInt(val.replace(/\D/g, ''), 10);

    updateFilaById(id, currentFila => {
      const cantNum = parseFloat(currentFila.cantidad);
      const updates: Partial<BatchFila> = { valor_unitario: formattedUnit };

      if (!currentFila.montoEditadoManual && !isNaN(cantNum) && cantNum > 0 && !isNaN(unitNum) && unitNum > 0) {
        updates.monto = formatearMonto(String(Math.round(cantNum * unitNum)));
      }
      return updates;
    });
  };

  const sumaLineas = filas.reduce((acc, f) => acc + (parseInt(f.monto.replace(/\D/g, ''), 10) || 0), 0);
  const totalFact = parseInt(totalFactura.replace(/\D/g, ''), 10) || 0;
  const diferencia = totalFact - sumaLineas;

  return (
    <div className="space-y-3">
      <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">{t('gastos.repuestos_items')}</p>
      {filas.map((fila, idx) => (
        <div key={fila.id} className="border border-slate-200 rounded-xl p-3 space-y-2 bg-white">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black text-slate-400 w-4 shrink-0">#{idx + 1}</span>
            <input
              type="text"
              value={fila.descripcion}
              onChange={e => updateFilaById(fila.id, { descripcion: e.target.value })}
              placeholder={t('gastos.placeholder_descripcion')}
              className="flex-1 border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            />
            {filas.length > 1 && (
              <button
                type="button"
                onClick={() => onChangeFilas(prev => prev.filter(f => f.id !== fila.id))}
                className="text-red-400 hover:text-red-600 p-1"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>

          {/* Monto y cantidad/unitario */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 mb-0.5">
                {t('gastos.monto_total_fuente')}
              </label>
              <input
                type="text"
                value={fila.monto}
                onChange={e => handleMontoManualChange(fila.id, e.target.value)}
                placeholder="0"
                className="w-full border-2 border-indigo-200 rounded-lg px-2.5 py-1.5 text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 mb-0.5">
                {t('gastos.cantidad_sugerida')}
              </label>
              <input
                type="number"
                step="any"
                min="0"
                value={fila.cantidad}
                onChange={e => handleCantidadChange(fila.id, e.target.value)}
                placeholder="1"
                className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-indigo-400 outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 mb-0.5">
                {t('gastos.valor_unitario_sugerido')}
              </label>
              <input
                type="text"
                value={fila.valor_unitario}
                onChange={e => handleUnitarioChange(fila.id, e.target.value)}
                placeholder="0"
                className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-indigo-400 outline-none"
              />
            </div>
          </div>

          {/* Acordeón de placa por fila */}
          <button
            type="button"
            onClick={() => updateFilaById(fila.id, { mostrarVehiculo: !fila.mostrarVehiculo })}
            className="w-full flex items-center justify-between px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 transition text-[11px] font-bold text-slate-600 rounded-lg"
          >
            <span className="flex items-center gap-1">
              <Car size={12} className="text-indigo-500" />
              {fila.ordenSeleccionada
                ? `${fila.ordenSeleccionada.vehiculo?.placa} — ${fila.ordenSeleccionada.vehiculo?.marca ?? ''}`
                : t('gastos.asociar_vehiculo_opcional')}
            </span>
            {fila.mostrarVehiculo ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>

          {fila.mostrarVehiculo && (
            <div className="space-y-2 pl-2">
              {!fila.ordenSeleccionada ? (
                <div className="relative">
                  <div className="relative">
                    <input
                      type="text"
                      value={fila.searchPlaca}
                      onChange={e => handlePlacaChange(fila.id, e.target.value)}
                      placeholder={t('gastos.buscar_placa_placeholder')}
                      className="w-full border border-slate-200 rounded-lg pl-7 pr-7 py-1.5 text-xs uppercase font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                    <Search size={12} className="absolute left-2 top-2 text-slate-400" />
                    {fila.buscando && <Loader2 size={12} className="animate-spin absolute right-2 top-2 text-indigo-500" />}
                  </div>
                  {fila.sugerencias.length > 0 && (
                    <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-40 overflow-y-auto divide-y divide-slate-100">
                      {fila.sugerencias.map(ord => (
                        <div
                          key={ord.id}
                          onClick={() => handleSeleccionarOrden(fila.id, ord)}
                          className="p-2 hover:bg-indigo-50 cursor-pointer flex items-center gap-2 text-xs"
                        >
                          <span className="bg-amber-100 text-amber-900 border border-amber-300 font-black px-1.5 py-0.5 rounded text-[10px] tracking-wider">
                            {ord.vehiculo?.placa}
                          </span>
                          <span className="text-slate-700">
                            {ord.vehiculo?.marca} {ord.vehiculo?.linea}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between bg-white border border-indigo-100 rounded-lg px-2.5 py-1.5 text-xs">
                    <span className="flex items-center gap-1.5">
                      <span className="bg-amber-100 text-amber-900 border border-amber-300 font-black px-1.5 py-0.5 rounded text-[10px] tracking-wider">
                        {fila.ordenSeleccionada.vehiculo?.placa}
                      </span>
                      <span className="font-semibold text-slate-700">
                        {fila.ordenSeleccionada.vehiculo?.marca} {fila.ordenSeleccionada.vehiculo?.linea}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => handleQuitarOrden(fila.id)}
                      className="text-red-400 hover:text-red-600 text-[10px] font-semibold"
                    >
                      {t('gastos.quitar_vinculo')}
                    </button>
                  </div>
                  {fila.ordenSeleccionada.items_repuesto?.length > 0 && (
                    <select
                      value={fila.item_id}
                      onChange={e => updateFilaById(fila.id, { item_id: e.target.value })}
                      className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                      <option value="">-- {t('gastos.solo_orden')} --</option>
                      {fila.ordenSeleccionada.items_repuesto.map((item: any) => (
                        <option key={item.id} value={item.id}>
                          {item.descripcion} (Venta: {formatearDinero(item.total)})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      ))}

      <button
        type="button"
        onClick={() => onChangeFilas(prev => [...prev, crearNuevaFila()])}
        className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-xl py-2.5 text-sm text-slate-500 hover:border-indigo-300 hover:text-indigo-600 transition"
      >
        <PlusCircle size={16} /> {t('gastos.agregar_repuesto')}
      </button>

      {/* Conciliación de totales */}
      <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 space-y-1">
        <div className="flex justify-between text-xs">
          <span className="text-slate-500">{t('gastos.suma_repuestos')}</span>
          <span className="font-bold text-slate-800">{formatearDinero(sumaLineas)}</span>
        </div>
        {totalFact > 0 && (
          <>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">{t('gastos.total_factura_declarado')}</span>
              <span className="font-bold text-slate-800">{formatearDinero(totalFact)}</span>
            </div>
            <div
              className={`flex justify-between text-xs font-bold ${
                Math.abs(diferencia) > 0 ? 'text-amber-600' : 'text-emerald-600'
              }`}
            >
              <span className="flex items-center gap-1">
                {Math.abs(diferencia) > 0 && <AlertTriangle size={11} />}
                {t('gastos.diferencia_conciliacion')}
              </span>
              <span>{diferencia >= 0 ? '+' : ''}{formatearDinero(diferencia)}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default EditorLineasGasto;