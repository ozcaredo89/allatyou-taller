import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  TrendingUp,
  Plus,
  Link,
  Unlink,
  Clock,
  Info
} from 'lucide-react';
import { calcularRentabilidad } from '../utils/rentabilidadUtils';

interface Props {
  itemsFactura: any[];
  gastos: any[];
  estadoOrden: string;
  readOnly?: boolean;
  savedItemIds?: Set<string>;
  onOpenModalGasto?: (itemId?: string, itemDescripcion?: string, tab?: 'nuevo' | 'existente') => void;
  onDesvincularGasto?: (gastoId: string) => Promise<void>;
  onDesvincularGastoDeItem?: (gastoId: string) => Promise<void>;
  onDesvincularGastoDeOrden?: (gastoId: string) => Promise<void>;
}

const formatearDinero = (monto: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(monto);

export const RentabilidadRepuestos: React.FC<Props> = ({
  itemsFactura,
  gastos,
  estadoOrden,
  readOnly = false,
  savedItemIds,
  onOpenModalGasto,
  onDesvincularGasto,
  onDesvincularGastoDeItem,
  onDesvincularGastoDeOrden,
}) => {
  const { t } = useTranslation();

  const rentabilidad = calcularRentabilidad(itemsFactura, gastos);
  const esProvisional = estadoOrden !== 'entregado';

  if (rentabilidad.itemsRepuesto.length === 0 && rentabilidad.gastosSinItem.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden space-y-5 p-6">
      {/* ── Encabezado y Badge Provisional ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
            <TrendingUp size={20} className="text-emerald-600" />
            {t('gastos.rentabilidad_title')}
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {t('gastos.rentabilidad_desc')}
          </p>
        </div>

        {esProvisional && (
          <div className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-800 border border-amber-200 px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0">
            <Clock size={14} className="text-amber-600" />
            <span>{t('gastos.margen_provisional')}</span>
            <span className="text-[10px] text-amber-600 hidden sm:inline" title={t('gastos.margen_provisional_desc')}>
              (Sujeto a compras pendientes)
            </span>
          </div>
        )}
      </div>

      {/* ── KPIs de Rentabilidad de Repuestos con Costo ── */}
      {rentabilidad.itemsRepuesto.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {/* Progreso de auditoría */}
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-3.5">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              Repuestos Auditados
            </p>
            <p className="text-base font-extrabold text-slate-800">
              {rentabilidad.repuestosConCostoCount} / {rentabilidad.repuestosTotalCount}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">con costo registrado</p>
          </div>

          {/* Total Venta */}
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-3.5">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              {t('gastos.venta_cliente')}
            </p>
            <p className="text-base font-extrabold text-slate-800">
              {formatearDinero(rentabilidad.totalVentaConCosto)}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">Facturado al cliente</p>
          </div>

          {/* Total Costo */}
          <div className="bg-red-50/70 border border-red-100 rounded-xl p-3.5">
            <p className="text-[11px] font-bold text-red-500 uppercase tracking-wider mb-1">
              {t('gastos.costo_compra')}
            </p>
            <p className="text-base font-extrabold text-red-700">
              {formatearDinero(rentabilidad.totalCostoConCosto)}
            </p>
            <p className="text-[11px] text-red-500/80 mt-0.5">Gastos vinculados</p>
          </div>

          {/* Utilidad y Margen */}
          <div className={`rounded-xl p-3.5 border ${
            rentabilidad.utilidadConCosto >= 0
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}>
            <p className="text-[11px] font-bold uppercase tracking-wider mb-1 opacity-80">
              {t('gastos.utilidad_repuestos')}
            </p>
            <div className="flex items-baseline gap-2">
              <p className="text-base font-black">
                {formatearDinero(rentabilidad.utilidadConCosto)}
              </p>
              <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-white/60">
                {rentabilidad.margenConCostoPct.toFixed(1)}%
              </span>
            </div>
            <p className="text-[11px] opacity-75 mt-0.5">Margen bruto en repuestos</p>
          </div>
        </div>
      )}

      {/* ── Tabla de Repuestos y sus Costos ── */}
      {rentabilidad.itemsRepuesto.length > 0 && (
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
                <th className="text-left px-4 py-3">Repuesto</th>
                <th className="text-right px-4 py-3">{t('gastos.venta_cliente')}</th>
                <th className="text-right px-4 py-3">{t('gastos.costo_compra')}</th>
                <th className="text-right px-4 py-3">Utilidad / Margen</th>
                {!readOnly && <th className="text-center px-4 py-3">Acciones</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rentabilidad.itemsRepuesto.map((item) => (
                <React.Fragment key={item.id}>
                  <tr className="hover:bg-slate-50/50 transition">
                    {/* Repuesto */}
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-800">{item.descripcion}</p>
                      <p className="text-xs text-slate-400">Cant: {item.cantidad} · Unit: {formatearDinero(item.precio_unitario)}</p>
                    </td>

                    {/* Venta al cliente */}
                    <td className="px-4 py-3 text-right font-bold text-slate-800 whitespace-nowrap">
                      {formatearDinero(item.total)}
                    </td>

                    {/* Costo de compra */}
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {item.tieneCosto ? (
                        <span className="font-bold text-red-600">{formatearDinero(item.costoTotal)}</span>
                      ) : (
                        <span className="text-xs text-slate-400 italic bg-slate-100 px-2 py-1 rounded-md">
                          {t('gastos.sin_costo_registrado')}
                        </span>
                      )}
                    </td>

                    {/* Utilidad y Margen */}
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {item.tieneCosto && item.utilidad !== null && item.margenPct !== null ? (
                        <div>
                          <p className={`font-bold ${item.utilidad >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                            {formatearDinero(item.utilidad)}
                          </p>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            item.utilidad >= 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                          }`}>
                            {item.margenPct.toFixed(1)}% margen
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </td>

                    {/* Acciones */}
                    {!readOnly && (() => {
                      const isSaved = !savedItemIds || savedItemIds.has(item.id);
                      return (
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              disabled={!isSaved}
                              onClick={() => isSaved && onOpenModalGasto?.(item.id, item.descripcion, 'nuevo')}
                              className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-lg transition ${
                                isSaved
                                  ? 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700'
                                  : 'bg-slate-100 text-slate-400 cursor-not-allowed opacity-60'
                              }`}
                              title={isSaved ? "Registrar costo de compra para este repuesto" : "Guarda la orden primero para registrar o vincular costos a este repuesto"}
                            >
                              <Plus size={13} /> Gasto
                            </button>
                            <button
                              type="button"
                              disabled={!isSaved}
                              onClick={() => isSaved && onOpenModalGasto?.(item.id, item.descripcion, 'existente')}
                              className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1.5 rounded-lg transition ${
                                isSaved
                                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                                  : 'bg-slate-100 text-slate-400 cursor-not-allowed opacity-60'
                              }`}
                              title={isSaved ? "Vincular gasto existente" : "Guarda la orden primero para registrar o vincular costos a este repuesto"}
                            >
                              <Link size={13} />
                            </button>
                          </div>
                        </td>
                      );
                    })()}
                  </tr>

                  {/* Detalle de gastos vinculados a este ítem */}
                  {item.gastosVinculados.length > 0 && (
                    <tr className="bg-slate-50/40">
                      <td colSpan={readOnly ? 4 : 5} className="px-4 py-2 text-xs text-slate-500">
                        <div className="space-y-1.5 pl-4 border-l-2 border-indigo-200 my-1">
                          {item.gastosVinculados.map((g) => (
                            <div key={g.id} className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-slate-700">{g.descripcion}</span>
                                {g.proveedor && <span className="text-slate-400">({g.proveedor})</span>}
                                <span className="text-slate-400 text-[11px]">{g.fecha}</span>
                                {g.comprobante_url && (
                                  <a href={g.comprobante_url} target="_blank" rel="noreferrer" className="text-indigo-600 underline text-[11px]">
                                    Recibo
                                  </a>
                                )}
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="font-bold text-red-600">{formatearDinero(g.monto)}</span>
                                {!readOnly && (onDesvincularGastoDeItem || onDesvincularGasto) && (
                                  <button
                                    type="button"
                                    onClick={() => onDesvincularGastoDeItem ? onDesvincularGastoDeItem(g.id) : onDesvincularGasto?.(g.id)}
                                    className="text-slate-400 hover:text-red-600 transition p-0.5"
                                    title="Desvincular de este repuesto (permanecerá en la orden como gasto general)"
                                  >
                                    <Unlink size={13} />
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Costos de la Orden sin Ítem Asignado ── */}
      {rentabilidad.gastosSinItem.length > 0 && (
        <div className="bg-amber-50/50 border border-amber-200 rounded-xl p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-amber-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
              <Info size={14} className="text-amber-600" />
              {t('gastos.costo_sin_item')}
            </h4>
            <span className="font-black text-amber-900 text-sm">
              Total: {formatearDinero(rentabilidad.totalGastosSinItem)}
            </span>
          </div>

          <p className="text-xs text-amber-700/80">
            Gastos asignados a la orden general (grúas, insumos, repuestos no asignados) que no están vinculados a un repuesto específico.
          </p>

          <div className="space-y-1.5 pt-1">
            {rentabilidad.gastosSinItem.map((g) => (
              <div key={g.id} className="bg-white/80 border border-amber-100 rounded-lg px-3 py-2 flex items-center justify-between text-xs">
                <div>
                  <span className="font-semibold text-slate-800">{g.descripcion}</span>
                  {g.proveedor && <span className="text-slate-400 ml-1.5">({g.proveedor})</span>}
                  <span className="text-slate-400 ml-2">{g.fecha}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-bold text-red-600">{formatearDinero(g.monto)}</span>
                  {!readOnly && (onDesvincularGastoDeOrden || onDesvincularGasto) && (
                    <button
                      type="button"
                      onClick={() => onDesvincularGastoDeOrden ? onDesvincularGastoDeOrden(g.id) : onDesvincularGasto?.(g.id)}
                      className="text-slate-400 hover:text-red-600 transition"
                      title="Desvincular gasto de esta orden completamente"
                    >
                      <Unlink size={13} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
