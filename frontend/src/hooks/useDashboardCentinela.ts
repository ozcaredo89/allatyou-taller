import { useEffect, useRef, useState, useCallback } from 'react';
import api from '../services/api';

interface CentinelaResponse {
  version: string;
  totalActivos: number;
  lastModified: string;
  timestamp: number;
}

interface UseDashboardCentinelaOptions {
  /** Función que descarga todos los datos completos del Dashboard de forma silenciosa */
  onRefresh: () => Promise<void> | void;
  /** Intervalo del centinela en pantalla activa (por defecto 30 segundos) */
  intervalMs?: number;
  /** Intervalo mínimo para evitar re-chequeos seguidos por foco/búsqueda rápida (por defecto 8 segundos) */
  minCheckIntervalMs?: number;
  /** Tiempo de inactividad del usuario tras el cual se pausa el centinela (por defecto 10 minutos) */
  idleTimeoutMs?: number;
  /** Si el hook debe estar activo */
  enabled?: boolean;
  /** Pausar chequeos cuando un modal o flujo interactivo esté abierto */
  pause?: boolean;
}

export function useDashboardCentinela({
  onRefresh,
  intervalMs = 30000,
  minCheckIntervalMs = 8000,
  idleTimeoutMs = 10 * 60 * 1000,
  enabled = true,
  pause = false,
}: UseDashboardCentinelaOptions) {
  // Solo se activa en manual (clic del usuario en Refrescar), NO en el polling silencioso
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  const currentVersionRef = useRef<string | null>(null);
  const lastCheckTimestampRef = useRef<number>(0);
  const lastUserActivityRef = useRef<number>(Date.now());
  const isExecutingRef = useRef<boolean>(false);
  const onRefreshRef = useRef(onRefresh);
  const pauseRef = useRef(pause);
  const prevPauseRef = useRef(pause);

  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    pauseRef.current = pause;
  }, [pause]);

  // Actualiza la marca de tiempo de actividad del usuario
  const registerUserActivity = useCallback(() => {
    lastUserActivityRef.current = Date.now();
  }, []);

  /**
   * Chequea el Centinela ultra-liviano.
   * Si forceFullRefresh = true, salta la comparación y fuerza la recarga completa mostrando feedback manual.
   */
  const checkCentinela = useCallback(
    async (forceFullRefresh = false): Promise<boolean> => {
      // Si está pausado (ej. modal abierto) y no es manual forzado por el usuario, abortar
      if (!enabled || (pauseRef.current && !forceFullRefresh) || isExecutingRef.current) {
        return false;
      }

      const now = Date.now();
      // Si no es forzado manualmente, respetar el throttle mínimo
      if (!forceFullRefresh && now - lastCheckTimestampRef.current < minCheckIntervalMs) {
        return false;
      }

      try {
        isExecutingRef.current = true;
        if (forceFullRefresh) {
          setIsManualRefreshing(true);
        }
        lastCheckTimestampRef.current = now;

        if (forceFullRefresh) {
          await onRefreshRef.current();
          // Obtener la versión fresca post-refresco
          try {
            const { data } = await api.get<CentinelaResponse>('/ingresos/centinela');
            if (data?.version) {
              currentVersionRef.current = data.version;
            }
          } catch {
            // Ignorar fallo secundario de versión
          }
          setLastSyncedAt(new Date());
          return true;
        }

        // Llamada ultra-liviana al centinela (~5ms, 2 consultas indexadas)
        const { data } = await api.get<CentinelaResponse>('/ingresos/centinela');
        const newVersion = data?.version;

        if (!newVersion) {
          return false;
        }

        // Primer arranque: sincronizar la versión inicial sin refresco extra si ya cargó
        if (currentVersionRef.current === null) {
          currentVersionRef.current = newVersion;
          setLastSyncedAt(new Date());
          return false;
        }

        // Si la versión en el backend cambió (otro usuario modificó algo)
        if (newVersion !== currentVersionRef.current) {
          currentVersionRef.current = newVersion;
          await onRefreshRef.current();
          setLastSyncedAt(new Date());
          return true;
        }

        // No hubo cambios: actualizar marca de tiempo silenciosamente
        setLastSyncedAt(new Date());
        return false;
      } catch (err) {
        console.warn('[Centinela] Error de verificación silenciosa:', err);
        return false;
      } finally {
        isExecutingRef.current = false;
        if (forceFullRefresh) {
          setIsManualRefreshing(false);
        }
      }
    },
    [enabled, minCheckIntervalMs]
  );

  // 1. Escuchar actividad del usuario para detectar si está frente a la pantalla
  useEffect(() => {
    if (!enabled) return;

    const handleActivity = () => {
      lastUserActivityRef.current = Date.now();
    };

    window.addEventListener('mousemove', handleActivity, { passive: true });
    window.addEventListener('keydown', handleActivity, { passive: true });
    window.addEventListener('touchstart', handleActivity, { passive: true });
    window.addEventListener('scroll', handleActivity, { passive: true });

    return () => {
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('touchstart', handleActivity);
      window.removeEventListener('scroll', handleActivity);
    };
  }, [enabled]);

  // 2. Reactivar al volver a la pestaña (Visibility change & Focus)
  useEffect(() => {
    if (!enabled) return;

    const handleFocusOrVisible = () => {
      if (document.visibilityState === 'visible' && !pauseRef.current) {
        registerUserActivity();
        const now = Date.now();
        // Si han pasado más de minCheckIntervalMs desde la última consulta
        if (now - lastCheckTimestampRef.current >= minCheckIntervalMs) {
          checkCentinela(false);
        }
      }
    };

    window.addEventListener('focus', handleFocusOrVisible);
    document.addEventListener('visibilitychange', handleFocusOrVisible);

    return () => {
      window.removeEventListener('focus', handleFocusOrVisible);
      document.removeEventListener('visibilitychange', handleFocusOrVisible);
    };
  }, [enabled, minCheckIntervalMs, checkCentinela, registerUserActivity]);

  // 3. Reanudar y comprobar inmediatamente al cerrar un modal
  useEffect(() => {
    if (!enabled) return;

    if (prevPauseRef.current && !pause) {
      registerUserActivity();
      const now = Date.now();
      if (now - lastCheckTimestampRef.current >= minCheckIntervalMs) {
        checkCentinela(false);
      }
    }
    prevPauseRef.current = pause;
  }, [enabled, pause, minCheckIntervalMs, checkCentinela, registerUserActivity]);

  // 4. Heartbeat prudente mientras la pantalla esté activa y el usuario no esté ocioso
  useEffect(() => {
    if (!enabled) return;

    const timer = setInterval(() => {
      // Regla 1: Solo si la pestaña es visible y no está pausado por un modal
      if (document.hidden || document.visibilityState !== 'visible' || pauseRef.current) {
        return;
      }

      const now = Date.now();
      // Regla 2: Pausar si el usuario lleva inactivo más de idleTimeoutMs (ej. pantalla abandonada)
      if (now - lastUserActivityRef.current > idleTimeoutMs) {
        return;
      }

      // Regla 3: Si transcurrió el intervalo previsto
      if (now - lastCheckTimestampRef.current >= intervalMs) {
        checkCentinela(false);
      }
    }, 5000); // Revisa cada 5s si corresponde disparar el latido

    return () => clearInterval(timer);
  }, [enabled, intervalMs, idleTimeoutMs, checkCentinela]);

  return {
    isManualRefreshing,
    lastSyncedAt,
    checkCentinela,
    registerUserActivity,
  };
}
