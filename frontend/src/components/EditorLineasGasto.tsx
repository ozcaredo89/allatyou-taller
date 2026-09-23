import React from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2, PlusCircle } from 'lucide-react';
import SelectorVehiculo from './SelectorVehiculo';

/**
 * Una línea de la factura: descripción + monto.
 * El vehículo se hereda de la cabecera; solo se guarda uno propio
 * (ordenSeleccionada) cuando la línea es de otro carro.
 */
export interface BatchFila {
  id: string;
  descripcion: string;
  monto: string;
  ingreso_id: string;
  item_id: string;
  ordenSeleccionada: any | null;
  cambiandoVehiculo: boolean;
}

export const crearNuevaFila = (): BatchFila => ({
  id: crypto.randomUUID(),
  descripcion: '',
  monto: '',
  ingreso_id: '',
  item_id: '',
  ordenSeleccionada: null,
  cambiandoVehiculo: false,
});

interface EditorLineasGastoProps {
  filas: BatchFila[];
  onChangeFilas: React.Dispatch<React.SetStateAction<BatchFila[]>>;
  /** Vehículo de la cabecera: lo heredan todas las líneas que no tengan uno propio. */
  ordenPorDefecto: any | null;
  formatearDinero: (val: number) => string;
  formatearMonto: (val: string) => string;
}

export const EditorLineasGasto: React.FC<EditorLineasGastoProps> = ({
  filas,
  onChangeFilas,
  ordenPorDefecto,
  formatearDinero,
  formatearMonto,
}) => {
  const { t } = useTranslation();

  const updateFilaById = (id: string, patch: Partial<BatchFila>) => {
    onChangeFilas(prev => prev.map(f => (f.id === id ? { ...f, ...patch } : f)));
  };

  const total = filas.reduce((acc, f) => acc + (parseInt(f.monto.replace(/\D/g, ''), 10) || 0), 0);

  return (
    <div className="space-y-3">
      <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">{t('gastos.repuestos_items')}</p>

      {filas.map(fila => {
        const ordenEfectiva = fila.ordenSeleccionada ?? ordenPorDefecto;
        const repuestos: any[] = ordenEfectiva?.items_repuesto || [];

        return (
          <div key={fila.id} className="border border-slate-200 rounded-xl p-3 space-y-2 bg-white">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={fila.descripcion}
                onChange={e => updateFilaById(fila.id, { descripcion: e.target.value })}
                placeholder={t('gastos.placeholder_descripcion')}
                className="flex-1 min-w-0 border border-slate-200 rounded-lg px-2.5 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              />
              <input
                type="text"
                inputMode="numeric"
                value={fila.monto}
                onChange={e => updateFilaById(fila.id, { monto: formatearMonto(e.target.value) })}
                placeholder={t('gastos.label_monto')}
                className="w-28 sm:w-36 border border-slate-200 rounded-lg px-2.5 py-2 text-sm text-right font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
              />
              {filas.length > 1 && (
                <button
                  type="button"
                  onClick={() => onChangeFilas(prev => prev.filter(f => f.id !== fila.id))}
                  className="text-red-400 hover:text-red-600 p-1 shrink-0"
                  aria-label={t('gastos.btn_cancelar')}
                >
                  <Trash2 size={15} />
                </button>
              )}
            </div>

            {/* Repuesto de la orden: solo aparece si el vehículo tiene repuestos cotizados */}
            {repuestos.length > 0 && (
              <select
                value={fila.item_id}
                onChange={e => updateFilaById(fila.id, { item_id: e.target.value })}
                className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
              >
                <option value="">{t('gastos.repuesto_de_orden')}</option>
                {repuestos.map((item: any) => (
                  <option key={item.id} value={item.id}>
                    {item.descripcion} ({formatearDinero(item.total)})
                  </option>
                ))}
              </select>
            )}

            {/* Otro vehículo: escondido salvo que se pida */}
            {fila.ordenSeleccionada || fila.cambiandoVehiculo ? (
              <SelectorVehiculo
                value={fila.ordenSeleccionada}
                onChange={orden =>
                  updateFilaById(fila.id, {
                    ordenSeleccionada: orden,
                    ingreso_id: orden ? orden.id : '',
                    item_id: '',
                    cambiandoVehiculo: !!orden,
                  })
                }
              />
            ) : (
              <button
                type="button"
                onClick={() => updateFilaById(fila.id, { cambiandoVehiculo: true })}
                className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800"
              >
                {ordenPorDefecto ? t('gastos.otro_vehiculo') : t('gastos.asignar_vehiculo')}
              </button>
            )}
          </div>
        );
      })}

      <button
        type="button"
        onClick={() => onChangeFilas(prev => [...prev, crearNuevaFila()])}
        className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-xl py-2.5 text-sm text-slate-500 hover:border-indigo-300 hover:text-indigo-600 transition"
      >
        <PlusCircle size={16} /> {t('gastos.agregar_repuesto')}
      </button>

      <div className="flex justify-between items-center bg-slate-50 rounded-xl px-4 py-3 border border-slate-200">
        <span className="text-sm font-semibold text-slate-600">{t('gastos.total_factura_suma')}</span>
        <span className="text-lg font-black text-slate-900">{formatearDinero(total)}</span>
      </div>
    </div>
  );
};

export default EditorLineasGasto;
