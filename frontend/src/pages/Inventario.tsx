import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { isAxiosError } from 'axios';
import { Link, useParams } from 'react-router-dom';
import api from '../services/api';
import { factorLitros, pluralVolumen } from '../utils/volumenInventario';

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
}

const tipos = {
  ENTRADA: 'Compra',
  AJUSTE: 'Ajuste',
  SALIDA_VENTA: 'Venta de mostrador',
  SALIDA_ORDEN: 'Salida de orden',
  ANULACION: 'Anulación',
};

type Tipo = keyof typeof tipos;
type Movimiento = {
  id: string;
  tipo: Tipo;
  cantidad: number;
  presentacion?: 'tambor' | 'galón' | 'litro' | null;
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
const fecha = new Intl.DateTimeFormat('es-CO', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Bogota' });

function NivelGranel({ stock, capacidad }: { stock: number; capacidad: number }) {
  const mililitros = Math.round(stock * 1000);
  const capacidadMl = Math.round(capacidad * 1000);
  const tambores = Math.floor(mililitros / capacidadMl);
  const resto = mililitros % capacidadMl / 1000;
  return <div className="mt-1 min-w-36 space-y-1 text-xs text-slate-600">
    <div>{tambores} {tambores === 1 ? 'tambor' : 'tambores'} + {numero.format(resto)} L ≈ {numero.format(stock / factorLitros.cuarto)} cuartos</div>
    <progress aria-label="Nivel del tambor en uso" className="block h-2 w-full accent-indigo-600" value={resto} max={capacidad} />
    <div>Tambor en uso · {numero.format(resto)} de {numero.format(capacidad)} L</div>
  </div>;
}

function Campo({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block space-y-1 text-sm font-medium"><span>{label}</span>{children}</label>;
}

function mensaje(error: unknown) {
  return isAxiosError(error) ? error.response?.data?.error || 'No se pudo acceder al inventario.' : 'No se pudo acceder al inventario.';
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
  if (!data) return <p role="status">Cargando descuentos pendientes…</p>;
  return (
    <>
      {data.pendientes.length === 0 ? <p className="text-slate-600">No hay descuentos pendientes en esta página.</p> : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm [&_td]:p-3 [&_th]:p-3">
            <thead className="bg-slate-50"><tr><th>Producto</th><th>Pendiente</th><th>Stock físico</th><th>Orden</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{data.pendientes.map(pendiente => (
              <tr key={`${pendiente.ingreso_id}-${pendiente.linea_id}`}>
                <td>{pendiente.producto}</td><td>{numero.format(pendiente.cantidad)}</td>
                <td>{numero.format(pendiente.stock_actual)}</td>
                <td><Link className="font-medium text-indigo-700 underline" to={`/${slug}/checkout/${pendiente.ingreso_id}?edit=true`}>Abrir orden</Link></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {(data.paginas > 1 || pagina > 1) && <div className="flex items-center gap-3">
        <button className={boton} disabled={pagina <= 1} onClick={() => cambiarPagina(pagina - 1)}>Anterior</button>
        <span>Página {pagina}</span>
        <button className={boton} disabled={pagina >= data.paginas} onClick={() => cambiarPagina(pagina + 1)}>Siguiente</button>
      </div>}
    </>
  );
}

export default function Inventario() {
  const [items, setItems] = useState<ProductoInventario[]>([]);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [tab, setTab] = useState('Catálogo');
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
  const [presentacion, setPresentacion] = useState<'tambor' | 'galón' | 'litro'>('tambor');
  const [medido, setMedido] = useState('');
  const [despachado, setDespachado] = useState('');
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
    setPresentacion('tambor');
    setMedido('');
    setDespachado('');
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
          codigo: valor('codigo'), nombre: valor('nombre'), categoria: valor('categoria'), unidad: esGranel ? 'litro' : valor('unidad'),
          es_granel: esGranel, capacidad_envase: esGranel ? importe('capacidad_envase') : null,
          precio_venta: importe('precio_venta'), stock_minimo: importe('stock_minimo'), activo: form.has('activo'),
        };
        if (modal.producto) await api.put(`/inventario/items/${modal.producto.id}`, data);
        else await api.post('/inventario/items', data);
      } else if (modal.tipo === 'ANULACION') {
        await api.post(`/inventario/movimientos/${modal.movimiento.id}/anular`, { notas: valor('notas') });
      } else if (modal.tipo === 'MEDICION') {
        await api.post('/inventario/movimientos', {
          operacion_id: operacion.current, tipo: 'AJUSTE', item_id: modal.producto.id,
          stock_medido: Number(medido), stock_esperado: modal.producto.stock_actual, notas: valor('notas'),
          litros_despachados_sin_descontar: despachado === '' ? undefined : Number(despachado),
          por_descontar_esperado: porDescontar,
        });
      } else {
        if (modal.tipo === 'ENTRADA' && form.has('registrar_gasto') &&
            Math.round(importe('cantidad') * importe('costo_unitario') * 100) <= 0) {
          setErrorModal('Para registrar el gasto, el importe de la compra debe ser mayor que cero.');
          return;
        }
        const cantidadCapturada = importe('cantidad');
        const factor = compraGranel
          ? presentacion === 'tambor' ? modal.producto.capacidad_envase ?? 0 : factorLitros[presentacion]
          : 1;
        const cantidad = compraGranel ? Math.round(cantidadCapturada * factor * 1000) / 1000 : cantidadCapturada;
        const costoCapturado = valor('costo_unitario') === '' ? undefined : importe('costo_unitario');
        if (compraGranel && cantidad <= 0) {
          setErrorModal('La compra debe equivaler al menos a 0,001 litros.');
          return;
        }
        await api.post('/inventario/movimientos', {
          operacion_id: operacion.current, tipo: modal.tipo, item_id: modal.producto.id, cantidad,
          costo_unitario: compraGranel && costoCapturado !== undefined ? costoCapturado * cantidadCapturada / cantidad : costoCapturado,
          precio_unitario: modal.tipo === 'SALIDA_VENTA' ? importe('precio_unitario') : undefined,
          registrar_gasto: form.has('registrar_gasto'), proveedor: valor('proveedor'),
          factura_ref: valor('factura_ref'), notas: valor('notas'),
          ...(compraGranel ? { presentacion, cantidad_presentacion: cantidadCapturada, costo_presentacion: costoCapturado } : {}),
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
    const coincide = `${item.codigo} ${item.nombre} ${item.categoria ?? ''}`.toLowerCase().includes(busqueda.trim().toLowerCase());
    return coincide && (tab !== 'Stock crítico' || stockCritico(item));
  });
  const producto = modal && 'producto' in modal ? modal.producto : undefined;
  const compraGranel = modal?.tipo === 'ENTRADA' && modal.producto.es_granel;
  const porDescontar = modal?.tipo === 'MEDICION'
    ? Math.round(((modal.producto.aceite_ordenes_abiertas ?? 0) + (modal.producto.stock_pendiente_entrega ?? 0)) * 1000) / 1000 : 0;
  const variacion = modal?.tipo === 'MEDICION' && medido !== '' && (porDescontar === 0 || despachado !== '')
    ? Math.round((Number(medido) + Number(despachado) - modal.producto.stock_actual) * 1000) / 1000 : null;

  return (
    <main className="mx-auto max-w-7xl space-y-5 px-4 py-6 text-slate-900">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Inventario</h1>
        <button className={principal} onClick={() => abrir({ tipo: 'producto' })}>Nuevo producto</button>
      </header>
      <nav aria-label="Vistas del inventario" className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        {['Catálogo', 'Movimientos', 'Stock crítico', 'Descuentos pendientes'].map(vista => (
          <button key={vista} type="button" aria-pressed={tab === vista} className={tab === vista ? principal : boton}
            onClick={() => { setTab(vista); if (vista === 'Movimientos' && tab !== vista) setCargandoMovimientos(true); }}>{vista}</button>
        ))}
      </nav>
      {error && <p role="alert" className="text-red-700">{error} <button className="underline" onClick={() => setVersion(v => v + 1)}>Reintentar</button></p>}
      {tab === 'Descuentos pendientes' ? <DescuentosPendientes /> : tab === 'Movimientos' ? (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <Campo label="Tipo"><select className={campo} value={filtros.tipo} onChange={e => cambiarFiltro('tipo', e.target.value)}>
              <option value="">Todos</option>{Object.entries(tipos).map(([tipo, label]) => <option key={tipo} value={tipo}>{label}</option>)}
            </select></Campo>
            <Campo label="Producto"><select className={campo} value={filtros.item_id} onChange={e => cambiarFiltro('item_id', e.target.value)}>
              <option value="">Todos</option>{items.map(item => <option key={item.id} value={item.id}>{item.codigo} · {item.nombre}</option>)}
            </select></Campo>
            <Campo label="Desde"><input className={campo} type="date" value={filtros.desde} onChange={e => cambiarFiltro('desde', e.target.value)} /></Campo>
            <Campo label="Hasta"><input className={campo} type="date" value={filtros.hasta} onChange={e => cambiarFiltro('hasta', e.target.value)} /></Campo>
          </div>
          {errorMovimientos && <p role="alert" className="text-red-700">{errorMovimientos}</p>}
          {cargandoMovimientos ? <p role="status">Cargando movimientos…</p> : !errorMovimientos && (
            movimientos.length ? (
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                <table className="w-full text-left text-sm [&_td]:px-3 [&_td]:py-3 [&_th]:p-3">
                  <thead className="bg-slate-50"><tr><th>Fecha</th><th>Producto</th><th>Tipo</th><th>Cantidad</th><th>Costo unit.</th><th>Precio unit.</th><th>Detalle</th><th>Acciones</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">{movimientos.map(m => (
                    <tr key={m.id}>
                      <td>{fecha.format(new Date(m.created_at))}</td><td>{m.taller_inventario_items.nombre}<div className="text-xs text-slate-500">{m.taller_inventario_items.codigo}</div></td>
                      <td>{tipos[m.tipo]}{m.anulado && <div className="text-xs text-slate-500">Anulado</div>}</td>
                      <td>{m.presentacion && m.cantidad_presentacion != null
                        ? `${m.tipo === 'ANULACION' ? 'Reversión de ' : ''}${numero.format(m.cantidad_presentacion)} ${m.cantidad_presentacion === 1 ? m.presentacion : pluralVolumen[m.presentacion]} (${numero.format(m.cantidad)} L de stock)`
                        : numero.format(m.cantidad)}</td><td>{moneda.format(m.costo_unitario)}</td><td>{m.precio_unitario === null ? '—' : moneda.format(m.precio_unitario)}</td>
                      <td><div>{m.usuario_email}</div><div className="text-xs text-slate-500">{[m.proveedor, m.factura_ref, m.notas, m.gasto_id && (m.anulado || m.tipo === 'ANULACION' ? 'Gasto anulado' : 'Gasto vinculado')].filter(Boolean).join(' · ')}</div></td>
                      <td>{!m.anulado && !['ANULACION', 'SALIDA_ORDEN'].includes(m.tipo) && <button className={boton} onClick={() => abrir({ tipo: 'ANULACION', movimiento: m })}>Anular</button>}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            ) : <p className="text-slate-600">No hay movimientos con estos filtros.</p>
          )}
          {paginas > 1 && <div className="flex items-center gap-3">
            <button className={boton} disabled={pagina <= 1 || cargandoMovimientos} onClick={() => cambiarPagina(pagina - 1)}>Anterior</button>
            <span>Página {pagina} de {paginas}</span>
            <button className={boton} disabled={pagina >= paginas || cargandoMovimientos} onClick={() => cambiarPagina(pagina + 1)}>Siguiente</button>
          </div>}
        </>
      ) : (
        <>
          <input className={`${campo} max-w-md`} placeholder="Buscar por código, nombre o categoría" aria-label="Buscar productos"
            value={busqueda} onChange={e => setBusqueda(e.target.value)} />
          {cargando ? <p role="status">Cargando catálogo…</p> : visibles.length ? (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-left text-sm [&_td]:px-3 [&_td]:py-3 [&_th]:p-3">
                <thead className="bg-slate-50"><tr><th>Producto</th><th>Físico</th><th>Comprometido</th><th>Mínimo</th><th>Costo promedio</th><th>Precio venta</th><th>Acciones</th></tr></thead>
                <tbody className="divide-y divide-slate-100">{visibles.map(item => (
                  <tr key={item.id}>
                    <td><div className="font-semibold">{item.nombre}</div><div className="text-xs text-slate-500">{[item.codigo, item.categoria, !item.activo && 'Inactivo'].filter(Boolean).join(' · ')}</div></td>
                    <td className={stockCritico(item) ? 'font-semibold text-amber-800' : ''}>{numero.format(item.stock_actual)} {item.unidad}
                      {!!item.es_granel && !!item.capacidad_envase && <NivelGranel stock={item.stock_actual} capacidad={item.capacidad_envase} />}
                    </td>
                    <td>{numero.format(item.stock_comprometido)}</td><td>{numero.format(item.stock_minimo)}</td>
                    <td>{moneda.format(item.costo_promedio)}</td><td>{moneda.format(item.precio_venta)}</td>
                    <td><div className="flex flex-wrap gap-2">
                      <button className={boton} onClick={() => abrir({ tipo: 'producto', producto: item })}>Editar</button>
                      {item.activo && <button className={boton} onClick={() => abrir({ tipo: 'ENTRADA', producto: item })}>Compra</button>}
                      <button className={boton} onClick={() => abrir({ tipo: 'AJUSTE', producto: item })}>Ajuste</button>
                      {item.es_granel && <button className={boton} onClick={() => abrir({ tipo: 'MEDICION', producto: item })}>Medir nivel</button>}
                      {item.activo && <button className={boton} onClick={() => abrir({ tipo: 'SALIDA_VENTA', producto: item })}>Vender</button>}
                    </div></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : !error && <p className="text-slate-600">{tab === 'Stock crítico' ? 'No hay productos en stock crítico que coincidan.' : 'No hay productos que coincidan.'}</p>}
        </>
      )}
      <dialog ref={dialog} aria-labelledby="inventario-modal-titulo"
        className="m-auto max-h-[90vh] w-[min(92vw,32rem)] rounded-2xl bg-white p-5 shadow-xl backdrop:bg-slate-900/50"
        onCancel={e => { e.preventDefault(); if (!guardando) setModal(null); }}>
        {modal && <form onSubmit={guardar} className="space-y-4">
          <h2 id="inventario-modal-titulo" className="text-lg font-semibold">{modal.tipo === 'producto' ? (producto ? 'Editar producto' : 'Nuevo producto') : modal.tipo === 'MEDICION' ? 'Medir nivel' : tipos[modal.tipo]}</h2>
          {modal.tipo === 'producto' ? <>
            <Campo label="Código"><input required className={campo} name="codigo" defaultValue={producto?.codigo} /></Campo>
            <Campo label="Nombre"><input required className={campo} name="nombre" defaultValue={producto?.nombre} /></Campo>
            <Campo label="Categoría"><input className={campo} name="categoria" defaultValue={producto?.categoria ?? ''} /></Campo>
            <label className="flex items-center gap-2"><input type="checkbox" checked={esGranel} onChange={e => setEsGranel(e.target.checked)} /> Producto a granel</label>
            {esGranel ? <Campo label="Capacidad del tambor (L)"><input required className={campo} name="capacidad_envase" type="number" min="0.001" step="0.001" defaultValue={producto?.capacidad_envase ?? 208.198} /></Campo>
              : <Campo label="Unidad"><select className={campo} name="unidad" defaultValue={producto?.unidad ?? 'und'}>
              <option value="und">Unidad</option><option value="litro">Litro</option><option value="galón">Galón</option>
            </select></Campo>}
            <Campo label={esGranel ? 'Precio de venta por litro (COP)' : 'Precio de venta (COP)'}><input required className={campo} name="precio_venta" type="number" min="0" step="0.01" defaultValue={producto?.precio_venta ?? 0} /></Campo>
            <Campo label={esGranel ? 'Stock mínimo (L)' : 'Stock mínimo'}><input required className={campo} name="stock_minimo" type="number" min="0" step="0.001" defaultValue={producto?.stock_minimo ?? 0} /></Campo>
            <label className="flex items-center gap-2"><input name="activo" type="checkbox" defaultChecked={producto?.activo ?? true} /> Producto activo</label>
          </> : <>
            {modal.tipo === 'ANULACION' ? (
              <p>Se registrará un movimiento inverso para {modal.movimiento.taller_inventario_items.nombre}.
                {modal.movimiento.gasto_id && ' También se anulará el gasto generado por esta compra.'}</p>
            ) : modal.tipo === 'MEDICION' ? <>
              <p>{modal.producto.nombre} · Stock en libros {numero.format(modal.producto.stock_actual)} L</p>
              <Campo label="Nivel medido con varilla (L)"><input required className={campo} type="number" min="0" step="0.001" value={medido} onChange={e => setMedido(e.target.value)} /></Campo>
              {porDescontar > 0 && <>
                <p className="text-sm text-amber-900">Por descontar: {numero.format(modal.producto.aceite_ordenes_abiertas ?? 0)} L en órdenes abiertas y {numero.format(modal.producto.stock_pendiente_entrega ?? 0)} L en entregas pendientes de descuento.</p>
                <Campo label="Litros ya usados físicamente en esas órdenes"><input required className={campo} type="number" min="0" max={porDescontar} step="0.001" value={despachado} onChange={e => setDespachado(e.target.value)} /></Campo>
                <p className="text-xs text-slate-600">Ingresa 0 si todavía no se usó aceite. Los litros ya usados se suman a la medición para reservar su descuento a la orden.</p>
              </>}
              {variacion !== null && <p role="status" className="text-sm">Ajuste a registrar {variacion > 0 ? '+' : ''}{numero.format(variacion)} L
                {' · '}{modal.producto.stock_actual > 0 ? `${numero.format(100 * variacion / modal.producto.stock_actual)} %` : 'Porcentaje sin base de comparación'}</p>}
            </> : <>
              <p>{modal.producto.nombre} · Stock físico {numero.format(modal.producto.stock_actual)} {modal.producto.unidad}</p>
              {compraGranel && <Campo label="Presentación de compra"><select className={campo} value={presentacion} onChange={e => setPresentacion(e.target.value as typeof presentacion)}>
                <option value="tambor">Tambor ({numero.format(modal.producto.capacidad_envase ?? 0)} L)</option><option value="galón">Galón</option><option value="litro">Litro</option>
              </select></Campo>}
              <Campo label={modal.tipo === 'AJUSTE' ? 'Cantidad (positiva para sumar, negativa para restar)' : compraGranel ? `Cantidad en ${pluralVolumen[presentacion]}` : 'Cantidad'}>
                <input required className={campo} name="cantidad" type="number" step="0.001" min={modal.tipo === 'AJUSTE' ? undefined : '0.001'} />
              </Campo>
              {modal.tipo !== 'SALIDA_VENTA' && <Campo label={modal.tipo === 'AJUSTE' ? 'Costo unitario para aumento (opcional)' : compraGranel ? `Costo por ${presentacion} (COP)` : 'Costo unitario de factura (COP)'}>
                <input required={modal.tipo === 'ENTRADA'} className={campo} name="costo_unitario" type="number" min="0" step="0.000001" />
              </Campo>}
              {modal.tipo === 'ENTRADA' && <>
                <Campo label="Proveedor"><input className={campo} name="proveedor" maxLength={255} /></Campo>
                <label className="flex items-center gap-2"><input name="registrar_gasto" type="checkbox" /> Registrar como gasto en Repuestos</label>
              </>}
              {modal.tipo === 'SALIDA_VENTA' && <Campo label="Precio unitario (COP)"><input required className={campo} name="precio_unitario" type="number" min="0" step="0.01" defaultValue={modal.producto.precio_venta} /></Campo>}
              {modal.tipo !== 'AJUSTE' && <Campo label="Referencia de factura"><input className={campo} name="factura_ref" /></Campo>}
            </>}
            <Campo label="Notas"><textarea className={campo} name="notas" required={modal.tipo === 'AJUSTE' || modal.tipo === 'ANULACION'} /></Campo>
          </>}
          {errorModal && <p role="alert" className="text-red-700">{errorModal}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className={boton} disabled={guardando} onClick={() => setModal(null)}>Cerrar</button>
            <button type="submit" className={principal} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
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
