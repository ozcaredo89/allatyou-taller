import React, { useState, useEffect, useCallback } from 'react';
import {
  DollarSign, Wrench, CalendarDays, ChevronDown, Loader2, AlertCircle,
  CheckCircle, RefreshCw, Users, Percent, Zap
} from 'lucide-react';
import api from '../services/api';

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface Tecnico {
  id: string;
  nombre: string;
}

interface FilaLiquidacion {
  id: string;
  ingreso_id: string;
  tecnico_id: string;
  nombre_tecnico: string;
  placa: string;
  fecha_entrega: string;
  total_mano_obra: number;
  monto_comision: number;
  porcentaje_aplicado: number;
}

type RangoRapido = 'hoy' | 'semana' | 'mes' | 'personalizado';

// ── Utilidades ────────────────────────────────────────────────────────────────

const formatCOP = (val: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(val);

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });

function getRangoFechas(rango: RangoRapido, desde: string, hasta: string) {
  const hoy = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const toStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  if (rango === 'hoy') { const s = toStr(hoy); return { desde: s, hasta: s }; }
  if (rango === 'semana') {
    const lunes = new Date(hoy);
    lunes.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7));
    return { desde: toStr(lunes), hasta: toStr(hoy) };
  }
  if (rango === 'mes') {
    return { desde: toStr(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), hasta: toStr(hoy) };
  }
  return { desde, hasta };
}

// ── Componente Principal ──────────────────────────────────────────────────────

const ReporteLiquidaciones: React.FC = () => {
  // Filtros
  const [rangoRapido, setRangoRapido] = useState<RangoRapido>('mes');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [tecnicoId, setTecnicoId] = useState('');
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);

  // Datos
  const [filas, setFilas] = useState<FilaLiquidacion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Edición inline de porcentaje
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  // Asignación masiva
  const [bulkPct, setBulkPct] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkSuccess, setBulkSuccess] = useState(false);

  // ── Cargar técnicos ──────────────────────────────────────────────────────────
  useEffect(() => {
    api.get('/tecnicos').then(({ data }) => setTecnicos(data || [])).catch(() => {});
  }, []);

  // ── Cargar liquidaciones ─────────────────────────────────────────────────────
  const cargar = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { desde: d, hasta: h } = getRangoFechas(rangoRapido, desde, hasta);
      const params: any = { desde: d, hasta: h };
      if (tecnicoId) params.tecnico_id = tecnicoId;
      const { data } = await api.get('/liquidaciones', { params });
      setFilas(data || []);
    } catch (e: any) {
      setError(e.response?.data?.error || 'Error al cargar las liquidaciones.');
    } finally {
      setLoading(false);
    }
  }, [rangoRapido, desde, hasta, tecnicoId]);

  useEffect(() => { cargar(); }, [cargar]);

  // ── KPIs ─────────────────────────────────────────────────────────────────────
  const totalComisiones = filas.reduce((acc, f) => acc + f.monto_comision, 0);
  const totalManoObra   = filas.reduce((acc, f) => acc + f.total_mano_obra, 0);

  // ── Edición inline de PORCENTAJE ─────────────────────────────────────────────
  const startEdit = (fila: FilaLiquidacion) => {
    setEditingId(fila.id);
    // Mostrar sin decimales si es entero, o con 1 decimal
    const val = fila.porcentaje_aplicado % 1 === 0
      ? String(fila.porcentaje_aplicado)
      : fila.porcentaje_aplicado.toFixed(2);
    setEditValue(val);
  };

  const saveEdit = async (fila: FilaLiquidacion) => {
    const nuevoPct = parseFloat(editValue);
    if (isNaN(nuevoPct) || nuevoPct < 0 || nuevoPct > 100) { setEditingId(null); return; }
    if (nuevoPct === fila.porcentaje_aplicado) { setEditingId(null); return; }

    setSavingId(fila.id);
    setEditingId(null);
    try {
      const { data } = await api.put(`/liquidaciones/${fila.id}`, {
        porcentaje_aplicado: nuevoPct,
        total_mano_obra: fila.total_mano_obra,
      });
      // Actualizar fila con los valores reales devueltos por el servidor
      setFilas(prev => prev.map(f =>
        f.id === fila.id
          ? { ...f, porcentaje_aplicado: data.porcentaje_aplicado, monto_comision: data.monto_comision }
          : f
      ));
      setSavedId(fila.id);
      setTimeout(() => setSavedId(null), 2000);
    } catch {
      setError('Error al guardar el porcentaje. Intenta de nuevo.');
    } finally {
      setSavingId(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, fila: FilaLiquidacion) => {
    if (e.key === 'Enter') saveEdit(fila);
    if (e.key === 'Escape') setEditingId(null);
  };

  // ── Asignación Masiva ────────────────────────────────────────────────────────
  const bulkApply = async () => {
    const pct = parseFloat(bulkPct);
    if (isNaN(pct) || pct < 0 || pct > 100) {
      setError('Ingresa un porcentaje válido entre 0 y 100.');
      return;
    }
    if (filas.length === 0) return;

    // Construir el mensaje de confirmación con el contexto del filtro activo
    const { desde: d, hasta: h } = getRangoFechas(rangoRapido, desde, hasta);
    const nombreTecnico = tecnicoId
      ? (tecnicos.find(t => t.id === tecnicoId)?.nombre ?? 'Técnico seleccionado')
      : 'Todos los técnicos';
    const periodoLabel = rangoRapido === 'hoy' ? 'Hoy'
      : rangoRapido === 'semana' ? 'Esta Semana'
      : rangoRapido === 'mes' ? 'Este Mes'
      : `${d} al ${h}`;

    const ok = window.confirm(
      `⚠️ Asignación Masiva de Comisión\n\n` +
      `Porcentaje a aplicar: ${pct}%\n` +
      `Técnico(s): ${nombreTecnico}\n` +
      `Período: ${periodoLabel}\n` +
      `Registros afectados: ${filas.length}\n\n` +
      `¿Confirmas que deseas sobreescribir las comisiones de estos ${filas.length} registros?`
    );
    if (!ok) return;

    setBulkSaving(true);
    setError('');
    try {
      const payload = filas.map(f => ({ id: f.id, total_mano_obra: f.total_mano_obra }));
      const { data } = await api.put('/liquidaciones/bulk', {
        porcentaje_aplicado: pct,
        filas: payload,
      });

      // Actualizar el estado local con los valores confirmados por el servidor
      const updatedMap: Record<string, { porcentaje_aplicado: number; monto_comision: number }> = {};
      (data.rows || []).forEach((r: any) => { updatedMap[r.id] = r; });

      setFilas(prev => prev.map(f =>
        updatedMap[f.id]
          ? { ...f, porcentaje_aplicado: updatedMap[f.id].porcentaje_aplicado, monto_comision: updatedMap[f.id].monto_comision }
          : f
      ));

      setBulkSuccess(true);
      setBulkPct('');
      setTimeout(() => setBulkSuccess(false), 3000);
    } catch (e: any) {
      setError(e.response?.data?.error || 'Error en la asignación masiva.');
    } finally {
      setBulkSaving(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-16">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
            <div className="p-2 bg-violet-100 rounded-xl">
              <DollarSign className="text-violet-600 w-7 h-7" />
            </div>
            Liquidador de Técnicos
          </h1>
          <p className="text-slate-500 mt-1 ml-1">Comisiones sobre mano de obra · Edita el % individual directamente en la tabla</p>
        </div>
        <button
          onClick={cargar}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-700 transition-colors disabled:opacity-50"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl flex items-center gap-3">
          <AlertCircle size={18} /><span>{error}</span>
        </div>
      )}

      {/* Filtros */}
      <section className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 space-y-4">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Filtros</h2>
        <div className="flex flex-wrap gap-3 items-end">
          {/* Rango rápido */}
          <div className="flex gap-1 p-1 bg-slate-100 rounded-xl">
            {(['hoy', 'semana', 'mes', 'personalizado'] as RangoRapido[]).map(r => (
              <button
                key={r}
                onClick={() => setRangoRapido(r)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  rangoRapido === r ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {r === 'semana' ? 'Esta Semana' : r === 'mes' ? 'Este Mes' : r === 'hoy' ? 'Hoy' : 'Personalizado'}
              </button>
            ))}
          </div>

          {/* Fechas personalizadas */}
          {rangoRapido === 'personalizado' && (
            <div className="flex items-center gap-2">
              {[['Desde', desde, setDesde], ['Hasta', hasta, setHasta]].map(([label, val, setter]: any) => (
                <div key={label} className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-500">{label}</label>
                  <input type="date" value={val} onChange={e => setter(e.target.value)}
                    className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-violet-500 outline-none" />
                </div>
              ))}
            </div>
          )}

          {/* Combobox técnico */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">Técnico</label>
            <div className="relative">
              <select value={tecnicoId} onChange={e => setTecnicoId(e.target.value)}
                className="appearance-none border border-slate-300 rounded-lg px-3 py-2 pr-8 text-sm focus:ring-2 focus:ring-violet-500 outline-none bg-white min-w-[180px]">
                <option value="">Todos los técnicos</option>
                {tecnicos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </select>
              <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
          </div>
        </div>
      </section>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-violet-600 text-white rounded-2xl p-6 shadow-lg shadow-violet-200">
          <p className="text-sm font-medium text-violet-200">Total Comisiones a Pagar</p>
          <p className="text-3xl font-bold mt-2 tracking-tight">{formatCOP(totalComisiones)}</p>
          <p className="text-xs text-violet-300 mt-1 flex items-center gap-1"><DollarSign size={12} /> Suma del período seleccionado</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Total Mano de Obra Generada</p>
          <p className="text-3xl font-bold mt-2 text-slate-900 tracking-tight">{formatCOP(totalManoObra)}</p>
          <p className="text-xs text-slate-400 mt-1 flex items-center gap-1"><Wrench size={12} /> Base de cálculo de comisiones</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Registros en el Período</p>
          <p className="text-3xl font-bold mt-2 text-slate-900 tracking-tight">{filas.length}</p>
          <p className="text-xs text-slate-400 mt-1 flex items-center gap-1"><Users size={12} /> Asignaciones técnico-servicio</p>
        </div>
      </div>

      {/* Tabla */}
      <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
          <CalendarDays size={18} className="text-slate-400" />
          <h2 className="font-semibold text-slate-800">Detalle de Comisiones</h2>
          <span className="ml-auto text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{filas.length} registros</span>
        </div>

        {/* Barra de Asignación Masiva */}
        {filas.length > 0 && (
          <div className={`px-6 py-3 border-b flex items-center gap-3 flex-wrap ${
            bulkSuccess
              ? 'bg-emerald-50 border-emerald-200'
              : 'bg-amber-50 border-amber-200'
          }`}>
            <div className="flex items-center gap-2">
              <Zap size={16} className={bulkSuccess ? 'text-emerald-600' : 'text-amber-600'} />
              <span className={`text-sm font-semibold ${
                bulkSuccess ? 'text-emerald-800' : 'text-amber-800'
              }`}>
                {bulkSuccess ? '✓ Aplicado correctamente' : 'Asignación Masiva'}
              </span>
            </div>
            {!bulkSuccess && (
              <>
                <span className="text-xs text-amber-600">
                  Aplicar a los {filas.length} registros visibles:
                </span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    placeholder="Ej: 25"
                    value={bulkPct}
                    onChange={e => setBulkPct(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && bulkApply()}
                    className="w-20 border-2 border-amber-300 rounded-lg px-2 py-1.5 text-sm font-bold text-center focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                  />
                  <Percent size={13} className="text-amber-500" />
                </div>
                <button
                  onClick={bulkApply}
                  disabled={bulkSaving || !bulkPct}
                  className="flex items-center gap-2 px-4 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold rounded-lg transition-colors disabled:opacity-50"
                >
                  {bulkSaving
                    ? <><Loader2 size={14} className="animate-spin" /> Aplicando...</>
                    : <><Zap size={14} /> Aplicar a todos</>}
                </button>
              </>
            )}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={32} className="animate-spin text-violet-500" />
          </div>
        ) : filas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <DollarSign size={48} className="mb-3 opacity-30" />
            <p className="font-medium">No hay registros en este período</p>
            <p className="text-sm mt-1">Ajusta los filtros o entrega un vehículo con técnicos asignados</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Fecha Entrega</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Técnico</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Vehículo</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Total MO de la OS</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Comisión Asignada
                    <span className="ml-1 text-violet-400 normal-case font-normal">(% editable)</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filas.map(fila => (
                  <tr key={fila.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-6 py-4 text-slate-600 whitespace-nowrap">{formatDate(fila.fecha_entrega)}</td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-2 font-medium text-slate-800">
                        <div className="w-7 h-7 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center font-bold text-xs uppercase">
                          {fila.nombre_tecnico.charAt(0)}
                        </div>
                        {fila.nombre_tecnico}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-mono font-bold text-slate-800 tracking-wider bg-slate-100 px-2 py-0.5 rounded">
                        {fila.placa}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right font-medium text-slate-700">
                      {formatCOP(fila.total_mano_obra)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {savingId === fila.id ? (
                        <span className="flex items-center justify-end gap-2 text-slate-400">
                          <Loader2 size={14} className="animate-spin" /> Guardando...
                        </span>
                      ) : savedId === fila.id ? (
                        <span className="flex items-center justify-end gap-2 text-emerald-600 font-semibold">
                          <CheckCircle size={15} />
                          <span className="text-emerald-700 font-bold">{fila.porcentaje_aplicado}%</span>
                          <span className="text-slate-500">→</span>
                          <span>{formatCOP(fila.monto_comision)}</span>
                        </span>
                      ) : editingId === fila.id ? (
                        <div className="flex items-center justify-end gap-1">
                          <input
                            autoFocus
                            type="number"
                            min="0"
                            max="100"
                            step="0.5"
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            onBlur={() => saveEdit(fila)}
                            onKeyDown={e => handleKeyDown(e, fila)}
                            className="w-20 text-right border-2 border-violet-400 rounded-lg px-2 py-1.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-violet-300 bg-violet-50"
                          />
                          <Percent size={14} className="text-violet-500" />
                        </div>
                      ) : (
                        <button
                          onClick={() => startEdit(fila)}
                          className="inline-flex items-center gap-2 font-semibold text-violet-700 hover:text-violet-900 hover:bg-violet-50 px-3 py-1.5 rounded-lg transition-all group"
                          title="Clic para editar el porcentaje"
                        >
                          <span className="text-violet-500 font-bold text-base">
                            {fila.porcentaje_aplicado % 1 === 0
                              ? `${fila.porcentaje_aplicado}%`
                              : `${fila.porcentaje_aplicado.toFixed(2)}%`}
                          </span>
                          <span className="text-slate-400 font-normal">→</span>
                          <span className="text-slate-700">{formatCOP(fila.monto_comision)}</span>
                          <span className="text-xs text-violet-300 group-hover:text-violet-500 transition-colors">✏️</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};

export default ReporteLiquidaciones;
