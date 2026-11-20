import { useState } from 'react';
import type { useSeguimientoCompartido } from './useSeguimientoCompartido';

type Seguimiento = ReturnType<typeof useSeguimientoCompartido>;
const accion = 'rounded-lg bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-800 disabled:opacity-50';

export function CompartirSeguimiento({ seguimiento }: { seguimiento: Seguimiento }) {
  const { enlace, cargando, ocupado, error, copiado } = seguimiento;
  const url = enlace ? new URL('/seguimiento/visita#' + enlace.token, window.location.origin).href : '';

  return (
    <section className="mb-5 space-y-2 rounded-xl border border-slate-200 p-3">
      <h3 className="font-semibold">Seguimiento para el cliente</h3>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {cargando ? <p role="status" className="text-sm">Cargando enlace…</p> : (
        <>
          {enlace && (
            <>
              <p className="text-sm text-slate-600">
                Vence el {new Date(enlace.vence_at).toLocaleDateString('es-CO', { timeZone: 'America/Bogota' })}
              </p>
              <input readOnly aria-label="Enlace del cliente" value={url} onFocus={e => e.target.select()}
                className="w-full rounded-md border border-slate-300 p-2 text-sm" />
            </>
          )}
          <div className="flex flex-wrap gap-2">
            {enlace && (
              <>
                <button type="button" className={accion} disabled={ocupado} onClick={() => void seguimiento.copiar(url)}>
                  {copiado ? 'Enlace copiado' : 'Copiar enlace'}
                </button>
                <a className={accion} target="_blank" rel="noopener noreferrer"
                  href={'https://wa.me/?text=' + encodeURIComponent('Consulta el seguimiento de tu vehículo: ' + url)}>
                  Compartir por WhatsApp
                </a>
              </>
            )}
            <button type="button" className={accion} disabled={ocupado} onClick={() => {
              if (!enlace || window.confirm('¿Generar otro enlace? El enlace anterior dejará de funcionar.')) {
                void seguimiento.generar();
              }
            }}>{enlace ? 'Generar otro enlace' : 'Generar enlace'}</button>
            {enlace && <button type="button" className={accion} disabled={ocupado} onClick={() => {
              if (window.confirm('¿Revocar el enlace del cliente?')) void seguimiento.revocar();
            }}>Revocar enlace</button>}
          </div>
        </>
      )}
    </section>
  );
}

export function PublicarAvance({ seguimiento, id, nota }: { seguimiento: Seguimiento; id: string; nota: string }) {
  const publicado = seguimiento.publicaciones.find(p => p.evento_id === id);
  const [editando, setEditando] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [mostrarFecha, setMostrarFecha] = useState(false);
  const ocupado = seguimiento.ocupado || seguimiento.cargando;

  return (
    <div className="mb-4 ml-10 space-y-2">
      {publicado && <p className="text-xs font-medium text-emerald-700">Publicado para el cliente</p>}
      {editando ? (
        <form className="space-y-2" onSubmit={e => {
          e.preventDefault();
          void seguimiento.publicar(id, mensaje.trim(), mostrarFecha, () => setEditando(false));
        }}>
          <label className="block text-sm font-medium">
            Mensaje que verá el cliente
            <textarea className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm"
              value={mensaje} onChange={e => setMensaje(e.target.value)} required maxLength={2000} rows={3} />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={mostrarFecha} onChange={e => setMostrarFecha(e.target.checked)} />
            Compartir la fecha estimada actual
          </label>
          <button className={accion} disabled={ocupado || !mensaje.trim()}>Publicar</button>
          <button type="button" className="ml-2 text-sm" onClick={() => setEditando(false)}>Cancelar</button>
          {seguimiento.error && <p role="alert" className="text-sm text-red-700">{seguimiento.error}</p>}
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={accion} disabled={ocupado} onClick={() => {
            setMensaje((publicado?.mensaje ?? nota).slice(0, 2000));
            setMostrarFecha(Boolean(publicado?.fecha_entrega_estimada));
            setEditando(true);
          }}>{publicado ? 'Editar publicación' : 'Preparar para el cliente'}</button>
          {publicado && <button type="button" className={accion} disabled={ocupado}
            onClick={() => void seguimiento.retirar(id)}>Retirar publicación</button>}
        </div>
      )}
    </div>
  );
}
