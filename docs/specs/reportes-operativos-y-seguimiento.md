# Spec — Seguimiento de Entregas y Reportes Operativos

**Estado:** Vigente · **Fecha:** 2026-11-15  
**Archivos:** `backend/src/controllers/ingresos.controller.ts`, `backend/src/routes/ingresos.routes.ts`, `docs/migrations/seguimiento_entregas_y_postmortem.sql`, `frontend/src/components/{ModalSeguimientoIngreso,ReportePostmortem,ReporteHorasTecnicos,ReporteIngresosDiarios}.tsx`

---

## 1. Objetivo y Reglas
* **Alcance:** Promesa de salida tras diagnóstico, alertas de avance (4/6/10h), análisis Post-Mortem, horas laborales por mecánico (sin duplicar carros en paralelo) e ingresos por día/día de la semana.
* **Multi-tenant y Zona Horaria:** Todas las consultas filtran `.eq('empresa_id', req.empresa_id)`. Todos los rangos y ventanas laborales usan `America/Bogota` (UTC-5).

---

## 2. Base de Datos (`seguimiento_entregas_y_postmortem.sql`)
* `taller_empresas`: `intervalo_seguimiento_horas` (`4 | 6 | 10`, default `6`).
* `taller_ingresos`: `fecha_entrega_estimada`, `ultima_actualizacion_estado`, `reprogramaciones_count`, `motivo_demora_actual`.
* `taller_ingresos_bitacora`: `tipo_evento` ampliado con `'seguimiento'` y `'reprogramacion'`.

---

## 3. Contratos de API (`requireAuth`)
* `POST /api/ingresos/:id/seguimiento` — Body: `{ estado_avance, nota?, nueva_fecha_entrega_estimada?, motivo_reprogramacion? }` → actualiza check-in y bitácora.
* `GET | PUT /api/ingresos/config/seguimiento` — Lee/actualiza `intervalo_seguimiento_horas` (`4 | 6 | 10`).
* `GET /api/ingresos/reportes/postmortem?start&end&limit` — Ranking de órdenes entregadas con mayor duración, cuellos por etapa y cumplimiento de promesa.
* `GET /api/ingresos/reportes/horas-tecnicos?start&end&lvStart&lvEnd&sabStart&sabEnd&domLaboral` — Horas en `diagnostico` + `en_reparacion` dentro de horario laboral (unión de intervalos).
* `GET /api/ingresos/reportes/ingresos-diarios?start&end` — Conteo por `fecha_ingreso` (`porFecha` y promedio/total `porDiaSemana`, excluyendo `cancelado`).
  * `porFecha[]`: `{ fecha, label (DD/MM), diaSemana, cantidad, ingresos[] }`; `ingresos[]`: `{ id, placa, vehiculo (marca + línea), estado, hora (HH:mm Bogotá) }` ordenado por hora de recepción.

---

## 4. UI — Ingresos Día a Día (`ReporteIngresosDiarios.tsx`)
* Tocar/clic en una columna de la gráfica (toda la columna, no solo la barra) selecciona el día; por defecto abre el último día con ingresos. Barra seleccionada en índigo oscuro.
* Bajo la gráfica: navegador `‹ día ›` (botones 44px) y lista de placas del día; cada fila enlaza a `/:slug/historial/:id` con vehículo, hora y estado.
* Cambio futuro típico: nuevas columnas en la fila → agregar el campo en `ingresos[]` (backend) y en `IngresoDia` (frontend).

## 5. UI — Encabezado y filtros de fecha (`Reportes.tsx`)
* `renderFiltros()` es compartido por todas las pestañas. Sus contenedores llevan `min-w-0 max-w-full` para que las pastillas hagan scroll horizontal en vez de desbordarse sobre otros controles. **No quitar** al agregar filtros.
* Pestaña `Rendimiento Operativo`: fila 1 = título + toggle `Total del Taller / Detalle`; fila 2 = filtros de fecha. No volver a ponerlos en la misma fila (7 pastillas no caben).
* `frontend/src/index.css`: `#root { min-width: 0; max-width: 100% }`. `body` es flex; sin ese tope cualquier fila ancha (pastillas, tablas) ensancha toda la app y aparece scroll lateral en celular. Aplica a todas las pantallas.
* **Móvil (regla general):** toda vista nueva de reportes debe verificarse a 375px: sin scroll horizontal de página, objetivos táctiles ≥ 44px, textos largos con `truncate`.

---

## 6. Criterios de Éxito
* `Dashboard.tsx` muestra semáforo de promesa y alerta de reporte cada 4/6/10h; `Reportes.tsx` integra las pestañas `Rendimiento Operativo` (ingresos diarios), `Post-Mortem` y `Horas Mecánicos`.
* En `Rendimiento Operativo` ningún control se superpone entre 375px y 1920px, y desde la gráfica diaria se llega al detalle de cualquier servicio en 2 toques.

---

## 7. Historial de Cambios
| Fecha | Cambio | Archivos |
|---|---|---|
| 2026-11-15 | Alta del reporte de ingresos por día y día de la semana (PR #16). | `ingresos.controller.ts`, `ReporteIngresosDiarios.tsx` |
| 2026-11-15 | Detalle por día con placas y enlace al servicio; encabezado de filtros sin superposición y usable en móvil. | `ingresos.controller.ts`, `ReporteIngresosDiarios.tsx`, `Reportes.tsx`, `index.css` |
