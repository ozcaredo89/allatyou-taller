# Ficha — Sincronización de gastos hacia AllAtYou Renting

**Leer si:** la tarea toca el envío de gastos a Renting al dar salida a un vehículo de la flota propia · **Actualizada:** 2026-11-16 · **Ticket:** `TALLER-RENTING-ANTICIPO`

## Archivos
- Backend: `services/allatyouSync.service.ts` → `evaluarAplicaRenting`; `controllers/ingresos.controller.ts` → `syncIngresoToRenting`, `getRentingLeasingInfo`
- Frontend: `components/RentingSyncModal.tsx`; lo abren `pages/{Checkout,Dashboard,HistorialDetalle}.tsx`
- Datos: `docs/migrations/20261014_renting_sync_fields.sql` → `taller_ingresos`: `renting_sync_at`, `renting_expense_ids`, `renting_sync_error`
- Entorno: `ALLATYOU_RENTING_EMPRESA_ID`, `ALLATYOU_RENTING_CLIENTE_DOC`, `ALLATYOU_RENTING_API_URL`, `ALLATYOU_RENTING_USER`, `ALLATYOU_RENTING_PASS`

## Contratos (`requireAuth`, bajo `/api/ingresos`)
- `POST /:id/renting-sync` — `{ date: 'YYYY-MM-DD', description, items: [{ item, amount > 0, category: 'Mantenimiento' }], … forma de pago }`. 403 si la orden no aplica, 409 si ya se sincronizó o está en proceso.
- `GET /:id/renting-leasing` → `{ has_leasing }`.
- `getIngresoById`, `getIngresosActivos`, `getHistorial` y `updateIngreso` devuelven `aplica_renting: boolean`.

## Reglas de negocio
- Solo aplica cuando la empresa y el documento del cliente coinciden con las dos variables de entorno; si falta cualquiera de los cuatro datos, es `false` (falla cerrado).
- El usuario siempre confirma en el modal; si lo cierra, la orden queda `entregado` con la insignia "Gasto Renting pendiente" y un botón para reintentar después.
- Forma de pago, por defecto gasto simple (`POST /expenses`). Opcionales y excluyentes entre sí: descontar del fondo de mantenimiento (solo si `has_leasing`; envía `apply_to_leasing` y `leasing_excess_method` `cash | advance`) o cobrar al conductor con anticipo (`POST /advances` y luego `POST /expenses`).
- Nunca se crea un anticipo sin que el usuario lo haya elegido y confirmado.

## Trampas / no tocar
- El endpoint **vuelve a evaluar** `evaluarAplicaRenting` con la empresa del JWT y el documento leído de la base; no confiar en lo que mande el frontend.
- La placa se toma de la orden en la base, nunca del cuerpo de la petición.
- Reclamo atómico: `UPDATE … SET renting_sync_at = NOW() WHERE id AND empresa_id AND renting_sync_at IS NULL`. Si Renting falla o tarda más de 10 s, se revierte a `NULL` y se guarda `renting_sync_error`. Quitar la reversión deja órdenes bloqueadas.
- Con anticipo: si el gasto falla después de crear el anticipo, se borra con `DELETE /advances/:id`. No cambiar el orden.
- Si no se pudo consultar el leasing, el modal bloquea el envío hasta reintentar.
