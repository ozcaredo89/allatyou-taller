# TALLER-CRM-RESENAS-MEJORAS — Mejoras en Mensaje de Reseñas de Google y Descarte con Nota en CRM

```markdown
h2. 📌 Metadatos del Ticket
* *Tipo de Issue:* Story
* *Componente:* Frontend / Backend / Database
* *Prioridad:* Alta
* *Spec Técnico:* docs/specs/crm-resenas-mejoras.md
* *Rama sugerida:* feature/TALLER-CRM-RESENAS-MEJORAS

---

h2. 👤 Historia de Usuario
*Como* administrador o asesor de servicio del taller,
*Quiero* que el mensaje para solicitar reseñas de Google sea más personalizado, cordial y contextual (sin placas ni modelos, mencionando su vehículo y el arreglo realizado con una pregunta acorde), y contar con un campo de notas al descartar cards para documentar por qué no se contacta al cliente (ej. no tiene WhatsApp),
*Para* aumentar la tasa de respuesta en reseñas positivas y mantener un registro claro del motivo de descarte de cada cliente.

---

h2. 🎯 Contexto y Problema
Anteriormente, el mensaje de WhatsApp incluía la placa y modelo de forma mecánica ("Gracias por confiar en nosotros con tu Chevrolet Onix (Placa ABC123)"), resultando frío y poco natural. Además, al descartar un card (por ejemplo si el número no cuenta con WhatsApp activo o es un número fijo), el sistema no permitía registrar el motivo, perdiéndose la trazabilidad del porqué se descartó.

---

h2. 🛠️ Alcance Técnico
*Backend:*
* [x] `backend/src/controllers/crm.controller.ts`:
  * Selección de `resena_descarte_motivo` y `diagnostico_mecanico` en `getResenasPendientes`.
  * Persistencia de `motivo` en `descartarResena`.
  * Endpoint `bulkDescartarResenas` para descartar múltiples órdenes en lote (`POST /api/crm/resenas/bulk-descartar`) de forma atómica y multi-tenant.
  * Limpieza de `resena_descarte_motivo` en `deshacerResena`.
  * Fallbacks resilientes en caso de que la columna esté pendiente de migración en Supabase.
* [x] `backend/src/routes/crm.routes.ts`:
  * Ruta `POST /api/crm/resenas/bulk-descartar` registrada antes de las rutas parametrizadas `:id`.

*Frontend:*
* [x] `frontend/src/pages/CRM.tsx`:
  * Nueva función `construirMensajeResena` que elimina placa/modelo, usa "su vehículo", identifica el trabajo realizado (mano de obra o sistema diagnosticado) y formula una pregunta acorde (ej. respuesta de frenos, suavidad de motor, estabilidad o climatización).
  * Función `detectarResumenServicio` para mostrar chip con el servicio detectado en el card.
  * Modal de descarte mejorado con chips de motivos frecuentes ("No tiene WhatsApp", "Número equivocado", etc.) y textarea para nota personalizada.
  * Selección múltiple con checkboxes en cards activos, selector maestro "Seleccionar todas las activas", barra de acción masiva flotante y modal de descarte en lote con resumen de placas/clientes y asignación de motivo común.
  * Visualización destacada del motivo de descarte en cards descartados con botones para "Editar nota" y "Restaurar".

*Base de Datos:*
* [x] `docs/migrations/20261106_add_resena_descarte_motivo.sql`:
  * Columna `resena_descarte_motivo TEXT` en `taller_ingresos`.

---

h2. 🛡️ Consideraciones de Seguridad y Multi-Tenant
* [x] Todas las consultas y mutaciones filtran estrictamente por `empresa_id = req.empresa_id`.
* [x] Fallback graceful en base de datos para evitar caídas de servicio ante migraciones en progreso.

---

h2. ✅ Criterios de Aceptación (Gherkin)

*Escenario 1: Generación de mensaje contextual de reseña sin placa ni modelo*
* *Dado que* existe una orden entregada con cambio de pastillas de freno,
* *Cuando* el usuario hace clic en "Pedir reseña por WhatsApp",
* *Entonces* el mensaje saluda cordialmente, pregunta cómo ha sentido "su vehículo tras el cambio de pastillas de freno", formula una pregunta sobre la seguridad en el frenado, y no incluye placa ni modelo.

*Escenario 2: Descarte de solicitud con registro de nota*
* *Dado que* un cliente no tiene WhatsApp activo,
* *Cuando* el usuario hace clic en "Descartar" y selecciona el chip "No tiene WhatsApp",
* *Entonces* el card pasa a descartado y el motivo "No tiene WhatsApp" queda guardado y visible en "Ver descartadas".

*Escenario 3: Descarte múltiple de solicitudes en lote*
* *Dado que* existen varias órdenes activas en reseñas pendientes,
* *Cuando* el usuario selecciona varias casillas o usa "Seleccionar todas las activas" y confirma el descarte masivo con un motivo común,
* *Entonces* el sistema envía la petición atómica al endpoint `POST /api/crm/resenas/bulk-descartar` y todas las órdenes seleccionadas se descartan simultáneamente con dicho motivo.

---

h2. 🧪 Plan de Pruebas / QA Checklist
* [x] Compilación de backend (`node node_modules/typescript/bin/tsc --noEmit`) - EXITOSA.
* [x] Compilación de frontend (`node node_modules/typescript/bin/tsc --noEmit`) - EXITOSA.
* [x] Build de producción frontend (`vite build`) - EXITOSA.
```
