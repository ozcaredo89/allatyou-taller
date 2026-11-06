# Spec — [Título de la Funcionalidad o Módulo]

**Estado:** [Vigente | En revisión | Deprecado] · **Fecha:** [YYYY-MM-DD]  
**Ticket JIRA:** `TALLER-[NUM]`  
**Módulos afectados:**
- Backend: `backend/src/...`
- Frontend: `frontend/src/...`
- Base de datos: `docs/migrations/[fecha]_[nombre].sql`

---

## 1. Contexto Operativo y Flujo de Usuario
[Descripción concisa en 1-2 párrafos del problema que resuelve y el objetivo funcional.]

1. **Paso 1:** [Acción del usuario o evento disparador]
2. **Paso 2:** [Procesamiento / validación en frontend]
3. **Paso 3:** [Petición HTTP y validación en backend]
4. **Paso 4:** [Persistencia en base de datos y respuesta al cliente]

---

## 2. Reglas de Negocio y Seguridad Multi-Tenant
1. **Aislamiento Multi-Tenant (Obligatorio):**
   - Toda consulta debe filtrar explícitamente por `empresa_id` o `slug`.
   - Política fail-closed: si falta `empresa_id` o el token es inválido, rechazar con `401 Unauthorized` o `403 Forbidden`.
2. **Validaciones de Integridad:**
   - [Regla 1: tipos de datos, rangos, restricciones]
   - [Regla 2: estados permitidos y transiciones válidas]

---

## 3. Modelo de Datos y Migraciones SQL
- **Archivo de migración:** `docs/migrations/[fecha]_[nombre].sql`
- **Cambios DDL:**
  ```sql
  ALTER TABLE [nombre_tabla]
    ADD COLUMN IF NOT EXISTS [columna] [TIPO] [DEFAULT NULL];

  CREATE INDEX IF NOT EXISTS [nombre_indice]
    ON [nombre_tabla]([columnas]);
  ```
- **Campos afectados y propósito:**
  - `campo_1` (`TIPO`): [Propósito técnico conciso].

---

## 4. Contratos de API (Endpoints)

### `[METODO] /api/[ruta]`
- **Descripción:** [Qué hace el endpoint]
- **Autenticación requerida:** [Sí (`requireAuth`) / No (Público)]
- **Request Headers:**
  ```http
  Authorization: Bearer <JWT_TOKEN> (si aplica)
  Content-Type: application/json
  ```
- **Request Body:**
  ```json
  {
    "campo_requerido": "valor",
    "empresa_id": "uuid"
  }
  ```
- **Responses:**
  - **`200 OK` / `201 Created`**:
    ```json
    {
      "success": true,
      "data": {}
    }
    ```
  - **`400 Bad Request`**: Datos faltantes o inválidos (`{ "error": "Mensaje específico" }`).
  - **`401 Unauthorized` / `403 Forbidden`**: Sin sesión o sin permisos sobre el tenant.
  - **`404 Not Found`**: Recurso no encontrado dentro de la empresa.

---

## 5. Frontend & Estados de UI
- **Páginas / Componentes:** `frontend/src/pages/[Nombre].tsx`, `frontend/src/components/[Nombre].tsx`
- **Estados locales:**
  - `estado1`: [tipo] — [descripción]
- **Manejo de I18n:** Claves en `frontend/src/locales/es/translation.json` y `en/translation.json`.
- **Comportamiento ante error:** [Toast, banner de alerta, reintentos].

---

## 6. Casos de Prueba & Criterios de Aceptación
- [ ] **CP-01 (Caso Feliz):** [Dado que..., Cuando..., Entonces...]
- [ ] **CP-02 (Aislamiento Tenant):** Usuario de empresa A no puede ver ni modificar datos de empresa B.
- [ ] **CP-03 (Validaciones de Entrada):** Campos requeridos ausentes retornan 400.
- [ ] **CP-04 (Fallback / Resiliencia):** Manejo controlado si falla servicio externo o BD.
