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

---

## 4. Criterios de Éxito
* `Dashboard.tsx` muestra semáforo de promesa y alerta de reporte cada 4/6/10h; `Reportes.tsx` integra las pestañas `Rendimiento Operativo` (ingresos diarios), `Post-Mortem` y `Horas Mecánicos`.
