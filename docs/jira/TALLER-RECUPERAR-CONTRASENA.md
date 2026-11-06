# Ticket JIRA: TALLER-AUTH-02 — Recuperación y Creación de Contraseña para Usuarios de Taller

**Estado:** Listo para QA / Para Cerrar  
**Spec Técnico Asociado:** [`docs/specs/recuperacion-contrasena.md`](../specs/recuperacion-contrasena.md)  
**Migración SQL:** [`docs/migrations/20261104_add_password_reset_fields.sql`](../migrations/20261104_add_password_reset_fields.sql)

---

```markdown
h2. 📌 Metadatos del Ticket
* *Clave:* TALLER-AUTH-02
* *Tipo de Issue:* Story
* *Componente:* Auth / Backend / Frontend / Database
* *Prioridad:* Alta
* *Spec Técnico:* docs/specs/recuperacion-contrasena.md
* *Rama sugerida:* feature/TALLER-AUTH-02-recuperar-contrasena

---

h2. 👤 Historia de Usuario
*Como* usuario o administrador de un taller registrado en AllAtYou,
*Quiero* solicitar la recuperación de mi contraseña olvidada o crear una nueva si solo ingresaba con código temporal,
*Para* tener acceso autónomo a mi sucursal mediante credenciales seguras sin requerir intervención manual del equipo de soporte.

---

h2. 🎯 Contexto y Problema
Actualmente, el flujo de inicio de sesión solo contemplaba ingreso por código temporal (OTP) o contraseña previamente configurada por un administrador. No existía un autoservicio para restablecer contraseñas olvidadas ni para que usuarios registrados (fundadores tras registro o empleados) crearan una contraseña permanente. Esto generaba bloqueos de acceso y soporte operativo recurrente.

---

h2. 🛠️ Alcance Técnico
*Backend:*
* [x] `backend/src/routes/auth.routes.ts`: Exposición de endpoints `/forgot-password` y `/reset-password`.
* [x] `backend/src/controllers/auth.controller.ts`: Lógica de validación multi-tenant por `empresa_id`, generación de código de 6 dígitos con expiración de 15 minutos, envío de correo vía Resend, hasheo con `bcrypt` (10 rounds) y emisión de JWT para login directo.
* [x] Soporte fail-safe para base de datos (fallback a `otp_code` en caso de que las nuevas columnas no hayan sido aplicadas en producción).

*Frontend:*
* [x] `frontend/src/pages/Login.tsx`: Nuevo modo `reset-password` en 2 pasos (ingreso de correo -> ingreso de código y nueva contraseña). Enlace directo en el formulario de login `"¿Olvidaste tu contraseña o necesitas crear una nueva?"`.
* [x] `frontend/src/locales/es/translation.json` y `en/translation.json`: Claves de internacionalización añadidas.

*Base de Datos:*
* [x] `docs/migrations/20261104_add_password_reset_fields.sql`: Columnas `reset_password_token` y `reset_password_expires_at` con índice condicional sobre `taller_empresas_correos`.

---

h2. 🛡️ Consideraciones de Seguridad y Multi-Tenant
* [x] Aislamiento garantizado: La verificación de correos siempre filtra por `.eq('empresa_id', empresa_id)`.
* [x] Protección de aprobación: Usuarios con `is_verified: false` no pueden cambiar contraseña hasta ser aprobados por el administrador (HTTP 403).
* [x] Expiración de 15 minutos e invalidación inmediata del código de un solo uso tras el cambio.
* [x] Hasheo obligatorio con bcrypt.

---

h2. ✅ Criterios de Aceptación (Gherkin)

*Escenario 1: Solicitud exitosa de código de recuperación*
* *Dado que* un usuario selecciona su taller y está en la vista de login con contraseña
* *Cuando* hace clic en "¿Olvidaste tu contraseña...?", escribe su correo registrado y pulsa "Enviar Código de Verificación"
* *Entonces* el sistema envía un código de 6 dígitos a su correo electrónico y muestra la pantalla para ingresar el código y la nueva contraseña.

*Escenario 2: Restablecimiento y login automático exitoso*
* *Dado que* el usuario recibió el código de 6 dígitos en su correo
* *Cuando* ingresa el código correcto, una nueva contraseña de al menos 6 caracteres y su confirmación
* *Entonces* la contraseña se actualiza en base de datos, se invalida el código y el usuario es autenticado e ingresado directamente al tablero de su sucursal.

*Escenario 3: Código inválido o expirado*
* *Dado que* han pasado más de 15 minutos desde la emisión o el usuario escribe un código erróneo
* *Cuando* intenta enviar el formulario
* *Entonces* el sistema rechaza la solicitud con error descriptivo y permite reenviar un nuevo código.

---

h2. 🧪 Plan de Pruebas / QA Checklist
* [x] Type-checking exitoso en backend (`node node_modules/typescript/bin/tsc --noEmit`).
* [x] Type-checking exitoso en frontend (`node node_modules/typescript/bin/tsc --noEmit`).
* [x] Compilación de producción de frontend exitosa (`npm run build`).
* [x] Validación de traducción en español e inglés.
```
