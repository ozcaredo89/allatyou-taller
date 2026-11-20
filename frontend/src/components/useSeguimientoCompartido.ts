import { useEffect, useState } from 'react';
import api from '../services/api';
import type { Evidencia } from './EvidenciasAvance';

interface Publicacion {
  evento_id: string;
  mensaje: string;
  fecha_entrega_estimada: string | null;
}

interface Enlace {
  token: string;
  vence_at: string;
}

export function useSeguimientoCompartido(ingresoId: string) {
  const ruta = '/ingresos/' + ingresoId + '/seguimiento-cliente';
  const [enlace, setEnlace] = useState<Enlace | null>(null);
  const [publicaciones, setPublicaciones] = useState<Publicacion[]>([]);
  const [evidencias, setEvidencias] = useState<(Evidencia & { evento_id: string })[]>([]);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    api.get(ruta, { signal: controller.signal }).then(({ data }) => {
      setEnlace(data.enlace);
      setPublicaciones(data.publicaciones);
      setEvidencias(data.evidencias || []);
    }).catch(() => {
      if (!controller.signal.aborted) setError('No se pudo cargar el seguimiento compartido.');
    }).finally(() => {
      if (!controller.signal.aborted) setCargando(false);
    });
    return () => controller.abort();
  }, [ruta]);

  async function ejecutar(accion: () => Promise<void>) {
    setOcupado(true);
    setError('');
    try {
      await accion();
    } catch {
      setError('No se pudo completar la acción. Intenta de nuevo.');
    } finally {
      setOcupado(false);
    }
  }

  return {
    cargando, ocupado, error, copiado, enlace, publicaciones, evidencias,
    generar: () => ejecutar(async () => {
      const { data } = await api.post(ruta + '/enlace');
      setEnlace(data);
      setCopiado(false);
    }),
    revocar: () => ejecutar(async () => {
      await api.delete(ruta + '/enlace');
      setEnlace(null);
      setCopiado(false);
    }),
    copiar: (url: string) => ejecutar(async () => {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
    }),
    publicar: (id: string, mensaje: string, mostrar_fecha: boolean, onSuccess: () => void) => ejecutar(async () => {
      const { data } = await api.put(ruta + '/avances/' + id, { mensaje, mostrar_fecha });
      setPublicaciones(prev => [data, ...prev.filter(p => p.evento_id !== id)]);
      onSuccess();
    }),
    retirar: (id: string) => ejecutar(async () => {
      await api.delete(ruta + '/avances/' + id);
      setPublicaciones(prev => prev.filter(p => p.evento_id !== id));
    })
  };
}
