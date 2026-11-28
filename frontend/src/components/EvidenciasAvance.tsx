import appI18n from '../i18n';
import { useEffect, useRef, useState } from 'react';
import api from '../services/api';

export interface Evidencia {
  id: string;
  tipo: 'image/jpeg' | 'video/mp4';
}

const publicBase = (import.meta.env.VITE_API_URL || 'http://localhost:3001/api').replace(/\/$/, '');

function Archivo({ evidencia, ingresoId, token, numero }: {
  evidencia: Evidencia;
  ingresoId?: string;
  token?: string;
  numero: number;
}) {
  const video = evidencia.tipo === 'video/mp4';
  const [intento, setIntento] = useState(0);
  const [resultado, setResultado] = useState<{ intento: number; url?: string }>();
  const contenedor = useRef<HTMLDivElement>(null);
  const actual = resultado?.intento === intento ? resultado : undefined;

  useEffect(() => {
    const elemento = contenedor.current;
    if (video || !elemento || intento) return;
    if (!('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setIntento(1);
        observer.disconnect();
      }
    }, { rootMargin: '150px' });
    observer.observe(elemento);
    return () => observer.disconnect();
  }, [video, intento]);

  useEffect(() => {
    if (!intento) return;
    const controller = new AbortController();
    let objeto: string | undefined;
    const abrir = async () => {
      try {
        let blob: Blob;
        if (token) {
          const response = await fetch(publicBase + '/public/seguimiento/evidencias/' + evidencia.id, {
            headers: { Authorization: 'Bearer ' + token },
            cache: 'no-store',
            signal: controller.signal
          });
          if (!response.ok) throw new Error('Evidencia no disponible.');
          blob = await response.blob();
        } else {
          const response = await api.get<Blob>('/ingresos/' + ingresoId + '/seguimiento-cliente/evidencias/' + evidencia.id,
            { responseType: 'blob', signal: controller.signal });
          blob = response.data;
        }
        if (controller.signal.aborted) return;
        objeto = URL.createObjectURL(blob);
        setResultado({ intento, url: objeto });
      } catch {
        if (!controller.signal.aborted) setResultado({ intento });
      }
    };
    void abrir();
    return () => {
      controller.abort();
      if (objeto) URL.revokeObjectURL(objeto);
    };
  }, [intento, token, ingresoId, evidencia.id]);

  const etiqueta = video ? 'Video ' + numero : 'Foto ' + numero;
  return (
    <div ref={contenedor} className="rounded-lg bg-slate-100">
      {actual?.url ? (
        video ? <video src={actual.url} controls playsInline aria-label={etiqueta} className="w-full rounded-lg" />
          : <a href={actual.url} target="_blank" rel="noreferrer">
            <img src={actual.url} alt={etiqueta + ' del avance'} className="max-h-80 w-full rounded-lg object-contain" />
          </a>
      ) : intento && !actual ? (
        <p role="status" className="p-3 text-sm text-slate-600">{appI18n.t("ui.ReporteRepuestos.loading")} {etiqueta.toLowerCase()}…</p>
      ) : (
        <button type="button" className="p-3 text-sm font-medium text-indigo-800" onClick={() => setIntento(n => n + 1)}>
          {actual ? appI18n.t("ui.Inventario.retry") : appI18n.t("ui.CRM.view")}{etiqueta.toLowerCase()}
        </button>
      )}
    </div>
  );
}

export default function EvidenciasAvance({ evidencias, ingresoId, token }: {
  evidencias: Evidencia[];
  ingresoId?: string;
  token?: string;
}) {
  if (!evidencias.length) return null;
  return (
    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
      {evidencias.map((evidencia, index) => (
        <Archivo key={evidencia.id + (token ?? '')} evidencia={evidencia} numero={index + 1} ingresoId={ingresoId} token={token} />
      ))}
    </div>
  );
}
