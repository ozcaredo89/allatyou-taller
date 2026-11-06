# Spec — Recuperación y Creación de Contraseñas de Acceso al Taller

**Estado:** Vigente · **Fecha:** 2026-11-04  
**Ticket JIRA:** `TALLER-AUTH-02`  
**Módulos afectados:**
- Backend: `backend/src/controllers/auth.controller.ts`, `backend/src/routes/auth.routes.ts`, `backend/src/services/emailService.ts`
- Frontend: `frontend/src/pages/Login.tsx`, `frontend/src/locales/es/translation.json`, `frontend/src/locales/en/translation.json`
- Base de datos: `docs/migrations/20261104_add_password_reset_fields.sql`

---

## 1. Contexto Operativo y Flujo de Usuario
El sistema AllAtYou Taller opera como Kiosco Multi-Tenant donde cada sucursal (`taller_empresas`) cuenta con usuarios administrativos y de equipo registrados en `taller_empresas_correos`. Previamente, no existía mecanismo de autoservicio para que un usuario restableciera una contraseña olvidada o estableciera por primera vez una contraseña si solo había ingresado vía OTP.

### Flujo Funcional (2 Pasos):
1. **Selección de Sucursal y Solicitud:**
   - El usuario selecciona la empresa en el paso 1 del Login (`/:slug` o selector de sucursales).
   - En la vista de login con contraseña, hace clic en `"¿Olvidaste tu contraseña o necesitas crear una nueva?"`.
   - Ingresa su correo electrónico registrado y hace clic en `"Enviar Código de Verificación"`.
   - El backend valida la existencia del usuario en la sucursal seleccionada, genera un código numérico seguro de 6 dígitos con vigencia de 15 minutos, lo persiste y lo envía vía correo (Resend).
2. **Verificación y Establecimiento de Contraseña:**
   - La interfaz avanza a la pantalla de verificación solicitando: código de 6 dígitos, nueva contraseña (mínimo 6 caracteres) y confirmación.
   - Al confirmar, el backend valida el código y la vigencia temporal.
   - Hashea la contraseña con `bcrypt` (10 rounds), actualiza `password_hash`, invalida el código de un solo uso y emite un JWT firmado para autenticación inmediata sin fricción.

---

## 2. Reglas de Negocio y Seguridad Multi-Tenant
1. **Aislamiento Multi-Tenant Estricto (`empresa_id`):**
   - La búsqueda del correo en `taller_empresas_correos` debe estar estrictamente acotada a `empresa_id`. Un mismo correo registrado en otro taller no puede restablecer credenciales del taller actual.
2. **Validación de Usuario Aprobado (`is_verified`):**
   - Si `is_verified === false` (miembro de equipo pendiente de aprobación por el dueño), se rechaza con `403 Forbidden` (`"Tu usuario aún está pendiente de aprobación por el administrador"`). No se permite evasión de aprobación mediante el flujo de recuperación.
3. **Seguridad y Expiración del Token:**
   - Código numérico de 6 dígitos (`crypto.randomInt` / `Math.floor`).
   - Expiración dura de 15 minutos (`reset_password_expires_at`).
   - Inmediata invalidación (`NULL`) tras su consumo exitoso.
4. **Resiliencia y Compatibilidad de Esquema (Fail-Safe):**
   - El backend intenta persistir en columnas dedicadas (`reset_password_token`, `reset_password_expires_at`). Si la base de datos aún no ha corrido la migración DDL, hace fallback automático al campo existente `otp_code` sin interrumpir la operación.

---

## 3. Modelo de Datos y Migraciones SQL
- **Archivo de migración:** `docs/migrations/20261104_add_password_reset_fields.sql`
- **DDL:**
  ```sql
  ALTER TABLE taller_empresas_correos 
    ADD COLUMN IF NOT EXISTS reset_password_token VARCHAR(100) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS reset_password_expires_at TIMESTAMPTZ DEFAULT NULL;

  CREATE INDEX IF NOT EXISTS idx_taller_empresas_correos_reset 
    ON taller_empresas_correos(empresa_id, email, reset_password_token) 
    WHERE reset_password_token IS NOT NULL;
  ```
- **Campos:**
  - `reset_password_token`: Código o token de recuperación temporal de 6 dígitos.
  - `reset_password_expires_at`: Timestamp ISO con vencimiento exacto (15 min).

---

## 4. Contratos de API (Endpoints)

### `POST /api/auth/forgot-password`
Solicita la emisión de un código de restablecimiento.
- **Autenticación:** Pública (acotada por `empresa_id`).
- **Request Body:**
  ```json
  {
    "empresa_id": "06ceca9b-e869-42b4-82a1-fa4418fc9b0f",
    "email": "mecanico@taller.com"
  }
  ```
- **Responses:**
  - `200 OK`:
    ```json
    {
      "success": true,
      "message": "Código de verificación enviado a tu correo."
    }
    ```
  - `400 Bad Request`: `{"error": "Faltan campos requeridos (empresa_id, email)."}`
  - `403 Forbidden`: `{"error": "Tu usuario aún está pendiente de aprobación por el administrador."}`
  - `404 Not Found`: `{"error": "No se encontró un usuario con ese correo registrado en esta sucursal."}`

---

### `POST /api/auth/reset-password`
Valida el código y actualiza la contraseña del usuario.
- **Autenticación:** Pública (requiere código válido).
- **Request Body:**
  ```json
  {
    "empresa_id": "06ceca9b-e869-42b4-82a1-fa4418fc9b0f",
    "email": "mecanico@taller.com",
    "code": "849201",
    "new_password": "MiPasswordSeguro2026"
  }
  ```
- **Responses:**
  - `200 OK`:
    ```json
    {
      "success": true,
      "message": "Contraseña actualizada correctamente.",
      "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "empresa": {
        "id": "06ceca9b-e869-42b4-82a1-fa4418fc9b0f",
        "nombre": "EuroFrenos Bogotá",
        "slug": "eurofrenos-bogota"
      }
    }
    ```
  - `400 Bad Request`:
    - `{"error": "La nueva contraseña debe tener al menos 6 caracteres."}`
    - `{"error": "Código de verificación inválido."}`
    - `{"error": "El código ha expirado. Por favor solicita uno nuevo."}`
  - `403 Forbidden`: `{"error": "Tu usuario aún está pendiente de aprobación por el administrador."}`
  - `404 Not Found`: `{"error": "No se encontró un usuario con ese correo registrado en esta sucursal."}`

---

## 5. Frontend & Estados de UI
- **Archivo:** `frontend/src/pages/Login.tsx`
- **Modos de Login:**
  - `otp`: Acceso directo por código general del taller.
  - `password`: Acceso por correo y contraseña.
  - `reset-password`: Flujo de recuperación de contraseña en dos pasos:
    - `resetStep = 1`: Input de correo registrado + botón "Enviar Código de Verificación".
    - `resetStep = 2`: Input de código de 6 dígitos + input "Nueva Contraseña" + input "Confirmar Contraseña" + botón "Guardar Contraseña e Ingresar" + enlaces para "Reenviar código" y "Cambiar correo".
- **Internacionalización:** Claves en `frontend/src/locales/{es,en}/translation.json` bajo la sección `"login"`.

---

## 6. Casos de Prueba & Criterios de Aceptación
- [ ] **CP-01 (Envío de Código Exitoso):** Usuario ingresa correo válido de la sucursal seleccionada. Backend responde 200 y despacha correo vía Resend.
- [ ] **CP-02 (Establecimiento de Contraseña Exitoso):** Usuario ingresa código correcto de 6 dígitos y contraseña >= 6 caracteres que coincide con la confirmación. Contraseña se hashea y se inicia sesión automáticamente.
- [ ] **CP-03 (Código Expirado):** Código usado después de 15 minutos responde 400 `"El código ha expirado"`.
- [ ] **CP-04 (Usuario No Verificado / No Aprobado):** Usuario con `is_verified = false` intenta recuperar contraseña. Backend responde 403.
- [ ] **CP-05 (Aislamiento de Sucursal):** Correo que pertenece a la sucursal B no puede solicitar código en la sucursal A (responde 404).
