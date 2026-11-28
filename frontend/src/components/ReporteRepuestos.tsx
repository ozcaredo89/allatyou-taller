import appI18n from "../i18n";
import { mostrarCantidadInventario, type CapturaVolumen } from '../utils/volumenInventario';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Package, Loader2, AlertTriangle, Search, ChevronDown, ChevronUp, TrendingUp,
  DollarSign, Hash, ExternalLink, Info, Download, X,
} from 'lucide-react';
import api from '../services/api';

interface DetalleRepuesto extends CapturaVolumen {
  ingreso_id: string;
  fecha_entrega: string;
  placa: string;
  vehiculo: string;
  cliente: string;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  total: number;
  costo: number | null;
  utilidad: number | null;
}

interface RepuestoAgrupado {
  key: string;
  descripcion: string;
  posibleManoObra?: boolean;
  unidad?: 'litro';
  cantidad: number;
  ordenes: number;
  ventaTotal: number;
  precioPromedio: number;
  cantidadConCosto: number;
  costoTotal: number;
  costoPromedio: number | null;
  utilidad: number | null;
  margenPct: number | null;
  detalle: DetalleRepuesto[];
}

interface Resumen {
  repuestosDistintos: number;
  unidades: number;
  litros?: number;
  ventaTotal: number;
  ventaConCosto: number;
  costoTotal: number;
  utilidad: number;
  margenPct: number;
  lineasTotal: number;
  lineasConCosto: number;
}

type SortKey = 'cantidad' | 'ventaTotal' | 'utilidad' | 'margenPct';

interface Props {
  start: string;
  end: string;
  slug: string;
  disabled?: boolean;
  filtros: React.ReactNode;
}

const dinero = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n || 0);

const fmtNum = (n: number) => new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(n || 0);

const fmtFecha = (s: string) => {
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
};

const margenColor = (m: number | null) =>
  m === null ? 'text-slate-400' : m >= 30 ? 'text-emerald-600' : m >= 10 ? 'text-amber-600' : 'text-red-600';

const BadgeManoObra: React.FC = () => (
  <span
    className="inline-block align-middle mr-1.5 text-[10px] bg-amber-100 text-amber-800 border border-amber-300 px-1.5 py-0.5 rounded font-bold"
    title={appI18n.t("ui.ReporteRepuestos.this_looks_like_labor_but_is_recorded_as")}
  >
    {appI18n.t("ui.ReporteRepuestos.labor")}
  </span>
);

const ReporteRepuestos: React.FC<Props> = ({ start, end, slug, disabled, filtros }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [repuestos, setRepuestos] = useState<RepuestoAgrupado[]>([]);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('cantidad');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [verTodos, setVerTodos] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const cargar = async () => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`/ingresos/reportes/repuestos?start=${start}&end=${end}`, { signal: controller.signal });
      setRepuestos(res.data.repuestos || []);
      setResumen(res.data.resumen || null);
      setExpanded(null);
    } catch (err: unknown) {
      const e = err as { code?: string; name?: string };
      if (e?.code === 'ERR_CANCELED' || e?.name === 'AbortError' || e?.name === 'CanceledError') return;
      setError(appI18n.t('ui.ReporteRepuestos.could_not_load_the_parts_report_try_again'));
    } finally {
      if (abortRef.current === controller) setLoading(false);
    }
  };

  useEffect(() => {
    if (disabled || !start || !end) return;
    cargar();
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, end, disabled]);

  const lista = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtrada = q
      ? repuestos.filter((r) => r.descripcion.toLowerCase().includes(q) || r.detalle.some((d) => d.placa.toLowerCase().includes(q)))
      : repuestos;
    const val = (r: RepuestoAgrupado) => {
      const v = r[sortKey];
      return v === null || v === undefined ? -Infinity : v;
    };
    return [...filtrada].sort((a, b) => val(b) - val(a) || b.cantidad - a.cantidad);
  }, [repuestos, search, sortKey]);

  const visibles = verTodos || search ? lista : lista.slice(0, 20);
  const maxCantidad = Math.max(1, ...lista.map((r) => r.cantidad));

  const exportarCSV = () => {
    const esc = (v: string | number | null) => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const filas: (string | number | null)[][] = [
      [appI18n.t('ui.ReporteRepuestos.part'), appI18n.t('ui.ReporteRepuestos.delivery_date'), appI18n.t('ui.ReporteRepuestos.license_plate'), appI18n.t('ui.ReporteRepuestos.vehicle'), appI18n.t('ui.ReporteRepuestos.customer'), appI18n.t('ui.ReporteRepuestos.quantity'), appI18n.t('ui.ReporteRepuestos.unit_price'), appI18n.t('ui.ReporteRepuestos.sales'), appI18n.t('ui.ReporteRepuestos.cost'), appI18n.t('ui.ReporteRepuestos.profit')],
    ];
    lista.forEach((r) =>
      r.detalle.forEach((d) =>
        filas.push([r.descripcion, d.fecha_entrega, d.placa, d.vehiculo, d.cliente, mostrarCantidadInventario(d), Math.round(d.precio_unitario_captura ?? d.precio_unitario), Math.round(d.total),
          d.costo === null ? null : Math.round(d.costo), d.utilidad === null ? null : Math.round(d.utilidad)])
      )
    );
    const csv = '\uFEFF' + filas.map((f) => f.map(esc).join(';')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `repuestos-${slug}-${start}${start !== end ? `-a-${end}` : ''}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const sinCosto = resumen ? resumen.lineasTotal - resumen.lineasConCosto : 0;

  return (
    <>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900">{appI18n.t("ui.ReporteRepuestos.most_used_parts")}</h1>
            {loading && (
              <span className="inline-flex items-center gap-1.5 text-xs text-indigo-600 bg-indigo-50 font-medium px-2.5 py-0.5 rounded-full animate-pulse">
                <Loader2 size={13} className="animate-spin" /> {appI18n.t("ui.ReporteRepuestos.loading")}
              </span>
            )}
          </div>
          <p className="text-slate-500">{appI18n.t("ui.ReporteRepuestos.quantity_average_price_cost_and_profit_for_parts")}</p>
        </div>
        {filtros}
      </div>

      {error ? (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-8 flex flex-col items-center justify-center text-center gap-3">
          <AlertTriangle className="text-red-500" size={36} />
          <p className="text-sm font-semibold text-red-800">{error}</p>
          <button type="button" onClick={cargar} className="px-4 py-2 text-xs font-semibold bg-red-600 text-white rounded-xl hover:bg-red-700 transition">
            {appI18n.t("ui.ReporteRepuestos.retry")}
          </button>
        </div>
      ) : (
        <div className={`space-y-6 transition-opacity duration-200 ${loading ? 'opacity-50 pointer-events-none' : ''}`}>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold uppercase tracking-wider"><Hash size={14} /> {appI18n.t("ui.ReporteRepuestos.units_sold")}</div>
              <p className="text-2xl font-bold text-slate-900 mt-1">{fmtNum(resumen?.unidades || 0)}{Boolean(resumen?.litros) && <span className="text-sm"> · {fmtNum(resumen?.litros ?? 0)} L</span>}</p>
              <p className="text-xs text-slate-400 mt-0.5">{resumen?.repuestosDistintos || 0} {appI18n.t("ui.ReporteRepuestos.unique_parts")}</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold uppercase tracking-wider"><DollarSign size={14} /> {appI18n.t("ui.ReporteRepuestos.parts_sales")}</div>
              <p className="text-2xl font-bold text-slate-900 mt-1">{dinero(resumen?.ventaTotal || 0)}</p>
              <p className="text-xs text-slate-400 mt-0.5">{appI18n.t("ui.ReporteRepuestos.total_billed_for_parts")}</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold uppercase tracking-wider"><Package size={14} /> {appI18n.t("ui.ReporteRepuestos.purchase_cost")}</div>
              <p className="text-2xl font-bold text-slate-900 mt-1">{dinero(resumen?.costoTotal || 0)}</p>
              <p className="text-xs text-slate-400 mt-0.5">{resumen?.lineasConCosto || 0} {appI18n.t("ui.ReporteRepuestos.of")} {resumen?.lineasTotal || 0} {appI18n.t("ui.ReporteRepuestos.with_a_recorded_cost")}</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold uppercase tracking-wider"><TrendingUp size={14} /> {appI18n.t("ui.ReporteRepuestos.parts_profit")}</div>
              <p className={`text-2xl font-bold mt-1 ${(resumen?.utilidad || 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{dinero(resumen?.utilidad || 0)}</p>
              <p className={`text-xs mt-0.5 font-semibold ${margenColor(resumen && resumen.lineasConCosto > 0 ? resumen.margenPct : null)}`}>
                {resumen && resumen.lineasConCosto > 0 ? `Margen ${resumen.margenPct.toFixed(1)}%` : appI18n.t('ui.ReporteRepuestos.no_recorded_costs')}
              </p>
            </div>
          </div>

          {sinCosto > 0 && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-xs">
              <Info size={15} className="shrink-0 mt-0.5" />
              <span>
                {sinCosto} {appI18n.t("ui.ReporteRepuestos.part_line_s_have_no_linked_purchase_cost")}
              </span>
            </div>
          )}

          {/* Toolbar */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between p-4 border-b border-slate-100">
              <div className="relative w-full sm:max-w-xs">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={appI18n.t("ui.ReporteRepuestos.search_by_part_or_license_plate")}
                  className="w-full pl-9 pr-8 py-2 text-sm border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300"
                />
                {search && (
                  <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X size={14} /></button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 font-semibold">{appI18n.t("ui.ReporteRepuestos.sort_by")}</span>
                <select
                  value={sortKey}
                  onChange={(e) => setSortKey(e.target.value as SortKey)}
                  className="text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white outline-none"
                >
                  <option value="cantidad">{appI18n.t("ui.ReporteRepuestos.quantity")}</option>
                  <option value="ventaTotal">{appI18n.t("ui.ReporteRepuestos.total_sales_2")}</option>
                  <option value="utilidad">{appI18n.t("ui.ReporteRepuestos.profit")}</option>
                  <option value="margenPct">{appI18n.t("ui.ReporteRepuestos.margin_2")}</option>
                </select>
                <button
                  onClick={exportarCSV}
                  disabled={lista.length === 0}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-slate-200 rounded-xl hover:bg-slate-50 disabled:opacity-40"
                  title={appI18n.t("ui.ReporteRepuestos.export_details_to_csv_excel")}
                >
                  <Download size={14} /> CSV
                </button>
              </div>
            </div>

            {lista.length === 0 ? (
              <div className="p-10 text-center text-slate-400 text-sm">
                {loading ? appI18n.t('ui.ReporteRepuestos.loading_2') : appI18n.t('ui.ReporteRepuestos.there_are_no_parts_on_delivered_orders_in')}
              </div>
            ) : (
              <>
                {/* Header (desktop) */}
                <div className="hidden md:grid grid-cols-[2rem_minmax(0,2.4fr)_0.8fr_1fr_1fr_1.1fr_0.8fr_1.5rem] gap-3 px-4 py-2.5 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <span>#</span>
                  <span>{appI18n.t("ui.ReporteRepuestos.part")}</span>
                  <span className="text-right">{appI18n.t("ui.ReporteRepuestos.quantity")}</span>
                  <span className="text-right">{appI18n.t("ui.ReporteRepuestos.avg_price")}</span>
                  <span className="text-right">{appI18n.t("ui.ReporteRepuestos.avg_cost")}</span>
                  <span className="text-right">{appI18n.t("ui.ReporteRepuestos.profit")}</span>
                  <span className="text-right">{appI18n.t("ui.ReporteRepuestos.margin")}</span>
                  <span />
                </div>

                <ul className="divide-y divide-slate-100">
                  {visibles.map((r, idx) => {
                    const isOpen = expanded === r.key;
                    return (
                      <li key={r.key}>
                        <button
                          type="button"
                          onClick={() => setExpanded(isOpen ? null : r.key)}
                          className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition ${isOpen ? 'bg-indigo-50/40' : ''}`}
                        >
                          {/* Desktop row */}
                          <div className="hidden md:grid grid-cols-[2rem_minmax(0,2.4fr)_0.8fr_1fr_1fr_1.1fr_0.8fr_1.5rem] gap-3 items-center text-sm">
                            <span className="text-slate-400 font-semibold">{idx + 1}</span>
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-800 truncate" title={r.descripcion}>
                                {r.posibleManoObra && <BadgeManoObra />}{r.descripcion}
                              </p>
                              <div className="flex items-center gap-2 mt-1">
                                <div className="h-1.5 bg-slate-100 rounded-full flex-1 max-w-[160px] overflow-hidden">
                                  <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${(r.cantidad / maxCantidad) * 100}%` }} />
                                </div>
                                <span className="text-[11px] text-slate-400">{r.ordenes} {appI18n.t("ui.ReporteRepuestos.order_s")} {dinero(r.ventaTotal)}</span>
                              </div>
                            </div>
                            <span className="text-right font-bold text-slate-900">{fmtNum(r.cantidad)}{r.unidad && ' L'}</span>
                            <span className="text-right text-slate-700">{dinero(r.precioPromedio)}</span>
                            <span className="text-right text-slate-700">
                              {r.costoPromedio === null ? <span className="text-slate-300">—</span> : dinero(r.costoPromedio)}
                            </span>
                            <span className={`text-right font-semibold ${r.utilidad === null ? 'text-slate-300' : r.utilidad >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                              {r.utilidad === null ? '—' : dinero(r.utilidad)}
                            </span>
                            <span className={`text-right font-semibold ${margenColor(r.margenPct)}`}>
                              {r.margenPct === null ? '—' : `${r.margenPct.toFixed(1)}%`}
                            </span>
                            <span className="text-slate-400">{isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</span>
                          </div>

                          {/* Mobile card */}
                          <div className="md:hidden">
                            <div className="flex items-start justify-between gap-2">
                              <p className="font-semibold text-slate-800 text-sm"><span className="text-slate-400 mr-1">{idx + 1}.</span>{r.posibleManoObra && <BadgeManoObra />}{r.descripcion}</p>
                              <span className="text-slate-400 shrink-0">{isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</span>
                            </div>
                            <div className="grid grid-cols-3 gap-2 mt-2 text-xs">
                              <div><p className="text-slate-400">{appI18n.t("ui.ReporteRepuestos.quantity")}</p><p className="font-bold text-slate-900">{fmtNum(r.cantidad)}{r.unidad && ' L'}</p></div>
                              <div><p className="text-slate-400">{appI18n.t("ui.ReporteRepuestos.avg_price")}</p><p className="font-semibold text-slate-700">{dinero(r.precioPromedio)}</p></div>
                              <div><p className="text-slate-400">{appI18n.t("ui.ReporteRepuestos.avg_cost")}</p><p className="font-semibold text-slate-700">{r.costoPromedio === null ? '—' : dinero(r.costoPromedio)}</p></div>
                              <div><p className="text-slate-400">{appI18n.t("ui.ReporteRepuestos.sales")}</p><p className="font-semibold text-slate-700">{dinero(r.ventaTotal)}</p></div>
                              <div><p className="text-slate-400">{appI18n.t("ui.ReporteRepuestos.profit")}</p><p className={`font-semibold ${r.utilidad === null ? 'text-slate-300' : r.utilidad >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{r.utilidad === null ? '—' : dinero(r.utilidad)}</p></div>
                              <div><p className="text-slate-400">{appI18n.t("ui.ReporteRepuestos.margin")}</p><p className={`font-semibold ${margenColor(r.margenPct)}`}>{r.margenPct === null ? '—' : `${r.margenPct.toFixed(1)}%`}</p></div>
                            </div>
                          </div>
                        </button>

                        {isOpen && (
                          <div className="bg-slate-50/70 border-t border-slate-100 px-4 py-4">
                            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-600 mb-3">
                              <span>{appI18n.t("ui.ReporteRepuestos.total_sales")} <b>{dinero(r.ventaTotal)}</b></span>
                              <span>{appI18n.t("ui.ReporteRepuestos.total_cost")} <b>{r.cantidadConCosto > 0 ? dinero(r.costoTotal) : '—'}</b></span>
                              <span>{appI18n.t("ui.ReporteRepuestos.units_with_recorded_cost")} <b>{fmtNum(r.cantidadConCosto)} / {fmtNum(r.cantidad)}{r.unidad && ' L'}</b></span>
                            </div>
                            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                              <table className="w-full text-xs min-w-[720px]">
                                <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider text-[10px]">
                                  <tr>
                                    <th className="text-left px-3 py-2">{appI18n.t("ui.ReporteRepuestos.date")}</th>
                                    <th className="text-left px-3 py-2">{appI18n.t("ui.ReporteRepuestos.plate_vehicle")}</th>
                                    <th className="text-left px-3 py-2">{appI18n.t("ui.ReporteRepuestos.customer")}</th>
                                    <th className="text-right px-3 py-2">{appI18n.t("ui.ReporteRepuestos.qty")}</th>
                                    <th className="text-right px-3 py-2">{appI18n.t("ui.ReporteRepuestos.unit_price")}</th>
                                    <th className="text-right px-3 py-2">{appI18n.t("ui.ReporteRepuestos.sales")}</th>
                                    <th className="text-right px-3 py-2">{appI18n.t("ui.ReporteRepuestos.cost")}</th>
                                    <th className="text-right px-3 py-2">{appI18n.t("ui.ReporteRepuestos.profit")}</th>
                                    <th className="px-3 py-2" />
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {r.detalle.map((d, i) => (
                                    <tr key={`${d.ingreso_id}-${i}`} className="hover:bg-slate-50">
                                      <td className="px-3 py-2 whitespace-nowrap text-slate-600">{fmtFecha(d.fecha_entrega)}</td>
                                      <td className="px-3 py-2">
                                        <span className="font-bold text-slate-800">{d.placa}</span>
                                        {d.vehiculo && <span className="text-slate-400 ml-1">{d.vehiculo}</span>}
                                        {d.descripcion !== r.descripcion && <p className="text-[10px] text-slate-400 italic">“{d.descripcion}”</p>}
                                      </td>
                                      <td className="px-3 py-2 text-slate-600 truncate max-w-[160px]" title={d.cliente}>{d.cliente}</td>
                                      <td className="px-3 py-2 text-right">{mostrarCantidadInventario(d)}</td>
                                      <td className="px-3 py-2 text-right">{dinero(d.precio_unitario_captura ?? d.precio_unitario)}</td>
                                      <td className="px-3 py-2 text-right font-semibold">{dinero(d.total)}</td>
                                      <td className="px-3 py-2 text-right">{d.costo === null ? <span className="text-amber-500" title={appI18n.t("ui.ReporteRepuestos.no_cost_recorded")}>{appI18n.t("ui.ReporteRepuestos.no_cost")}</span> : dinero(d.costo)}</td>
                                      <td className={`px-3 py-2 text-right font-semibold ${d.utilidad === null ? 'text-slate-300' : d.utilidad >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                        {d.utilidad === null ? '—' : dinero(d.utilidad)}
                                      </td>
                                      <td className="px-3 py-2 text-right">
                                        <Link to={`/${slug}/historial/${d.ingreso_id}`} className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-semibold" title={appI18n.t("ui.ReporteRepuestos.view_order")}>
                                          <ExternalLink size={13} />
                                        </Link>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>

                {!search && lista.length > 20 && (
                  <div className="p-3 border-t border-slate-100 text-center">
                    <button onClick={() => setVerTodos((v) => !v)} className="text-xs font-semibold text-indigo-600 hover:text-indigo-800">
                      {verTodos ? appI18n.t('ui.ReporteRepuestos.show_only_the_top_20') : `Ver todos (${lista.length})`}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default ReporteRepuestos;
