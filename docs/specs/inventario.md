# Ficha — Inventario del taller

**Leer si:** la tarea toca bodega, descuento por entrega, compras o mostrador · **Actualizada:** 2026-11-20

## Archivos
- Backend: `backend/src/controllers/inventario.controller.ts`, `ingresos.controller.ts` → `updateIngreso`, `getReportesFinanzas`.
- Frontend: `frontend/src/pages/Inventario.tsx`, `Checkout.tsx`, `Dashboard.tsx`, `Reportes.tsx`.
- Datos: `docs/migrations/create_inventario.sql` y `update_inventario_operativo.sql` → ítems, movimientos y salidas vigentes.

## Contratos
- `GET/POST /api/inventario/items`, `PUT/DELETE /api/inventario/items/:id` — catálogo por empresa; DELETE desactiva.
- `GET/POST /api/inventario/movimientos`, `POST /api/inventario/movimientos/:id/anular` — compras, ajustes, ventas e historial.
- `GET /api/inventario/pendientes?pagina=…` — líneas de órdenes entregadas cuyo descuento sigue pendiente.
- `PUT /api/ingresos/:id` — devuelve `inventario_faltantes`; 409 si cambió la versión de la orden.

## Reglas de negocio
- La entrega descuenta líneas completas disponibles. Las pendientes se reintentan guardando la orden entregada.
- Anular conserva el movimiento original y revierte el stock. Si la compra generó un gasto, lo retira del P&L.
- Mostrador registra el precio cobrado como ingreso y la diferencia frente al costo como utilidad bruta. Excluye las ventas anuladas.

## Trampas / no tocar
- Filtrar por empresa_id en API y RPC. Inventario reutiliza el pool PostgreSQL de Taller mediante DATABASE_URL.
- Controlar la concurrencia con `estado` y `updated_at`. El JSON de ítems va en el cuerpo del PATCH.
- DATABASE_URL habilita también las migraciones automáticas en Railway.
