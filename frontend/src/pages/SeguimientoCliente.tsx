import appI18n, { displayLocale } from '../i18n';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import EvidenciasAvance, { type Evidencia } from '../components/EvidenciasAvance';

interface Seguimiento {
  estado: string;
  vehiculo: { placa: string; marca?: string; linea?: string } | null;
  avances: { mensaje: string; publicado_at: string; fecha_entrega_estimada: string | null; evidencias?: Evidencia[] }[];
}

const fecha = (date: Date) => new Intl.DateTimeFormat(displayLocale(), {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Bogota'
}).format(date);

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
        setResultado({ hash, error: appI18n.t('ui.SeguimientoCliente.expired') });
      } else {
        if (!response.ok) throw new Error();
        const data: Seguimiento = await response.json();
        setResultado({ hash, data });
      }
    }).catch(() => {
      if (!controller.signal.aborted) {
        setResultado({ hash, error: appI18n.t('ui.SeguimientoCliente.load_error') });
      }
    });
    return () => controller.abort();
  }, [hash]);

  const data = actual?.data;
  const error = actual?.error || (!/^[0-9a-f-]{36}\.[0-9a-f]{64}$/.test(hash.slice(1)) ? appI18n.t('ui.SeguimientoCliente.open_link') : '');
  const entrega = data?.avances[0]?.fecha_entrega_estimada;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900">
      <div className="mx-auto max-w-xl space-y-5">
        <h1 className="text-2xl font-bold">{appI18n.t("ui.SeguimientoCliente.track_your_vehicle")}</h1>
        {error && <p role="alert">{error}</p>}
        {!data && !error && <p role="status">{appI18n.t("ui.SeguimientoCliente.loading_updates")}</p>}
        {data && (
          <>
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="text-lg font-semibold">{data.vehiculo?.placa || appI18n.t('ui.SeguimientoCliente.visit')}</h2>
              <p>{data.vehiculo?.marca} {data.vehiculo?.linea}</p>
              <p className="mt-3 font-medium text-indigo-700">{appI18n.t(`ui.SeguimientoCliente.${data.estado}`, { defaultValue: appI18n.t('ui.SeguimientoCliente.status_unknown') })}</p>
              {entrega && <p className="mt-2">{appI18n.t("ui.SeguimientoCliente.estimated_delivery")} {fecha(new Date(entrega))}</p>}
            </section>
            <section>
              <h2 className="mb-3 text-lg font-semibold">{appI18n.t("ui.SeguimientoCliente.workshop_updates")}</h2>
              {data.avances.length === 0 && <p>{appI18n.t("ui.SeguimientoCliente.no_updates_have_been_published_yet")}</p>}
              <ol className="space-y-3">
                {data.avances.map((avance, index) => (
                  <li key={avance.publicado_at + index} className="rounded-xl border border-slate-200 bg-white p-4">
                    <time dateTime={avance.publicado_at} className="text-sm text-slate-600">
                      {fecha(new Date(avance.publicado_at))}
                    </time>
                    <p className="mt-2 whitespace-pre-wrap break-words">{avance.mensaje}</p>
                    <EvidenciasAvance evidencias={avance.evidencias || []} token={hash.slice(1)} />
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
