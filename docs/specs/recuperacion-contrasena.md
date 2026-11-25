# Ficha — Acceso: login, OTP, contraseñas y dispositivos

**Leer si:** la tarea toca el inicio de sesión, la recuperación de contraseña, el equipo o los dispositivos autorizados · **Actualizada:** 2026-11-16 · **Ticket:** `TALLER-AUTH-02`

## Archivos
- Backend: `backend/src/controllers/auth.controller.ts`, `routes/auth.routes.ts`, `middlewares/auth.middleware.ts` → `requireAuth`, `utils/device.ts`, `services/emailService.ts`, `config/jwt.ts`
- Frontend: `frontend/src/pages/Login.tsx` (modos `otp`, `password`, `reset-password` con `resetStep` 1 y 2), `pages/{Registro,Equipo,Configuracion}.tsx`, `context/AuthContext.tsx`
- Datos: `taller_empresas_correos` (usuarios por taller; `password_hash`, `is_verified`, `otp_code`, `reset_password_token`, `reset_password_expires_at`), `taller_dispositivos_autorizados`; migración `backend/migrations/20261104_add_password_reset_fields.sql`

## Contratos (bajo `/api/auth`)
- Públicos: `POST /request-otp`, `POST /verify-otp`, `POST /login-password`, `POST /registro`.
- `POST /forgot-password` (público) — `{ empresa_id, email }` → envía un código de 6 dígitos por correo. 403 usuario sin aprobar, 404 correo no registrado en ese taller.
- `POST /reset-password` (público) — `{ empresa_id, email, code, new_password }` → `{ success, token, empresa }` (deja la sesión iniciada). 400 código inválido, vencido o contraseña de menos de 6 caracteres.
- Con sesión: `GET /empresas`, `PATCH /empresas/:id/config`, `GET|POST /equipo`, `PATCH /equipo/:id/aprobar`, `GET /dispositivos`, `DELETE /dispositivos/:id`, `POST /logout`.

## Reglas de negocio
- El correo se busca **dentro del taller** (`empresa_id`): el mismo correo en otro taller no puede cambiar credenciales de este.
- Un usuario con `is_verified = false` no puede recuperar contraseña (403); la recuperación no sirve para saltarse la aprobación del dueño.
- El código dura 15 minutos y se anula (`NULL`) al usarse.
- La contraseña se guarda con `bcrypt` (10 rondas).
- `requireAuth` valida el JWT y que el dispositivo siga en `taller_dispositivos_autorizados`.

## Trampas / no tocar
- Si las columnas `reset_password_*` no existen, el backend guarda el código en `otp_code`; conservar ese respaldo.
- El frontend guarda la sesión en `localStorage['taller_auth']`, pero solo `AuthContext` y `services/api.ts` deben leerla.
- `PATCH /empresas/:id/config` es donde se guardan ajustes del taller como `config_diagnostico`; no crear otro endpoint para eso.
- Textos de login bajo la sección `login` de `locales/{es,en}/translation.json`.
