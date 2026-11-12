import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Package, Loader2, AlertTriangle, Search, ChevronDown, ChevronUp, TrendingUp,
  DollarSign, Hash, ExternalLink, Info, Download, X,
} from 'lucide-react';
import api from '../services/api';

interface DetalleRepuesto {
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
      setError('No se pudo cargar el reporte de repuestos. Intenta de nuevo.');
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
      ['Repuesto', 'Fecha entrega', 'Placa', 'Vehículo', 'Cliente', 'Cantidad', 'Precio unitario', 'Venta', 'Costo', 'Utilidad'],
    ];
    lista.forEach((r) =>
      r.detalle.forEach((d) =>
        filas.push([r.descripcion, d.fecha_entrega, d.placa, d.vehiculo, d.cliente, d.cantidad, Math.round(d.precio_unitario), Math.round(d.total),
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
            <h1 className="text-2xl font-bold text-slate-900">Repuestos más usados</h1>
            {loading && (
              <span className="inline-flex items-center gap-1.5 text-xs text-indigo-600 bg-indigo-50 font-medium px-2.5 py-0.5 rounded-full animate-pulse">
                <Loader2 size={13} className="animate-spin" /> Cargando
              </span>
            )}
          </div>
          <p className="text-slate-500">Cantidad, precio promedio, costo y utilidad por repuesto en órdenes entregadas.</p>
        </div>
        {filtros}
      </div>

      {error ? (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-8 flex flex-col items-center justify-center text-center gap-3">
          <AlertTriangle className="text-red-500" size={36} />
          <p className="text-sm font-semibold text-red-800">{error}</p>
          <button type="button" onClick={cargar} className="px-4 py-2 text-xs font-semibold bg-red-600 text-white rounded-xl hover:bg-red-700 transition">
            Intentar de nuevo
          </button>
        </div>
      ) : (
        <div className={`space-y-6 transition-opacity duration-200 ${loading ? 'opacity-50 pointer-events-none' : ''}`}>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold uppercase tracking-wider"><Hash size={14} /> Unidades vendidas</div>
              <p className="text-2xl font-bold text-slate-900 mt-1">{fmtNum(resumen?.unidades || 0)}</p>
              <p className="text-xs text-slate-400 mt-0.5">{resumen?.repuestosDistintos || 0} repuestos distintos</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold uppercase tracking-wider"><DollarSign size={14} /> Venta repuestos</div>
              <p className="text-2xl font-bold text-slate-900 mt-1">{dinero(resumen?.ventaTotal || 0)}</p>
              <p className="text-xs text-slate-400 mt-0.5">Total facturado en repuestos</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold uppercase tracking-wider"><Package size={14} /> Costo de compra</div>
              <p className="text-2xl font-bold text-slate-900 mt-1">{dinero(resumen?.costoTotal || 0)}</p>
              <p className="text-xs text-slate-400 mt-0.5">{resumen?.lineasConCosto || 0} de {resumen?.lineasTotal || 0} con costo registrado</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold uppercase tracking-wider"><TrendingUp size={14} /> Utilidad repuestos</div>
              <p className={`text-2xl font-bold mt-1 ${(resumen?.utilidad || 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{dinero(resumen?.utilidad || 0)}</p>
              <p className={`text-xs mt-0.5 font-semibold ${margenColor(resumen && resumen.lineasConCosto > 0 ? resumen.margenPct : null)}`}>
                {resumen && resumen.lineasConCosto > 0 ? `Margen ${resumen.margenPct.toFixed(1)}%` : 'Sin costos registrados'}
              </p>
            </div>
          </div>

          {sinCosto > 0 && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-xs">
              <Info size={15} className="shrink-0 mt-0.5" />
              <span>
                {sinCosto} línea(s) de repuesto no tienen costo de compra vinculado, por eso la utilidad solo se calcula sobre los repuestos con costo.
                Puedes registrarlo desde el checkout de la orden (sección Rentabilidad → “+ Costo”).
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
                  placeholder="Buscar repuesto o placa…"
                  className="w-full pl-9 pr-8 py-2 text-sm border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300"
                />
                {search && (
                  <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X size={14} /></button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 font-semibold">Ordenar por</span>
                <select
                  value={sortKey}
                  onChange={(e) => setSortKey(e.target.value as SortKey)}
                  className="text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white outline-none"
                >
                  <option value="cantidad">Cantidad</option>
                  <option value="ventaTotal">Venta total</option>
                  <option value="utilidad">Utilidad</option>
                  <option value="margenPct">Margen %</option>
                </select>
                <button
                  onClick={exportarCSV}
                  disabled={lista.length === 0}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-slate-200 rounded-xl hover:bg-slate-50 disabled:opacity-40"
                  title="Exportar detalle a CSV (Excel)"
                >
                  <Download size={14} /> CSV
                </button>
              </div>
            </div>

            {lista.length === 0 ? (
              <div className="p-10 text-center text-slate-400 text-sm">
                {loading ? 'Cargando…' : 'No hay repuestos en órdenes entregadas para este período.'}
              </div>
            ) : (
              <>
                {/* Header (desktop) */}
                <div className="hidden md:grid grid-cols-[2rem_minmax(0,2.4fr)_0.8fr_1fr_1fr_1.1fr_0.8fr_1.5rem] gap-3 px-4 py-2.5 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <span>#</span>
                  <span>Repuesto</span>
                  <span className="text-right">Cantidad</span>
                  <span className="text-right">Precio prom.</span>
                  <span className="text-right">Costo prom.</span>
                  <span className="text-right">Utilidad</span>
                  <span className="text-right">Margen</span>
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
                              <p className="font-semibold text-slate-800 truncate" title={r.descripcion}>{r.descripcion}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <div className="h-1.5 bg-slate-100 rounded-full flex-1 max-w-[160px] overflow-hidden">
                                  <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${(r.cantidad / maxCantidad) * 100}%` }} />
                                </div>
                                <span className="text-[11px] text-slate-400">{r.ordenes} orden(es) · {dinero(r.ventaTotal)}</span>
                              </div>
                            </div>
                            <span className="text-right font-bold text-slate-900">{fmtNum(r.cantidad)}</span>
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
                              <p className="font-semibold text-slate-800 text-sm"><span className="text-slate-400 mr-1">{idx + 1}.</span>{r.descripcion}</p>
                              <span className="text-slate-400 shrink-0">{isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</span>
                            </div>
                            <div className="grid grid-cols-3 gap-2 mt-2 text-xs">
                              <div><p className="text-slate-400">Cantidad</p><p className="font-bold text-slate-900">{fmtNum(r.cantidad)}</p></div>
                              <div><p className="text-slate-400">Precio prom.</p><p className="font-semibold text-slate-700">{dinero(r.precioPromedio)}</p></div>
                              <div><p className="text-slate-400">Costo prom.</p><p className="font-semibold text-slate-700">{r.costoPromedio === null ? '—' : dinero(r.costoPromedio)}</p></div>
                              <div><p className="text-slate-400">Venta</p><p className="font-semibold text-slate-700">{dinero(r.ventaTotal)}</p></div>
                              <div><p className="text-slate-400">Utilidad</p><p className={`font-semibold ${r.utilidad === null ? 'text-slate-300' : r.utilidad >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{r.utilidad === null ? '—' : dinero(r.utilidad)}</p></div>
                              <div><p className="text-slate-400">Margen</p><p className={`font-semibold ${margenColor(r.margenPct)}`}>{r.margenPct === null ? '—' : `${r.margenPct.toFixed(1)}%`}</p></div>
                            </div>
                          </div>
                        </button>

                        {isOpen && (
                          <div className="bg-slate-50/70 border-t border-slate-100 px-4 py-4">
                            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-600 mb-3">
                              <span>Venta total: <b>{dinero(r.ventaTotal)}</b></span>
                              <span>Costo total: <b>{r.cantidadConCosto > 0 ? dinero(r.costoTotal) : '—'}</b></span>
                              <span>Unidades con costo: <b>{fmtNum(r.cantidadConCosto)} / {fmtNum(r.cantidad)}</b></span>
                            </div>
                            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                              <table className="w-full text-xs min-w-[720px]">
                                <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider text-[10px]">
                                  <tr>
                                    <th className="text-left px-3 py-2">Fecha</th>
                                    <th className="text-left px-3 py-2">Placa / Vehículo</th>
                                    <th className="text-left px-3 py-2">Cliente</th>
                                    <th className="text-right px-3 py-2">Cant.</th>
                                    <th className="text-right px-3 py-2">Precio unit.</th>
                                    <th className="text-right px-3 py-2">Venta</th>
                                    <th className="text-right px-3 py-2">Costo</th>
                                    <th className="text-right px-3 py-2">Utilidad</th>
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
                                      <td className="px-3 py-2 text-right">{fmtNum(d.cantidad)}</td>
                                      <td className="px-3 py-2 text-right">{dinero(d.precio_unitario)}</td>
                                      <td className="px-3 py-2 text-right font-semibold">{dinero(d.total)}</td>
                                      <td className="px-3 py-2 text-right">{d.costo === null ? <span className="text-amber-500" title="Sin costo registrado">Sin costo</span> : dinero(d.costo)}</td>
                                      <td className={`px-3 py-2 text-right font-semibold ${d.utilidad === null ? 'text-slate-300' : d.utilidad >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                        {d.utilidad === null ? '—' : dinero(d.utilidad)}
                                      </td>
                                      <td className="px-3 py-2 text-right">
                                        <Link to={`/${slug}/historial/${d.ingreso_id}`} className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-semibold" title="Ver orden">
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
                      {verTodos ? 'Ver solo el top 20' : `Ver todos (${lista.length})`}
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
