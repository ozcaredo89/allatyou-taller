# Ficha — Inventario del taller

**Leer si:** la tarea toca bodega, descuento por entrega, compras o mostrador

## Archivos
- Backend: `backend/src/controllers/inventario.controller.ts`, `ingresos.controller.ts` → `updateIngreso`, `getReportesFinanzas`.
- Frontend: `frontend/src/pages/Inventario.tsx`, `Checkout.tsx`, `Dashboard.tsx`, `Reportes.tsx`.
- Datos: `backend/migrations/create_inventario.sql` y `update_inventario_operativo.sql` → ítems, movimientos y salidas vigentes.

## Contratos
- `GET/POST /api/inventario/items`, `PUT/DELETE /api/inventario/items/:id` — catálogo por empresa; DELETE desactiva.
- `GET/POST /api/inventario/movimientos`, `POST /api/inventario/movimientos/:id/anular` — compras, ajustes, ventas e historial.
- `GET /api/inventario/pendientes?pagina=…` — líneas de órdenes entregadas cuyo descuento sigue pendiente.
- `GET /api/inventario/aceites/sugerencia?vehiculo_id=…` y `/aceites/resumen?desde=…&hasta=…` — último cambio y métricas por taller en hora Bogotá.
- `PUT /api/ingresos/:id` — devuelve `inventario_faltantes`; 409 si cambió la versión de la orden.

## Reglas de negocio
- La entrega descuenta líneas completas disponibles. Las pendientes se reintentan guardando la orden entregada.
- Aceite en tarro usa unidades y contenido por envase. Granel guarda stock y mínimos en litros; la interfaz prioriza cuartos, galones y canecas.
- La línea conserva cantidad y precio de captura. Se redondean litros a 0,001 y precio sugerido por captura a 0,01 COP. Total = cantidad capturada × ese precio, redondeado a 0,01 COP.
- El gasto usa cantidad original × costo de factura, redondeado a 0,01 COP. El costo de stock divide el importe sin redondear por los litros almacenados.
- Medición en cuartos, galones o litros. Envía litros a 0,001, incluye todas las entregas pendientes y revalida saldo y pendientes.
- Con stock o movimientos quedan bloqueados unidad, granel, contenido y capacidad. Los metadatos comerciales se pueden editar.
- Anular conserva el movimiento original y revierte el stock. Si la compra generó un gasto, lo retira del P&L.
- Mostrador granel cobra cantidad × precio de captura a 0,01 COP. Guarda ese importe para reportes, sin recalcular con litros redondeados. Conserva el precio base de catálogo si no se editó y excluye ventas anuladas.

## Trampas / no tocar
- Filtrar por empresa_id en API y RPC. Inventario reutiliza el pool PostgreSQL de Taller mediante DATABASE_URL.
- Controlar la concurrencia con `estado` y `updated_at`. El JSON de ítems va en el cuerpo del PATCH.
- Prueba SQL: `docker run --rm -p 127.0.0.1:55438:5432 -e POSTGRES_PASSWORD=inventario_test -e POSTGRES_DB=inventario_test postgres:16-alpine`; en backend, `TEST_DATABASE_URL=postgresql://postgres:inventario_test@127.0.0.1:55438/inventario_test npm run test:inventario`.
