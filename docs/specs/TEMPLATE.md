# Ficha — [Nombre del módulo]

**Leer si:** [la tarea toca X, Y o Z] · **Actualizada:** YYYY-MM-DD · **Ticket:** `TALLER-[NUM]` (si hay)

## Archivos
- Backend: `backend/src/controllers/[x].controller.ts` → `[funcionA]`, `[funcionB]`
- Frontend: `frontend/src/pages/[Page].tsx` → `[funcionC]`
- Datos: `docs/migrations/[archivo].sql` → `taller_[tabla]`: `[columna]`, `[columna]`

## Contratos (una línea cada uno)
- `[METODO] /api/[ruta]` (`requireAuth`) — `{ campo, opcional? }` → `{ respuesta }`. Errores propios: 409 si […].

## Reglas de negocio
- [Regla que el código debe seguir cumpliendo y que no es obvia al leerlo.]

## Trampas / no tocar
- [Lo que rompe algo si se cambia sin saber: orden de pasos, valores compartidos, fallbacks, límites.]

<!-- Máximo 30 líneas. Sin JSON de ejemplo, sin flujos narrados, sin checklists de prueba. Funciones por nombre, no por línea. -->
