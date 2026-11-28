import appI18n, { displayLocale } from '../i18n';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { isAxiosError } from 'axios';
import { Link, useParams } from 'react-router-dom';
import api from '../services/api';
import { aLitros, factorLitros, litrosPorTarro, mostrarCuartos, pluralVolumen, type UnidadVolumen } from '../utils/volumenInventario';
import { bogotaToday } from '../utils/dateUtils';

export interface ProductoInventario {
  id: string;
  codigo: string;
  nombre: string;
  categoria: string | null;
  unidad: string;
  precio_venta: number;
  costo_promedio: number;
  stock_actual: number;
  stock_minimo: number;
  stock_comprometido: number;
  aceite_ordenes_abiertas?: number;
  stock_pendiente_entrega?: number;
  activo: boolean;
  es_granel?: boolean;
  capacidad_envase?: number | null;
  tipo_producto?: 'repuesto' | 'aceite';
  viscosidad?: string | null;
  base_aceite?: string | null;
  marca?: string | null;
  especificacion?: string | null;
  contenido_litros?: number | null;
  presentacion_bloqueada?: boolean;
}

const tipos = ['ENTRADA', 'AJUSTE', 'SALIDA_VENTA', 'SALIDA_ORDEN', 'ANULACION'] as const;
const vistas = {
  Repuestos: 'parts',
  Aceites: 'oil',
  Movimientos: 'movements',
  'Stock crítico': 'critical_stock',
  'Descuentos pendientes': 'pending_deductions',
} as const;

type Tipo = typeof tipos[number];
type Movimiento = {
  id: string;
  tipo: Tipo;
  cantidad: number;
  presentacion?: 'tambor' | 'galón' | 'cuarto' | 'litro' | null;
  cantidad_presentacion?: number | null;
  costo_unitario: number;
  precio_unitario: number | null;
  proveedor: string | null;
  factura_ref: string | null;
  notas: string | null;
  usuario_email: string;
  created_at: string;
  gasto_id: string | null;
  anula_movimiento_id: string | null;
  anulado: boolean;
  taller_inventario_items: { codigo: string; nombre: string };
};

type Modal = { tipo: 'producto'; producto?: ProductoInventario }
  | { tipo: 'ENTRADA' | 'AJUSTE' | 'SALIDA_VENTA' | 'MEDICION'; producto: ProductoInventario }
  | { tipo: 'ANULACION'; movimiento: Movimiento };

const campo = 'block w-full rounded-lg border border-slate-300 bg-white px-3 py-2';
const boton = 'rounded-lg border border-slate-300 px-3 py-2 hover:bg-slate-50 disabled:opacity-50';
const principal = 'rounded-lg bg-indigo-600 px-3 py-2 font-medium text-white hover:bg-indigo-700 disabled:opacity-50';
const numero = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 3 });
const moneda = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 2 });
const fecha = (date: Date) => new Intl.DateTimeFormat(displayLocale(), { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Bogota' }).format(date);
const basesAceite: Record<string, string> = { mineral: 'Mineral', semisintetico: 'Semisintético', sintetico: 'Sintético' };

function formatoMedicion(litros: number, unidad: UnidadVolumen) {
  const valor = Math.round(litros / factorLitros[unidad] * 1000) / 1000 || 0;
  return `${numero.format(valor)} ${Math.abs(valor) === 1 ? unidad : pluralVolumen[unidad]}`;
}

function precioPorUnidad(precioLitro: number, unidad: UnidadVolumen) {
  return Math.round(precioLitro * factorLitros[unidad] * 100) / 100;
}

interface ResumenAceites {
  viscosidades: { viscosidad: string; ordenes: number; mostrador: number }[];
  merma_cuartos: string;
  merma_pct: string | null;
  margen_promedio: string | null;
  ordenes_con_costo: number;
}

function ResumenDeAceites() {
  const [hasta, setHasta] = useState(() => bogotaToday());
  const [desde, setDesde] = useState(() => `${bogotaToday().slice(0, 7)}-01`);
  const [resumen, setResumen] = useState<ResumenAceites | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!desde || !hasta || desde > hasta) return;
    const abort = new AbortController();
    api.get<ResumenAceites>('/inventario/aceites/resumen', { params: { desde, hasta }, signal: abort.signal })
      .then(({ data }) => setResumen(data)).catch(error => { if (!abort.signal.aborted) setError(mensaje(error)); });
    return () => abort.abort();
  }, [desde, hasta]);
  function cambiarFecha(guardar: (valor: string) => void, valor: string) {
    setResumen(null);
    setError('');
    guardar(valor);
  }
  return <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-4" aria-labelledby="resumen-aceites">
    <h2 id="resumen-aceites" className="text-lg font-semibold">{appI18n.t("ui.Inventario.oil_inventory_summary")}</h2>
    <div className="flex flex-wrap gap-3">
      <Campo label={appI18n.t("ui.Inventario.sales_from")}><input className={campo} type="date" value={desde} onChange={e => cambiarFecha(setDesde, e.target.value)} /></Campo>
      <Campo label={appI18n.t("ui.Inventario.sales_through")}><input className={campo} type="date" value={hasta} onChange={e => cambiarFecha(setHasta, e.target.value)} /></Campo>
    </div>
    {error ? <p role="alert">{error}</p> : !desde || !hasta || desde > hasta ? <p>{appI18n.t("ui.Inventario.select_a_valid_date_range")}</p>
      : !resumen ? <p role="status">{appI18n.t("ui.Inventario.loading_summary")}</p> : <>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-lg bg-amber-50 p-3">{appI18n.t("ui.Inventario.inventory_loss")} <strong>{numero.format(Number(resumen.merma_cuartos))} {appI18n.t("ui.Inventario.quarts")}</strong><div className="text-sm">{resumen.merma_pct == null ? appI18n.t("ui.Inventario.no_sales_for_comparison") : `${numero.format(Number(resumen.merma_pct))} % de lo vendido`}</div></div>
          <div className="rounded-lg bg-emerald-50 p-3">{appI18n.t("ui.Inventario.average_margin_per_oil_change")} <strong>{resumen.margen_promedio == null ? '—' : moneda.format(Number(resumen.margen_promedio))}</strong><div className="text-sm">{resumen.ordenes_con_costo} {appI18n.t("ui.Inventario.orders_with_complete_costs")}</div></div>
        </div>
        <table className="w-full text-left text-sm [&_td]:py-2 [&_th]:py-2">
          <thead><tr><th>{appI18n.t("ui.Inventario.viscosity")}</th><th>{appI18n.t("ui.Inventario.orders_quarts")}</th><th>{appI18n.t("ui.Inventario.counter_sales_quarts")}</th></tr></thead>
          <tbody>{resumen.viscosidades.map(v => <tr key={v.viscosidad} className="border-t"><td>{v.viscosidad}</td><td>{numero.format(v.ordenes)}</td><td>{numero.format(v.mostrador)}</td></tr>)}</tbody>
        </table>
      </>}
  </section>;
}

function NivelGranel({ stock, capacidad }: { stock: number; capacidad: number }) {
  const mililitros = Math.round(stock * 1000);
  const capacidadMl = Math.round(capacidad * 1000);
  const tambores = Math.floor(mililitros / capacidadMl);
  const resto = mililitros % capacidadMl / 1000;
  return <div className="mt-1 min-w-36 space-y-1 text-xs text-slate-600">
    <div>{tambores} {tambores === 1 ? appI18n.t("ui.Inventario.drum") : appI18n.t("ui.Inventario.drums")} {appI18n.t("ui.Inventario.full")}</div>
    <progress aria-label={appI18n.t("ui.Inventario.level_in_current_drum")} className="block h-2 w-full accent-indigo-600" value={resto} max={capacidad} />
    <div>{appI18n.t("ui.Inventario.current_drum")} {Math.round(resto / capacidad * 100)} %</div>
  </div>;
}

function Campo({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block space-y-1 text-sm font-medium"><span>{label}</span>{children}</label>;
}

function mensaje(error: unknown) {
  return isAxiosError(error) ? error.response?.data?.error || appI18n.t('ui.Inventario.access_error') : appI18n.t('ui.Inventario.access_error');
}

interface DescuentoPendiente {
  ingreso_id: string;
  linea_id: string;
  producto: string;
  cantidad: number;
  stock_actual: number;
}

function DescuentosPendientes() {
  const { slug } = useParams();
  const [pagina, setPagina] = useState(1);
  const [data, setData] = useState<{ pendientes: DescuentoPendiente[]; paginas: number } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const abort = new AbortController();
    api.get('/inventario/pendientes', { params: { pagina }, signal: abort.signal })
      .then(({ data }) => setData(data))
      .catch(error => { if (!abort.signal.aborted) setError(mensaje(error)); });
    return () => abort.abort();
  }, [pagina]);

  function cambiarPagina(nueva: number) {
    setError('');
    setData(null);
    setPagina(nueva);
  }

  if (error) return <p role="alert" className="text-red-700">{error}</p>;
  if (!data) return <p role="status">{appI18n.t("ui.Inventario.loading_pending_stock_deductions")}</p>;
  return (
    <>
      {data.pendientes.length === 0 ? <p className="text-slate-600">{appI18n.t("ui.Inventario.no_pending_stock_deductions_on_this_page")}</p> : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm [&_td]:p-3 [&_th]:p-3">
            <thead className="bg-slate-50"><tr><th>{appI18n.t("ui.Inventario.product")}</th><th>{appI18n.t("crm.estado_pendiente")}</th><th>{appI18n.t("ui.Inventario.stock_on_hand_2")}</th><th>{appI18n.t("ui.Inventario.order")}</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{data.pendientes.map(pendiente => (
              <tr key={`${pendiente.ingreso_id}-${pendiente.linea_id}`}>
                <td>{pendiente.producto}</td><td>{numero.format(pendiente.cantidad)}</td>
                <td>{numero.format(pendiente.stock_actual)}</td>
                <td><Link className="font-medium text-indigo-700 underline" to={`/${slug}/checkout/${pendiente.ingreso_id}?edit=true`}>{appI18n.t("ui.Inventario.open_order")}</Link></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {(data.paginas > 1 || pagina > 1) && <div className="flex items-center gap-3">
        <button className={boton} disabled={pagina <= 1} onClick={() => cambiarPagina(pagina - 1)}>{appI18n.t("ui.Inventario.previous")}</button>
        <span>{appI18n.t("ui.Inventario.page")} {pagina}</span>
        <button className={boton} disabled={pagina >= data.paginas} onClick={() => cambiarPagina(pagina + 1)}>{appI18n.t("ui.Inventario.next")}</button>
      </div>}
    </>
  );
}

export default function Inventario() {
  const [items, setItems] = useState<ProductoInventario[]>([]);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [tab, setTab] = useState<keyof typeof vistas>('Repuestos');
  const [busqueda, setBusqueda] = useState('');
  const [filtros, setFiltros] = useState({ tipo: '', item_id: '', desde: '', hasta: '' });
  const [pagina, setPagina] = useState(1);
  const [paginas, setPaginas] = useState(0);
  const [version, setVersion] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [cargandoMovimientos, setCargandoMovimientos] = useState(false);
  const [error, setError] = useState('');
  const [errorMovimientos, setErrorMovimientos] = useState('');
  const [modal, setModal] = useState<Modal | null>(null);
  const [errorModal, setErrorModal] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [esGranel, setEsGranel] = useState(false);
  const [tipoProducto, setTipoProducto] = useState<'aceite' | 'repuesto'>('repuesto');
  const [unidadMinimo, setUnidadMinimo] = useState<'cuarto' | 'galón'>('cuarto');
  const [minimo, setMinimo] = useState('0');
  const [presentacion, setPresentacion] = useState<'tambor' | 'galón' | 'cuarto' | 'litro'>('tambor');
  const [cantidadCompra, setCantidadCompra] = useState('1');
  const [medido, setMedido] = useState('');
  const [despachado, setDespachado] = useState('');
  const [unidadMedicion, setUnidadMedicion] = useState<UnidadVolumen>('cuarto');
  const [precioVenta, setPrecioVenta] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const operacion = useRef('');

  useEffect(() => {
    const abort = new AbortController();
    api.get<ProductoInventario[]>('/inventario/items', { signal: abort.signal })
      .then(({ data }) => { setItems(data); setError(''); })
      .catch(error => { if (!abort.signal.aborted) setError(mensaje(error)); })
      .finally(() => { if (!abort.signal.aborted) setCargando(false); });
    return () => abort.abort();
  }, [version]);

  useEffect(() => {
    if (tab !== 'Movimientos') return;
    const abort = new AbortController();
    const params = Object.fromEntries(Object.entries({ ...filtros, pagina }).filter(([, value]) => value !== ''));
    api.get<{ movimientos: Movimiento[]; paginas: number }>('/inventario/movimientos', { params, signal: abort.signal })
      .then(({ data }) => { setMovimientos(data.movimientos); setPaginas(data.paginas); setErrorMovimientos(''); })
      .catch(error => { if (!abort.signal.aborted) setErrorMovimientos(mensaje(error)); })
      .finally(() => { if (!abort.signal.aborted) setCargandoMovimientos(false); });
    return () => abort.abort();
  }, [tab, filtros, pagina, version]);

  useEffect(() => {
    if (modal) dialog.current?.showModal();
    else dialog.current?.close();
  }, [modal]);

  function abrir(formulario: Modal) {
    operacion.current = crypto.randomUUID();
    setErrorModal('');
    setEsGranel(formulario.tipo === 'producto' && !!formulario.producto?.es_granel);
    setTipoProducto(formulario.tipo === 'producto' ? formulario.producto?.tipo_producto ?? (tab === 'Aceites' ? 'aceite' : 'repuesto') : 'repuesto');
    setUnidadMinimo('cuarto');
    setMinimo(formulario.tipo === 'producto' && formulario.producto
      ? String(formulario.producto.es_granel ? Math.round(formulario.producto.stock_minimo / factorLitros.cuarto * 1000) / 1000 : formulario.producto.stock_minimo) : '0');
    setPresentacion(formulario.tipo === 'SALIDA_VENTA' ? 'cuarto' : 'tambor');
    setCantidadCompra('1');
    setMedido('');
    setDespachado('');
    setUnidadMedicion('cuarto');
    setPrecioVenta(formulario.tipo === 'SALIDA_VENTA' ? String(precioPorUnidad(formulario.producto.precio_venta, 'cuarto')) : '');
    setModal(formulario);
  }

  async function guardar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!modal || guardando) return;
    const form = new FormData(event.currentTarget);
    const valor = (nombre: string) => String(form.get(nombre) ?? '').trim();
    const importe = (nombre: string) => Number(valor(nombre));
    setGuardando(true);
    setErrorModal('');
    try {
      if (modal.tipo === 'producto') {
        const data = {
          codigo: valor('codigo'), nombre: valor('nombre'), categoria: valor('categoria'),
          unidad: presentacionBloqueada ? producto?.unidad : tipoProducto === 'aceite' ? esGranel ? 'litro' : 'und' : valor('unidad'),
          tipo_producto: tipoProducto, es_granel: esGranel,
          capacidad_envase: esGranel ? presentacionBloqueada ? producto?.capacidad_envase : importe('capacidad_envase') : null,
          viscosidad: valor('viscosidad'), base_aceite: valor('base_aceite'), marca: valor('marca'), especificacion: valor('especificacion'),
          contenido_litros: tipoProducto === 'aceite' && !esGranel ? presentacionBloqueada ? producto?.contenido_litros : importe('contenido_litros') : null,
          precio_venta: importe('precio_venta'), stock_minimo: esGranel ? aLitros(importe('stock_minimo'), unidadMinimo) : importe('stock_minimo'), activo: form.has('activo'),
        };
        if (modal.producto) await api.put(`/inventario/items/${modal.producto.id}`, data);
        else await api.post('/inventario/items', data);
      } else if (modal.tipo === 'ANULACION') {
        await api.post(`/inventario/movimientos/${modal.movimiento.id}/anular`, { notas: valor('notas') });
      } else if (modal.tipo === 'MEDICION') {
        await api.post('/inventario/movimientos', {
          operacion_id: operacion.current, tipo: 'AJUSTE', item_id: modal.producto.id,
          stock_medido: litrosMedidos, stock_esperado: modal.producto.stock_actual, notas: valor('notas'),
          litros_despachados_sin_descontar: Math.round((pendienteEntregado + litrosUsados) * 1000) / 1000,
          por_descontar_esperado: porDescontar,
        });
      } else {
        if (modal.tipo === 'ENTRADA' && form.has('registrar_gasto') &&
            Math.round(importe('cantidad') * importe('costo_unitario') * 100) <= 0) {
          setErrorModal(appI18n.t('ui.Inventario.expense_minimum'));
          return;
        }
        const cantidadCapturada = importe('cantidad');
        const factor = compraGranel
          ? presentacion === 'tambor' ? modal.producto.capacidad_envase ?? 0 : factorLitros[presentacion]
          : 1;
        const cantidad = compraGranel ? Math.round(cantidadCapturada * factor * 1000) / 1000
          : ventaGranel && presentacion !== 'tambor' ? aLitros(cantidadCapturada, presentacion) : cantidadCapturada;
        const costoCapturado = valor('costo_unitario') === '' ? undefined : importe('costo_unitario');
        if (compraGranel && cantidad <= 0) {
          setErrorModal('La compra debe equivaler al menos a 0,001 litros.');
          return;
        }
        await api.post('/inventario/movimientos', {
          operacion_id: operacion.current, tipo: modal.tipo, item_id: modal.producto.id, cantidad,
          costo_unitario: compraGranel && costoCapturado !== undefined ? costoCapturado * cantidadCapturada / cantidad : costoCapturado,
          precio_unitario: modal.tipo === 'SALIDA_VENTA' ? ventaGranel
            ? Number(precioVenta) === precioPorUnidad(modal.producto.precio_venta, unidadVenta)
              ? modal.producto.precio_venta : Math.round(Number(precioVenta) / factorLitros[unidadVenta] * 100) / 100
            : importe('precio_unitario') : undefined,
          registrar_gasto: form.has('registrar_gasto'), proveedor: valor('proveedor'),
          factura_ref: valor('factura_ref'), notas: valor('notas'),
          ...(compraGranel ? { presentacion, cantidad_presentacion: cantidadCapturada, costo_presentacion: costoCapturado } : {}),
          ...(ventaGranel ? { unidad_captura_venta: unidadVenta, cantidad_captura_venta: cantidadCapturada, precio_captura_venta: Number(precioVenta) } : {}),
        });
      }
      setModal(null);
      if (tab === 'Movimientos') setCargandoMovimientos(true);
      setVersion(v => v + 1);
    } catch (error) {
      setErrorModal(mensaje(error));
      if (modal.tipo === 'MEDICION' && isAxiosError(error) && error.response?.status === 409) setVersion(v => v + 1);
    } finally {
      setGuardando(false);
    }
  }

  const stockCritico = (item: ProductoInventario) => item.activo && item.stock_minimo > 0 && item.stock_actual <= item.stock_minimo;
  const visibles = items.filter(item => {
    const coincide = `${item.codigo} ${item.nombre} ${item.categoria ?? ''} ${item.viscosidad ?? ''} ${item.marca ?? ''}`.toLowerCase().includes(busqueda.trim().toLowerCase());
    return coincide && (tab === 'Aceites' ? item.tipo_producto === 'aceite'
      : tab === 'Repuestos' ? item.tipo_producto !== 'aceite' : tab !== 'Stock crítico' || stockCritico(item));
  });
  const producto = modal && 'producto' in modal ? modal.producto : undefined;
  const presentacionBloqueada = modal?.tipo === 'producto' && !!producto && (!!producto.presentacion_bloqueada || producto.stock_actual !== 0);
  const compraGranel = modal?.tipo === 'ENTRADA' && modal.producto.es_granel;
  const ventaGranel = modal?.tipo === 'SALIDA_VENTA' && modal.producto.es_granel;
  const unidadVenta: UnidadVolumen = presentacion === 'tambor' ? 'cuarto' : presentacion;
  const litrosVenta = aLitros(Number(cantidadCompra), unidadVenta);
  const totalVenta = Math.round(Math.round(Number(cantidadCompra) * 1000) * Math.round(Number(precioVenta) * 100) / 1000) / 100;
  const litrosMedidos = aLitros(Number(medido), unidadMedicion);
  const litrosUsados = aLitros(Number(despachado), unidadMedicion);
  const litrosCompra = compraGranel ? Number(cantidadCompra) * (presentacion === 'tambor' ? modal.producto.capacidad_envase ?? 0 : factorLitros[presentacion]) : 0;
  const pendienteEntregado = modal?.tipo === 'MEDICION' ? modal.producto.stock_pendiente_entrega ?? 0 : 0;
  const abierto = modal?.tipo === 'MEDICION' ? modal.producto.aceite_ordenes_abiertas ?? 0 : 0;
  const porDescontar = modal?.tipo === 'MEDICION'
    ? Math.round(((modal.producto.aceite_ordenes_abiertas ?? 0) + (modal.producto.stock_pendiente_entrega ?? 0)) * 1000) / 1000 : 0;
  const variacion = modal?.tipo === 'MEDICION' && medido !== '' && (abierto === 0 || despachado !== '')
    ? Math.round((litrosMedidos + pendienteEntregado + litrosUsados - modal.producto.stock_actual) * 1000) / 1000 : null;

  return (
    <main className="mx-auto max-w-7xl space-y-5 px-4 py-6 text-slate-900">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{appI18n.t("ui.Inventario.inventory")}</h1>
        <button className={principal} onClick={() => abrir({ tipo: 'producto' })}>{tab === 'Aceites' ? appI18n.t("ui.Inventario.new_oil_product") : appI18n.t("ui.Inventario.new_product")}</button>
      </header>
      <nav aria-label={appI18n.t("ui.Inventario.inventory_views")} className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        {(Object.keys(vistas) as (keyof typeof vistas)[]).map(vista => (
          <button key={vista} type="button" aria-pressed={tab === vista} className={tab === vista ? principal : boton}
            onClick={() => { setTab(vista); if (vista === 'Movimientos' && tab !== vista) setCargandoMovimientos(true); }}>{appI18n.t(`ui.Inventario.${vistas[vista]}`)}</button>
        ))}
      </nav>
      {error && <p role="alert" className="text-red-700">{error} <button className="underline" onClick={() => setVersion(v => v + 1)}>{appI18n.t("ui.Inventario.retry")}</button></p>}
      {tab === 'Descuentos pendientes' ? <DescuentosPendientes /> : tab === 'Movimientos' ? (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <Campo label={appI18n.t("ui.Inventario.type")}><select className={campo} value={filtros.tipo} onChange={e => cambiarFiltro('tipo', e.target.value)}>
              <option value="">{appI18n.t("ui.Inventario.all")}</option>{tipos.map((tipo) => <option key={tipo} value={tipo}>{appI18n.t(`ui.Inventario.${tipo}`)}</option>)}
            </select></Campo>
            <Campo label={appI18n.t("ui.Inventario.product")}><select className={campo} value={filtros.item_id} onChange={e => cambiarFiltro('item_id', e.target.value)}>
              <option value="">{appI18n.t("ui.Inventario.all")}</option>{items.map(item => <option key={item.id} value={item.id}>{item.codigo} · {item.nombre}</option>)}
            </select></Campo>
            <Campo label={appI18n.t("ui.Inventario.from")}><input className={campo} type="date" value={filtros.desde} onChange={e => cambiarFiltro('desde', e.target.value)} /></Campo>
            <Campo label={appI18n.t("ui.Inventario.to")}><input className={campo} type="date" value={filtros.hasta} onChange={e => cambiarFiltro('hasta', e.target.value)} /></Campo>
          </div>
          {errorMovimientos && <p role="alert" className="text-red-700">{errorMovimientos}</p>}
          {cargandoMovimientos ? <p role="status">{appI18n.t("ui.Inventario.loading_movements")}</p> : !errorMovimientos && (
            movimientos.length ? (
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                <table className="w-full text-left text-sm [&_td]:px-3 [&_td]:py-3 [&_th]:p-3">
                  <thead className="bg-slate-50"><tr><th>{appI18n.t("ui.Inventario.date")}</th><th>{appI18n.t("ui.Inventario.product")}</th><th>{appI18n.t("ui.Inventario.type")}</th><th>{appI18n.t("ui.Inventario.quantity")}</th><th>{appI18n.t("ui.Inventario.unit_cost")}</th><th>{appI18n.t("ui.Inventario.unit_price")}</th><th>{appI18n.t("ui.Inventario.details")}</th><th>{appI18n.t("ui.Inventario.actions")}</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">{movimientos.map(m => (
                    <tr key={m.id}>
                      <td>{fecha(new Date(m.created_at))}</td><td>{m.taller_inventario_items.nombre}<div className="text-xs text-slate-500">{m.taller_inventario_items.codigo}</div></td>
                      <td>{appI18n.t(`ui.Inventario.${m.tipo}`)}{m.anulado && <div className="text-xs text-slate-500">{appI18n.t("ui.Inventario.voided")}</div>}</td>
                      <td>{m.presentacion && m.cantidad_presentacion != null
                        ? `${m.tipo === 'ANULACION' ? 'Reversión de ' : ''}${numero.format(m.cantidad_presentacion)} ${m.cantidad_presentacion === 1 ? m.presentacion : pluralVolumen[m.presentacion]} (${numero.format(m.cantidad)} L de stock)`
                        : numero.format(m.cantidad)}</td><td>{moneda.format(m.costo_unitario)}</td><td>{m.precio_unitario === null ? '—' : moneda.format(m.precio_unitario)}</td>
                      <td><div>{m.usuario_email}</div><div className="text-xs text-slate-500">{[m.proveedor, m.factura_ref, m.notas, m.gasto_id && (m.anulado || m.tipo === 'ANULACION' ? appI18n.t('ui.Inventario.expense_voided') : appI18n.t('ui.Inventario.expense_linked'))].filter(Boolean).join(' · ')}</div></td>
                      <td>{!m.anulado && !['ANULACION', 'SALIDA_ORDEN'].includes(m.tipo) && <button className={boton} onClick={() => abrir({ tipo: 'ANULACION', movimiento: m })}>{appI18n.t("ui.Inventario.void")}</button>}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            ) : <p className="text-slate-600">{appI18n.t("ui.Inventario.no_movements_match_these_filters")}</p>
          )}
          {paginas > 1 && <div className="flex items-center gap-3">
            <button className={boton} disabled={pagina <= 1 || cargandoMovimientos} onClick={() => cambiarPagina(pagina - 1)}>{appI18n.t("ui.Inventario.previous")}</button>
            <span>{appI18n.t("ui.Inventario.page")} {pagina} {appI18n.t("ui.Inventario.of")} {paginas}</span>
            <button className={boton} disabled={pagina >= paginas || cargandoMovimientos} onClick={() => cambiarPagina(pagina + 1)}>{appI18n.t("ui.Inventario.next")}</button>
          </div>}
        </>
      ) : (
        <>
          <input className={`${campo} max-w-md`} placeholder={appI18n.t("ui.Inventario.search_by_code_name_or_category")} aria-label={appI18n.t("ui.Inventario.search_products")}
            value={busqueda} onChange={e => setBusqueda(e.target.value)} />
          {tab === 'Aceites' && <div className="grid gap-3 md:hidden">{visibles.map(item => (
            <article key={item.id} className="rounded-xl border bg-white p-4 space-y-2">
              <h2 className="font-semibold">{item.nombre}</h2>
              <p className="text-sm text-slate-600">{[item.viscosidad || 'Completar datos', basesAceite[item.base_aceite ?? ''], item.marca, item.es_granel ? 'Granel' : 'Tarro'].filter(Boolean).join(' · ')}</p>
              <p className="font-bold">{mostrarCuartos(item.es_granel ? item.stock_actual : item.stock_actual * litrosPorTarro(item.contenido_litros ?? 0))} {appI18n.t("ui.Inventario.in_stock")}</p>
              {!!item.es_granel && !!item.capacidad_envase && <NivelGranel stock={item.stock_actual} capacidad={item.capacidad_envase} />}
              <div className="flex flex-wrap gap-2 text-sm">
                {item.activo && <button className={boton} onClick={() => abrir({ tipo: 'ENTRADA', producto: item })}>{appI18n.t("ui.Inventario.purchase")}</button>}
                {item.es_granel && <button className={boton} onClick={() => abrir({ tipo: 'MEDICION', producto: item })}>{appI18n.t("ui.Inventario.measure_level")}</button>}
                {item.activo && <button className={boton} onClick={() => abrir({ tipo: 'SALIDA_VENTA', producto: item })}>{appI18n.t("ui.Inventario.sell")}</button>}
                <button className={boton} onClick={() => abrir({ tipo: 'producto', producto: item })}>{appI18n.t("ui.Inventario.edit")}</button>
              </div>
            </article>
          ))}</div>}
          {cargando ? <p role="status">{appI18n.t("ui.Inventario.loading_catalog")}</p> : visibles.length ? (
            <div className={`overflow-x-auto rounded-xl border border-slate-200 bg-white ${tab === 'Aceites' ? 'hidden md:block' : ''}`}>
              <table className="w-full text-left text-sm [&_td]:px-3 [&_td]:py-3 [&_th]:p-3">
                <thead className="bg-slate-50"><tr><th>{appI18n.t("ui.Inventario.product")}</th>{tab === 'Aceites' && <><th>{appI18n.t("ui.Inventario.viscosity")}</th><th>{appI18n.t("ui.Inventario.base_oil")}</th><th>{appI18n.t("ui.NuevoIngreso.make")}</th><th>{appI18n.t("ui.Inventario.packaging")}</th></>}<th>{appI18n.t("ui.Inventario.on_hand")}</th><th>{appI18n.t("ui.Inventario.committed")}</th><th>{appI18n.t("ui.Inventario.minimum")}</th><th>{appI18n.t("ui.Inventario.average_cost")}</th><th>{appI18n.t("ui.Inventario.sale_price")}</th><th>{appI18n.t("ui.Inventario.actions")}</th></tr></thead>
                <tbody className="divide-y divide-slate-100">{visibles.map(item => (
                  <tr key={item.id}>
                    <td><div className="font-semibold">{item.nombre}</div><div className="text-xs text-slate-500">{[item.codigo, item.categoria, !item.activo && 'Inactivo'].filter(Boolean).join(' · ')}</div></td>
                    {tab === 'Aceites' && <><td>{item.viscosidad || 'Completar datos'}</td><td>{basesAceite[item.base_aceite ?? ''] ?? '—'}</td><td>{item.marca || '—'}</td><td>{item.es_granel ? appI18n.t("ui.Inventario.bulk") : `Tarro · ${mostrarCuartos(item.contenido_litros ?? 0)}`}</td></>}
                    <td className={stockCritico(item) ? 'font-semibold text-amber-800' : ''}>{item.tipo_producto === 'aceite' ? <>
                      <strong>{mostrarCuartos(item.es_granel ? item.stock_actual : item.stock_actual * litrosPorTarro(item.contenido_litros ?? 0))}</strong>
                      <div className="text-xs text-slate-500">{numero.format((item.es_granel ? item.stock_actual : item.stock_actual * litrosPorTarro(item.contenido_litros ?? 0)) / factorLitros['galón'])} gal · {numero.format(item.es_granel ? item.stock_actual : item.stock_actual * (item.contenido_litros ?? 0))} L</div>
                    </> : <>{numero.format(item.stock_actual)} {item.unidad}</>}
                      {!!item.es_granel && !!item.capacidad_envase && <NivelGranel stock={item.stock_actual} capacidad={item.capacidad_envase} />}
                    </td>
                    <td>{item.es_granel ? mostrarCuartos(item.stock_comprometido) : numero.format(item.stock_comprometido)}</td><td>{item.es_granel ? mostrarCuartos(item.stock_minimo) : numero.format(item.stock_minimo)}</td>
                    <td>{moneda.format(item.costo_promedio)}</td><td>{moneda.format(item.precio_venta)}</td>
                    <td><div className="flex flex-wrap gap-2">
                      <button className={boton} onClick={() => abrir({ tipo: 'producto', producto: item })}>{appI18n.t("ui.Inventario.edit")}</button>
                      {item.activo && <button className={boton} onClick={() => abrir({ tipo: 'ENTRADA', producto: item })}>{appI18n.t("ui.Inventario.purchase")}</button>}
                      <button className={boton} onClick={() => abrir({ tipo: 'AJUSTE', producto: item })}>{appI18n.t("ui.Inventario.adjustment")}</button>
                      {item.es_granel && <button className={boton} onClick={() => abrir({ tipo: 'MEDICION', producto: item })}>{appI18n.t("ui.Inventario.measure_level")}</button>}
                      {item.activo && <button className={boton} onClick={() => abrir({ tipo: 'SALIDA_VENTA', producto: item })}>{appI18n.t("ui.Inventario.sell")}</button>}
                    </div></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : !error && <p className="text-slate-600">{tab === 'Stock crítico' ? appI18n.t('ui.Inventario.no_critical_stock') : appI18n.t('ui.Inventario.no_products')}</p>}
        </>
      )}
      {tab === 'Aceites' && <ResumenDeAceites key={version} />}
      <dialog ref={dialog} aria-labelledby="inventario-modal-titulo"
        className="m-auto max-h-[90vh] w-[min(92vw,32rem)] rounded-2xl bg-white p-5 shadow-xl backdrop:bg-slate-900/50"
        onCancel={e => { e.preventDefault(); if (!guardando) setModal(null); }}>
        {modal && <form onSubmit={guardar} className="space-y-4">
          <h2 id="inventario-modal-titulo" className="text-lg font-semibold">{modal.tipo === 'producto' ? (producto ? appI18n.t("ui.Inventario.edit_product") : tipoProducto === 'aceite' ? appI18n.t("ui.Inventario.new_oil_product") : appI18n.t("ui.Inventario.new_product")) : modal.tipo === 'MEDICION' ? appI18n.t("ui.Inventario.measure_level") : appI18n.t(`ui.Inventario.${modal.tipo}`)}</h2>
          {modal.tipo === 'producto' ? <>
            {presentacionBloqueada && <p className="rounded-lg bg-slate-100 p-3 text-sm text-slate-700">{appI18n.t("ui.Inventario.the_unit_and_packaging_are_locked_because_the")}</p>}
            <Campo label={appI18n.t("ui.Inventario.product_type")}><select className={campo} disabled={presentacionBloqueada} value={tipoProducto} onChange={e => { setTipoProducto(e.target.value as typeof tipoProducto); if (e.target.value !== 'aceite') setEsGranel(false); }}><option value="repuesto">{appI18n.t("ui.Dashboard.part")}</option><option value="aceite">{appI18n.t("ui.Inventario.oil")}</option></select></Campo>
            <Campo label={appI18n.t("ui.Inventario.code")}><input required className={campo} name="codigo" defaultValue={producto?.codigo} /></Campo>
            <Campo label={appI18n.t("ui.Inventario.name")}><input required className={campo} name="nombre" defaultValue={producto?.nombre} /></Campo>
            <Campo label={appI18n.t("ui.Inventario.category")}><input className={campo} name="categoria" defaultValue={producto?.categoria ?? ''} /></Campo>
            {tipoProducto === 'aceite' ? <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Campo label={appI18n.t("ui.Inventario.viscosity")}><input className={campo} name="viscosidad" placeholder="5W-30" defaultValue={producto?.viscosidad ?? ''} /></Campo>
                <Campo label={appI18n.t("ui.Inventario.base_oil")}><select className={campo} name="base_aceite" defaultValue={producto?.base_aceite ?? ''}><option value="">{appI18n.t("ui.Inventario.unspecified")}</option>{Object.entries(basesAceite).map(([valor, etiqueta]) => <option key={valor} value={valor}>{etiqueta}</option>)}</select></Campo>
                <Campo label={appI18n.t("ui.NuevoIngreso.make")}><input className={campo} name="marca" defaultValue={producto?.marca ?? ''} /></Campo>
                <Campo label={appI18n.t("ui.Inventario.specification")}><input className={campo} name="especificacion" placeholder="API SP" defaultValue={producto?.especificacion ?? ''} /></Campo>
              </div>
              <Campo label={appI18n.t("ui.Inventario.packaging")}><select className={campo} disabled={presentacionBloqueada} value={esGranel ? 'granel' : 'tarro'} onChange={e => { setEsGranel(e.target.value === 'granel'); setMinimo('0'); }}><option value="tarro">{appI18n.t("ui.Inventario.container")}</option><option value="granel">{appI18n.t("ui.Inventario.bulk_drum")}</option></select></Campo>
              {esGranel ? <Campo key="caneca" label={appI18n.t("ui.Inventario.drum_capacity_l")}><input required disabled={presentacionBloqueada} className={campo} name="capacidad_envase" type="number" min="0.001" step="0.001" defaultValue={producto?.capacidad_envase ?? 208.198} /></Campo>
                : <Campo key="tarro" label={appI18n.t("ui.Inventario.container_volume_l")}><input required disabled={presentacionBloqueada} className={campo} name="contenido_litros" type="number" min="0.001" step="0.001" defaultValue={producto?.contenido_litros ?? 0.946} /></Campo>}
            </> : <Campo label={appI18n.t("ui.Inventario.unit")}><select className={campo} disabled={presentacionBloqueada} name="unidad" defaultValue={producto?.unidad ?? 'und'}>
              <option value="und">{appI18n.t("ui.Inventario.unit")}</option><option value="litro">{appI18n.t("ui.Inventario.liter")}</option><option value="galón">{appI18n.t("ui.Inventario.gallon")}</option>
            </select></Campo>}
            <Campo label={esGranel ? appI18n.t("ui.Inventario.sale_price_per_liter_cop") : appI18n.t("ui.Inventario.sale_price_cop")}><input required className={campo} name="precio_venta" type="number" min="0" step="0.01" defaultValue={producto?.precio_venta ?? 0} /></Campo>
            <div className="flex gap-2"><Campo label={appI18n.t("ui.Inventario.minimum_stock")}><input required className={campo} name="stock_minimo" type="number" min="0" step="0.001" value={minimo} onChange={e => setMinimo(e.target.value)} /></Campo>
              {esGranel && <Campo label={appI18n.t("ui.Inventario.minimum_stock_unit")}><select className={campo} value={unidadMinimo} onChange={e => {
                const unidad = e.target.value as typeof unidadMinimo;
                setMinimo(String(Math.round(Number(minimo) * factorLitros[unidadMinimo] / factorLitros[unidad] * 1000) / 1000)); setUnidadMinimo(unidad);
              }}><option value="cuarto">{appI18n.t("ui.Inventario.quarts_2")}</option><option value="galón">{appI18n.t("ui.Inventario.gallons")}</option></select></Campo>}</div>
            <label className="flex items-center gap-2"><input name="activo" type="checkbox" defaultChecked={producto?.activo ?? true} /> {appI18n.t("ui.Inventario.active_product")}</label>
          </> : <>
            {modal.tipo === 'ANULACION' ? (
              <p>{appI18n.t("ui.Inventario.a_reversing_movement_will_be_recorded_for")} {modal.movimiento.taller_inventario_items.nombre}.
                {modal.movimiento.gasto_id && ' También se anulará el gasto generado por esta compra.'}</p>
            ) : modal.tipo === 'MEDICION' ? <>
              <p>{modal.producto.nombre} {appI18n.t("ui.Inventario.recorded_stock")} <strong>{formatoMedicion(modal.producto.stock_actual, unidadMedicion)}</strong> <span className="text-sm text-slate-500">({numero.format(modal.producto.stock_actual)} L)</span></p>
              <Campo label={appI18n.t("ui.Inventario.measurement_unit")}><select className={campo} value={unidadMedicion} onChange={e => {
                const unidad = e.target.value as UnidadVolumen;
                const convertir = (valor: string) => valor === '' ? '' : String(Number((Number(valor) * factorLitros[unidadMedicion] / factorLitros[unidad]).toFixed(6)));
                setMedido(convertir(medido)); setDespachado(convertir(despachado)); setUnidadMedicion(unidad);
              }}><option value="cuarto">{appI18n.t("ui.Inventario.quarts_2")}</option><option value="galón">{appI18n.t("ui.Inventario.gallons")}</option><option value="litro">{appI18n.t("ui.Inventario.liters_advanced")}</option></select></Campo>
              <Campo label={`Nivel medido con varilla (${pluralVolumen[unidadMedicion]})`}><input required className={campo} type="number" min="0" step="any" value={medido} onChange={e => setMedido(e.target.value)} /></Campo>
              {porDescontar > 0 && <>
                <p className="text-sm text-amber-900">{appI18n.t("ui.Inventario.pending_deduction_on_open_orders")} {formatoMedicion(abierto, unidadMedicion)} <span className="text-slate-500">({numero.format(abierto)} L)</span>.</p>
                {pendienteEntregado > 0 && <p className="text-sm font-medium">{appI18n.t("ui.Inventario.pending_deliveries_included")} {formatoMedicion(pendienteEntregado, unidadMedicion)} <span className="text-slate-500">({numero.format(pendienteEntregado)} L)</span>.</p>}
                {abierto > 0 && <Campo label={`Usados en órdenes abiertas (${pluralVolumen[unidadMedicion]})`}><input required className={campo} type="number" min="0" max={(abierto + 0.000499) / factorLitros[unidadMedicion]} step="any" value={despachado} onChange={e => setDespachado(e.target.value)} /></Campo>}
                <p className="text-xs text-slate-600">{appI18n.t("ui.Inventario.enter_only_what_has_already_been_used_on")}</p>
              </>}
              {variacion !== null && <p role="status" className="text-sm">{appI18n.t("ui.Inventario.adjustment_to_record")} {variacion > 0 ? '+' : ''}{formatoMedicion(variacion, unidadMedicion)} <span className="text-slate-500">({numero.format(variacion)} L)</span>
                {' · '}{modal.producto.stock_actual > 0 ? `${numero.format(100 * variacion / modal.producto.stock_actual)} %` : appI18n.t("ui.Inventario.no_baseline_for_calculating_the_percentage")}</p>}
            </> : <>
              <p>{modal.producto.nombre} {appI18n.t("ui.Inventario.stock_on_hand")} {ventaGranel
                ? <>{formatoMedicion(modal.producto.stock_actual, unidadVenta)} <span className="text-sm text-slate-500">({numero.format(modal.producto.stock_actual)} L)</span></>
                : `${numero.format(modal.producto.stock_actual)} ${modal.producto.unidad}`}</p>
              {compraGranel && <Campo label={appI18n.t("ui.Inventario.purchase_packaging")}><select className={campo} value={presentacion} onChange={e => setPresentacion(e.target.value as typeof presentacion)}>
                <option value="tambor">{appI18n.t("ui.Inventario.drum_2")}</option><option value="galón">{appI18n.t("ui.Inventario.gallon")}</option><option value="cuarto">{appI18n.t("ui.Inventario.quart")}</option><option value="litro">{appI18n.t("ui.Inventario.liter_advanced")}</option>
              </select></Campo>}
              {ventaGranel && <Campo label={appI18n.t("ui.Inventario.sale_unit")}><select className={campo} value={presentacion} onChange={e => {
                const unidad = e.target.value as UnidadVolumen;
                setPresentacion(unidad); setPrecioVenta(String(precioPorUnidad(modal.producto.precio_venta, unidad)));
              }}>
                <option value="cuarto">{appI18n.t("ui.Inventario.quart")}</option><option value="galón">{appI18n.t("ui.Inventario.gallon")}</option><option value="litro">{appI18n.t("ui.Inventario.liter_advanced")}</option>
              </select></Campo>}
              <Campo label={modal.tipo === 'AJUSTE' ? appI18n.t("ui.Inventario.adjustment_quantity") : compraGranel || ventaGranel ? `Cantidad en ${pluralVolumen[presentacion]}` : appI18n.t("ui.Inventario.quantity")}>
                <input required className={campo} name="cantidad" type="number" step="0.001" min={modal.tipo === 'AJUSTE' ? undefined : '0.001'} value={compraGranel || ventaGranel ? cantidadCompra : undefined} onChange={compraGranel || ventaGranel ? e => setCantidadCompra(e.target.value) : undefined} />
              </Campo>
              {compraGranel && <p role="status" className="text-sm font-medium">{appI18n.t("ui.Inventario.equivalent_to")} {mostrarCuartos(litrosCompra)} · {numero.format(litrosCompra / factorLitros['galón'])} gal · {numero.format(litrosCompra)} L</p>}
              {modal.tipo !== 'SALIDA_VENTA' && <Campo label={modal.tipo === 'AJUSTE' ? appI18n.t("ui.Inventario.increase_unit_cost") : compraGranel ? `Costo por ${presentacion === 'tambor' ? 'caneca' : presentacion} (COP)` : appI18n.t("ui.Inventario.invoice_unit_cost")}>
                <input required={modal.tipo === 'ENTRADA'} className={campo} name="costo_unitario" type="number" min="0" step="0.000001" />
              </Campo>}
              {modal.tipo === 'ENTRADA' && <>
                <Campo label={appI18n.t("ui.Inventario.supplier")}><input className={campo} name="proveedor" maxLength={255} /></Campo>
                <label className="flex items-center gap-2"><input name="registrar_gasto" type="checkbox" /> {appI18n.t("ui.Inventario.record_as_a_parts_expense")}</label>
              </>}
              {modal.tipo === 'SALIDA_VENTA' && (ventaGranel ? <>
                <Campo label={`Precio por ${unidadVenta} (COP)`}><input required className={campo} name="precio_unitario" type="number" min="0" step="0.01" value={precioVenta} onChange={e => setPrecioVenta(e.target.value)} /></Campo>
                <p role="status" className="rounded-lg bg-indigo-50 p-3 font-semibold">{appI18n.t("ui.ReportePostmortem.total")} {moneda.format(totalVenta)} {appI18n.t("ui.Inventario.equivalent_to_2")} {numero.format(litrosVenta)} L</p>
              </> : <Campo label={appI18n.t("ui.Inventario.unit_price_cop")}><input required className={campo} name="precio_unitario" type="number" min="0" step="0.01" defaultValue={modal.producto.precio_venta} /></Campo>)}
              {modal.tipo !== 'AJUSTE' && <Campo label={appI18n.t("ui.Inventario.invoice_reference")}><input className={campo} name="factura_ref" /></Campo>}
            </>}
            <Campo label={appI18n.t("ui.Inventario.notes")}><textarea className={campo} name="notas" required={modal.tipo === 'AJUSTE' || modal.tipo === 'ANULACION'} /></Campo>
          </>}
          {errorModal && <p role="alert" className="text-red-700">{errorModal}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className={boton} disabled={guardando} onClick={() => setModal(null)}>{appI18n.t("ui.Inventario.close")}</button>
            <button type="submit" className={principal} disabled={guardando}>{guardando ? appI18n.t('ui.Inventario.saving') : appI18n.t('ui.Inventario.save')}</button>
          </div>
        </form>}
      </dialog>
    </main>
  );

  function cambiarFiltro(campo: keyof typeof filtros, valor: string) {
    setCargandoMovimientos(true);
    setPagina(1);
    setFiltros(actual => ({ ...actual, [campo]: valor }));
  }

  function cambiarPagina(nueva: number) {
    setCargandoMovimientos(true);
    setPagina(nueva);
  }
}
