# Ficha — Seguimiento de entregas y reportes operativos

**Leer si:** la tarea toca la promesa de entrega, las alertas de avance o las pestañas de `Reportes` · **Actualizada:** 2026-11-16

## Archivos
- Backend: `backend/src/controllers/ingresos.controller.ts` → `registrarSeguimiento`, `getConfigSeguimiento`, `updateConfigSeguimiento`, `getReportesFinanzas`, `getReportesFinanzasDetalle`, `getReportesRepuestos`, `getReportesOperaciones`, `getReportePostmortem`, `getReporteHorasTecnicos`, `getReporteIngresosDiarios`
- Frontend: `pages/Reportes.tsx` (pestañas `financiero`, `operativo`, `repuestos`, `postmortem`, `horas_tecnicos` en `activeTab`), `components/{ReportePostmortem,ReporteHorasTecnicos,ReporteIngresosDiarios,ReporteRepuestos,RentabilidadRepuestos}.tsx`, `components/ModalSeguimientoIngreso.tsx`, semáforo en `pages/Dashboard.tsx`
- Datos: `docs/migrations/seguimiento_entregas_y_postmortem.sql` → `taller_empresas.intervalo_seguimiento_horas`; `taller_ingresos`: `fecha_entrega_estimada`, `ultima_actualizacion_estado`, `reprogramaciones_count`, `motivo_demora_actual`; `taller_ingresos_bitacora.tipo_evento` admite `seguimiento` y `reprogramacion`

## Contratos (todos con `requireAuth`, bajo `/api/ingresos`)
- `POST /:id/seguimiento` — `{ estado_avance, nota?, nueva_fecha_entrega_estimada?, motivo_reprogramacion? }` → actualiza el reporte de avance y la bitácora.
- `GET|PUT /config/seguimiento` — `intervalo_seguimiento_horas` (`4 | 6 | 10`, por defecto `6`).
- `GET /reportes/postmortem?start&end&limit` — órdenes entregadas más lentas, cuellos por etapa y cumplimiento de la promesa.
- `GET /reportes/horas-tecnicos?start&end&lvStart&lvEnd&sabStart&sabEnd&domLaboral` — horas en `diagnostico` + `en_reparacion` dentro del horario laboral.
- `GET /reportes/ingresos-diarios?start&end` — `porFecha` y `porDiaSemana`.
- `GET /reportes/{finanzas,finanzas/detalle,operaciones,repuestos}`.

## Reglas de negocio
- Las horas por mecánico son la **unión de intervalos**: dos carros en paralelo no suman doble.
- Ingresos diarios cuenta por `fecha_ingreso` y excluye `cancelado`.
- Todos los rangos y ventanas laborales se calculan en `America/Bogota`.

## Trampas / no tocar
- `Reportes.tsx` (~3.300 líneas) e `ingresos.controller.ts` (~3.000): buscar por nombre de función o por `activeTab === '<pestaña>'`, nunca leer completos.
- Un reporte nuevo va como componente propio en `components/Reporte*.tsx` y se monta en una pestaña; no agrandar `Reportes.tsx`.
- En `ingresos.routes.ts` las rutas fijas (`/reportes/*`, `/config/*`) van antes de `/:id`; una ruta nueva puesta después queda capturada por `/:id`.
