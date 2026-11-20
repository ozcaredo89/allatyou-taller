import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

interface Seguimiento {
  estado: string;
  vehiculo: { placa: string; marca?: string; linea?: string } | null;
  avances: { mensaje: string; publicado_at: string; fecha_entrega_estimada: string | null }[];
}

const estados: Record<string, string> = {
  recepcion: 'En recepción',
  diagnostico: 'En diagnóstico',
  cotizacion: 'Preparando cotización',
  esperando_aprobacion: 'Esperando aprobación',
  en_reparacion: 'En reparación',
  listo: 'Listo para entrega',
  entregado: 'Entregado',
  cancelado: 'Cancelado'
};
const fecha = new Intl.DateTimeFormat('es-CO', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Bogota'
});

export default function SeguimientoCliente() {
  const { hash } = useLocation();
  const [resultado, setResultado] = useState<{ hash: string; data?: Seguimiento; error?: string }>();
  const actual = resultado?.hash === hash ? resultado : undefined;

  useEffect(() => {
    const controller = new AbortController();
    const token = hash.slice(1);
    if (!/^[0-9a-f-]{36}\.[0-9a-f]{64}$/.test(token)) return () => controller.abort();
    const base = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
    fetch(base.replace(/\/$/, '') + '/public/seguimiento', {
      headers: { Authorization: 'Bearer ' + token },
      cache: 'no-store',
      signal: controller.signal
    }).then(async response => {
      if (response.status === 404) {
        setResultado({ hash, error: 'Este enlace venció o ya no está disponible.' });
      } else {
        if (!response.ok) throw new Error();
        const data: Seguimiento = await response.json();
        setResultado({ hash, data });
      }
    }).catch(() => {
      if (!controller.signal.aborted) {
        setResultado({ hash, error: 'No pudimos cargar el seguimiento. Intenta recargar la página.' });
      }
    });
    return () => controller.abort();
  }, [hash]);

  const data = actual?.data;
  const error = actual?.error || (!/^[0-9a-f-]{36}\.[0-9a-f]{64}$/.test(hash.slice(1)) ? 'Abre el enlace que te envió el taller.' : '');
  const entrega = data?.avances[0]?.fecha_entrega_estimada;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900">
      <div className="mx-auto max-w-xl space-y-5">
        <h1 className="text-2xl font-bold">Seguimiento de tu vehículo</h1>
        {error && <p role="alert">{error}</p>}
        {!data && !error && <p role="status">Cargando seguimiento…</p>}
        {data && (
          <>
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="text-lg font-semibold">{data.vehiculo?.placa || 'Tu visita al taller'}</h2>
              <p>{data.vehiculo?.marca} {data.vehiculo?.linea}</p>
              <p className="mt-3 font-medium text-indigo-700">{estados[data.estado] || 'En seguimiento'}</p>
              {entrega && <p className="mt-2">Entrega estimada: {fecha.format(new Date(entrega))}</p>}
            </section>
            <section>
              <h2 className="mb-3 text-lg font-semibold">Avances del taller</h2>
              {data.avances.length === 0 && <p>Aún no hay avances publicados.</p>}
              <ol className="space-y-3">
                {data.avances.map((avance, index) => (
                  <li key={avance.publicado_at + index} className="rounded-xl border border-slate-200 bg-white p-4">
                    <time dateTime={avance.publicado_at} className="text-sm text-slate-600">
                      {fecha.format(new Date(avance.publicado_at))}
                    </time>
                    <p className="mt-2 whitespace-pre-wrap break-words">{avance.mensaje}</p>
                  </li>
                ))}
              </ol>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
