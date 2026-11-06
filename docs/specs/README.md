# Estándar de Especificaciones Técnicas (Specs) — AllAtYou Taller

Este directorio contiene las especificaciones técnicas oficiales de funcionalidades del sistema. Su objetivo es proporcionar **información suficiente, concreta y de alta densidad técnica** para que cualquier desarrollador o agente entienda y modifique el código sin necesidad de explorar o descifrar la base de código desde cero.

---

## 1. Principios del Sistema de Specs
- **Cero relleno / Cero narrativa corporativa**: No agregues párrafos introductorios obvios. Solo hechos técnicos, reglas de negocio, tablas, payloads y rutas de archivos.
- **Rutas exactas**: Todo módulo o archivo mencionado debe incluir su ruta relativa completa en el repositorio (`backend/src/...`, `frontend/src/...`, `docs/migrations/...`).
- **Aislamiento Multi-Tenant explícito**: Cada endpoint o consulta SQL debe especificar cómo se aísla por `empresa_id` o `slug`. En este repositorio **no se usa RLS por defecto en llaves de aplicación**, por lo que el filtrado en backend es fail-closed y obligatorio.
- **Contratos API completos**: Siempre documenta payloads de entrada, respuestas exitosas (200/201) y códigos de error (400, 401, 403, 404, 409, 500).
- **Trazabilidad con JIRA**: Cada spec debe estar enlazada a su ticket correspondiente (`TALLER-XXX`).

---

## 2. Estructura Obligatoria de un Spec
Todo archivo nuevo en `docs/specs/*.md` debe seguir la plantilla [`docs/specs/TEMPLATE.md`](./TEMPLATE.md):
1. **Cabecera de Metadatos**: Estado (`Vigente`, `En revisión`, `Deprecado`), Fecha, Ticket JIRA y Módulos Afectados.
2. **Contexto Operativo & Flujo de Usuario**: Breve descripción del problema y pasos numerados del flujo.
3. **Reglas de Negocio & Seguridad Multi-Tenant**: Validaciones duras, aislamiento por empresa y manejo de permisos.
4. **Modelo de Datos & Migraciones**: Sentencias DDL exactas (`ALTER TABLE`, `CREATE INDEX`), columnas y tipos.
5. **Contratos de API (Endpoints)**: Rutas, métodos HTTP, cabeceras, body request y body response.
6. **Frontend & Estados de UI**: Vistas afectadas, estados de componente, transiciones y manejo de errores.
7. **Criterios de Aceptación & Casos de Prueba**: Checklist concreto de verificación.

---

## 3. Índice de Especificaciones Vigentes

| Spec | Módulo Principal | Ticket JIRA | Estado |
|---|---|---|---|
| [`sincronizacion-gastos-renting.md`](./sincronizacion-gastos-renting.md) | Ingresos / Renting Hub | `TALLER-SYNC-01` | Vigente |
| [`recuperacion-contrasena.md`](./recuperacion-contrasena.md) | Autenticación / Kiosco | `TALLER-AUTH-02` | Vigente |
| [`ui-design-system.md`](./ui-design-system.md) | Frontend / UI & Design System | `TALLER-UI-01` | Vigente |
