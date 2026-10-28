# Spec — Sincronización de Gastos hacia AllAtYou Renting

**Estado:** Vigente · **Fecha:** 2026-10-14
**Módulos afectados:**
- Taller Backend: `backend/src/services/allatyouSync.service.ts`, `backend/src/controllers/ingresos.controller.ts`, `backend/src/routes/ingresos.routes.ts`
- Taller Frontend: `frontend/src/components/RentingSyncModal.tsx`, `frontend/src/pages/Checkout.tsx`, `frontend/src/pages/Dashboard.tsx`, `frontend/src/pages/HistorialDetalle.tsx`
- Renting API: `src/routes/expenses.ts` (`POST /expenses`)

---

## 1. Contexto y Flujo de Usuario (Human-in-the-Loop)
Cuando un vehículo de la flota propia administrada por AllAtYou es atendido en el taller y su orden pasa a estado `entregado` (salida del vehículo):
1. **Detección y Disponibilidad de Datos:**
   - Tanto `updateIngreso` como `getIngresoById`, `getIngresos` y `getHistorial` devuelven la propiedad `aplica_renting: boolean` (evaluada con función pura `evaluarAplicaRenting(empresa_id, cliente_doc)` con política fail-closed).
2. **Modal de Confirmación al dar Salida:**
   - Si `aplica_renting === true` y la orden aún no ha sido sincronizada (`renting_sync_at IS NULL`), el frontend abre un **Modal de Confirmación**:
     - **Placa:** De solo lectura (bloqueada, tomada de la orden en DB para evitar errores humanos).
     - **Fecha:** Prellenada con la fecha actual en `America/Bogota` (`YYYY-MM-DD`), editable.
     - **Descripción:** Prellenada con `[Taller Orden #ID] Motivo`, editable.
     - **Tabla de Ítems:** Prellenada con los ítems de la orden con `total > 0`. El usuario puede modificar nombres, montos, eliminar filas o agregar ítems adicionales.
3. **Confirmación y Creación:**
   - Al confirmar, el frontend envía `POST /api/ingresos/:id/renting-sync` con el payload validado.
   - El backend re-valida la elegibilidad, ejecuta el reclamo atómico (`WHERE renting_sync_at IS NULL`), llama al API de Renting y registra el éxito (`renting_expense_ids`).
4. **Si el usuario cierra sin confirmar:**
   - La orden queda guardada como `entregado`.
   - En `Checkout.tsx`, `Dashboard.tsx` e `HistorialDetalle.tsx`, la orden muestra el badge **"⚠️ Gasto Renting pendiente"** con un botón activo **`[Crear Gasto en Renting]`** para disparar el modal en cualquier momento posterior.

---

## 2. Reglas de Validación y Aislamiento Multi-Tenant (Fail-Closed)
1. **Función de Evaluación:**
   ```ts
   export function evaluarAplicaRenting(empresaId?: string, clienteDoc?: string): boolean {
     const targetEmpresaId = process.env.ALLATYOU_RENTING_EMPRESA_ID?.trim();
     const targetClienteDoc = process.env.ALLATYOU_RENTING_CLIENTE_DOC?.trim();
     if (!targetEmpresaId || !targetClienteDoc || !empresaId || !clienteDoc) {
       return false; // Fail-closed
     }
     return empresaId === targetEmpresaId && clienteDoc.trim() === targetClienteDoc;
   }
   ```
2. **Doble Validación de Seguridad en el Endpoint:**
   - `POST /api/ingresos/:id/renting-sync` consulta la orden en la BD y **vuelve a ejecutar** `evaluarAplicaRenting` contra la empresa del token JWT y el documento del cliente en la BD. Si no coincide, responde **403 Forbidden**. Ningún tenant ajeno puede invocar este endpoint para enviar gastos.

---

## 3. Idempotencia y Trazabilidad (Backend)
- **Campos en `taller_ingresos`:**
  - `renting_sync_at` (TIMESTAMPTZ): Marca temporal de sincronización exitosa.
  - `renting_expense_ids` (JSONB): IDs de los gastos creados en Renting.
  - `renting_sync_error` (TEXT): Último error registrado en caso de fallo.
- **Reclamo Atómico (Optimistic Lock):**
  ```sql
  UPDATE taller_ingresos 
  SET renting_sync_at = NOW() 
  WHERE id = :id AND empresa_id = :empresa_id AND renting_sync_at IS NULL 
  RETURNING id;
  ```
  - Si 0 filas actualizadas -> responde **409 Conflict** ("La orden ya fue sincronizada o se encuentra en proceso").
  - Si la llamada HTTP a Renting falla o da timeout (10s):
    - Se revierte `renting_sync_at = NULL`.
    - Se persiste `renting_sync_error = :mensajeError`.
    - Se responde con error al cliente para permitir reintento.

---

## 4. Validación Estricta del Payload en `POST /api/ingresos/:id/renting-sync`
El backend valida rigurosamente los datos provenientes del modal:
1. `date`: Regex `/^\d{4}-\d{2}-\d{2}$/`.
2. `description`: String no vacío.
3. `items`: Arreglo no vacío (`items.length > 0`).
4. Cada elemento de `items`:
   - `item`: String no vacío (`item.trim().length > 0`).
   - `amount`: Número positivo finito (`typeof amount === 'number' && isFinite(amount) && amount > 0`).
   - `category`: `"Mantenimiento"`.
5. `placa`: Se toma directamente de la orden en la base de datos (inmutable desde el frontend).
