# Spec — Mejoras en Solicitud de Reseñas de Google y Descarte con Nota en CRM

**Estado:** Vigente · **Fecha:** 2026-11-06  
**Ticket JIRA:** `TALLER-CRM-RESENAS-MEJORAS`  
**Módulos afectados:**
- Backend: `backend/src/controllers/crm.controller.ts`
- Frontend: `frontend/src/pages/CRM.tsx`
- Base de datos: `docs/migrations/20261106_add_resena_descarte_motivo.sql`

---

## 1. Contexto Operativo y Flujo de Usuario
El módulo CRM de Retención permite al taller solicitar reseñas de Google a los clientes cuyas órdenes fueron entregadas en los últimos 60 días. Se identificaron dos mejoras críticas:
1. **Mensaje de WhatsApp más humano, contextual y sin datos técnicos redundantes**: En lugar de incluir la placa y modelo del vehículo (que sonaba robótico), ahora se refiere cordialmente a "su vehículo", menciona el trabajo o diagnóstico realizado (extraído de `items_factura` / `diagnostico_mecanico` / `motivo_visita`), e incluye una pregunta acorde al servicio prestado (ej. respuesta de frenos, rendimiento de motor, estabilidad de dirección o confort del aire acondicionado).
2. **Registro de notas al descartar cards**: Durante la gestión del CRM se presentan casos como clientes sin WhatsApp, números fijos o erróneos, o reclamos pendientes. Se añade la capacidad de seleccionar un motivo rápido (chips) o escribir una nota libre al descartar un card, la cual queda registrada y visible en la sección "Ver descartadas", permitiendo además editarla o restaurar la orden.

Flujo:
1. **Paso 1:** El asesor hace clic en "Pedir reseña por WhatsApp" en un card pendiente; se genera un mensaje personalizado y cordial sin placa ni modelo, enfocado en el trabajo realizado y con pregunta contextual.
2. **Paso 2:** Si el cliente no tiene WhatsApp o el número es incorrecto, el asesor pulsa "Descartar".
3. **Paso 3:** Se despliega el modal de confirmación con chips de motivos frecuentes ("No tiene WhatsApp", "Número equivocado o inactivo", etc.) y un campo de nota opcional.
4. **Paso 4:** El backend persiste `resena_descarte_motivo` y `resena_estado = 'descartado'`. En la sección de descartadas, el motivo se visualiza de forma destacada y puede editarse o restaurarse.

---

## 2. Reglas de Negocio y Seguridad Multi-Tenant
1. **Aislamiento Multi-Tenant (Obligatorio):**
   - Todas las consultas en `crm.controller.ts` filtran explícitamente por `.eq('empresa_id', req.empresa_id)`.
   - Modificaciones de estado o nota de descarte solo afectan a registros del tenant autenticado.
2. **Resiliencia y Fallback de Esquema:**
   - Si la columna `resena_descarte_motivo` aún no existe en Supabase al momento de la solicitud, el backend realiza un reintento automático sin fallar la acción principal del usuario.
3. **Restauración:**
   - Al restaurar un card descartado a pendiente (`/crm/resenas/:id/deshacer`), se limpia el motivo de descarte (`resena_descarte_motivo = null`).

---

## 3. Modelo de Datos y Migraciones SQL
- **Archivo de migración:** `docs/migrations/20261106_add_resena_descarte_motivo.sql`
- **Cambios DDL:**
  ```sql
  ALTER TABLE taller_ingresos 
    ADD COLUMN IF NOT EXISTS resena_descarte_motivo TEXT;
  ```
- **Campos afectados y propósito:**
  - `resena_descarte_motivo` (`TEXT`): Almacena la razón o nota explicativa por la cual el card de reseña fue descartado (ej. "No tiene WhatsApp", "Número equivocado", etc.).

---

## 4. Contratos de API (Endpoints)

### `POST /api/crm/resenas/:id/descartar`
- **Descripción:** Marca la reseña como descartada y registra la nota/motivo de descarte.
- **Autenticación requerida:** Sí (`requireAuth`)
- **Request Body:**
  ```json
  {
    "motivo": "No tiene WhatsApp - es teléfono fijo"
  }
  ```
- **Responses:**
  - **`200 OK`**: `{ "success": true, "estado": "descartado", "motivo": "..." }`
  - **`400 Bad Request`**: Restricción de base de datos no compatible.
  - **`401 / 403`**: No autorizado.

### `GET /api/crm/resenas`
- **Descripción:** Retorna las órdenes elegibles incluyendo `resena_descarte_motivo` y `diagnostico_mecanico`.
- **Autenticación requerida:** Sí (`requireAuth`)

---

## 5. Frontend & Estados de UI
- **Página afectada:** `frontend/src/pages/CRM.tsx`
- **Funciones añadidas:**
  - `construirMensajeResena(ingreso, nombreTaller, googleUrl)`: Redacción contextual de WhatsApp.
  - `detectarResumenServicio(ingreso)`: Detección inteligente del arreglo o sistema diagnosticado.
- **Estados locales nuevos:**
  - `motivoDescarte`: Cadena que almacena la nota seleccionada o digitada en el modal.
- **Visualización:**
  - Chip con el servicio detectado en el card de cada vehículo (`🔧 [Servicio]`).
  - Bloque destacado de motivo en cards descartados con opciones para "Editar nota" y "Restaurar".

---

## 6. Casos de Prueba & Criterios de Aceptación
- [x] **CP-01 (Mensaje de WhatsApp sin placa/modelo):** Al hacer clic en "Pedir reseña por WhatsApp", el mensaje generado no incluye la placa ni la marca/modelo, menciona "su vehículo" e incluye la pregunta contextual según el servicio.
- [x] **CP-02 (Descarte con motivo/nota):** Al descartar un card, se pueden seleccionar chips de motivos rápidos ("No tiene WhatsApp", etc.) o escribir una nota personalizada.
- [x] **CP-03 (Persistencia y visualización):** El motivo se guarda en backend y se visualiza en la sección "Ver descartadas".
- [x] **CP-04 (Edición y restauración):** Es posible editar la nota o restaurar el card a pendiente limpiando el descarte.
- [x] **CP-05 (Aislamiento Multi-Tenant):** Ninguna operación afecta órdenes de otros talleres.
