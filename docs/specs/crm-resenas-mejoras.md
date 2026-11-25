# Ficha — CRM: reseñas de Google y retención

**Leer si:** la tarea toca la solicitud de reseñas, el descarte de tarjetas o los mensajes de WhatsApp del CRM · **Actualizada:** 2026-11-16 · **Ticket:** `TALLER-CRM-RESENAS-MEJORAS`

## Archivos
- Backend: `backend/src/controllers/crm.controller.ts` → `getResenasPendientes`, `getResenasStats`, `marcarResenaIntentado`, `confirmarResena`, `deshacerResena`, `descartarResena`, `bulkDescartarResenas`, `getRetencionProspectos`, `getCrmConfig`, `updateCrmConfig`, `toggleNoContactar`
- Frontend: `frontend/src/pages/CRM.tsx` → `construirMensajeResena`, `detectarResumenServicio`; enlaces con `utils/whatsapp.ts` → `generarLinkWhatsApp`
- Datos: `taller_ingresos`: `resena_estado`, `resena_descarte_motivo` (`backend/migrations/20261106_*.sql`); retención en la vista `taller_mv_proximos_mantenimientos` (`crm_retention_v2.sql`)

## Contratos (`requireAuth`, bajo `/api/crm`)
- `GET /resenas`, `GET /resenas/stats`, `GET /retencion`, `GET|PUT /config`.
- `POST /resenas/:id/{intentar,confirmar,deshacer}`.
- `POST /resenas/:id/descartar` — `{ motivo? }` → `{ success, estado: 'descartado', motivo }`.
- `POST /resenas/bulk-descartar` — `{ ids: string[], motivo? }` → `{ success, descartados, ids, motivo }`; 400 si `ids` está vacío.
- `PATCH /clientes/:clienteId/no-contactar` — baja de mensajes comerciales (Ley 1581).

## Reglas de negocio
- Son elegibles las órdenes entregadas en los últimos 60 días.
- El mensaje de reseña **no** lleva placa ni marca/modelo: dice "su vehículo", nombra el trabajo hecho (de `items_factura`, `diagnostico_mecanico` o `motivo_visita`) y cierra con una pregunta acorde al servicio.
- Descartar guarda un motivo (opción rápida o nota libre), visible y editable en "Ver descartadas".
- Restaurar (`deshacer`) limpia `resena_descarte_motivo`.
- "No contactar más" corta reseñas **y** recordatorios de mantenimiento.

## Trampas / no tocar
- El descarte masivo es una sola operación acotada al taller (`id = ANY(ids) AND empresa_id`); no convertirlo en un ciclo de llamadas individuales.
- Si la columna `resena_descarte_motivo` aún no existe, el backend reintenta sin ella para no fallar la acción; conservar ese reintento.
- `CRM.tsx` tiene ~1.900 líneas: buscar por nombre de función.
- Las confirmaciones usan `ModalConfirmacion`, no diálogos del navegador (ver `ui-design-system.md`).
