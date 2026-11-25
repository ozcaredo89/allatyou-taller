# Ficha — Inventario del taller

**Leer si:** la tarea toca bodega, descuento por entrega, compras o mostrador

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
- Granel guarda existencias y mínimos en litros. La compra usa litros, galones o tambores con la capacidad configurada (`update_inventario_operativo_granel.sql`).
- La línea conserva cantidad y precio de captura. Se redondean litros a 0,001 y precio sugerido por captura a 0,01 COP. Total = cantidad capturada × ese precio, redondeado a 0,01 COP.
- El gasto usa cantidad original × costo de factura, redondeado a 0,01 COP. El costo de stock divide el importe sin redondear por los litros almacenados.
- Medición física registra un `AJUSTE` por litros medidos menos stock en libros. Si cambió el stock, vuelve a confirmar sobre el saldo actualizado.
- Anular conserva el movimiento original y revierte el stock. Si la compra generó un gasto, lo retira del P&L.
- Mostrador registra el precio cobrado como ingreso y la diferencia frente al costo como utilidad bruta. Excluye las ventas anuladas.

## Trampas / no tocar
- Filtrar por empresa_id en API y RPC. Inventario reutiliza el pool PostgreSQL de Taller mediante DATABASE_URL.
- Controlar la concurrencia con `estado` y `updated_at`. El JSON de ítems va en el cuerpo del PATCH.
- DATABASE_URL habilita también las migraciones automáticas en Railway.
