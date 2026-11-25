# TALLER-INVENTARIO — Bodega, órdenes y ventas de mostrador

- **Tipo** Story de inventario para el taller.
- **Módulos** Bodega, Checkout, Gastos, Dashboard y Reportes.
- Catálogo con costos ponderados, stock físico, comprometido y mínimo por producto.
- La entrega descuenta las líneas con stock. Las demás quedan pendientes y se reintentan guardando la orden entregada después de registrar la entrada.
- Las compras pueden generar un gasto en Repuestos. Su anulación revierte el stock y elimina el gasto generado, con referencia en el historial.
- Mostrador registra como ingreso el importe cobrado y muestra la utilidad tras descontar el costo de la salida. Las ventas anuladas se excluyen.
- **Migraciones** `docs/migrations/create_inventario.sql` y `docs/migrations/update_inventario_operativo.sql`.
- **Configuración** Inventario usa el pool PostgreSQL existente. `DATABASE_URL` habilita las migraciones automáticas en Railway.
- **Validación** Type-check de backend y frontend. Migraciones probadas en PostgreSQL aislado.
