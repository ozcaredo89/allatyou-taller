# Plantilla Estándar para Issues / Tickets en JIRA

Copia el contenido a continuación al crear un nuevo issue en JIRA (compatible con sintaxis Markdown y Atlassian Visual Editor).

---

```markdown
h2. 📌 Metadatos del Ticket
* *Tipo de Issue:* Story / Task / Bug / Spike
* *Componente:* Backend / Frontend / Database / Integraciones
* *Prioridad:* Alta / Media / Baja
* *Spec Técnico:* docs/specs/[nombre-del-spec].md
* *Rama sugerida:* feature/TALLER-[NUM]-[nombre-breve]

---

h2. 👤 Historia de Usuario
*Como* [rol del usuario en el taller, ej: administrador, mecánico, asesor],
*Quiero* [acción o capacidad concreta en el sistema],
*Para* [beneficio o valor de negocio esperado].

---

h2. 🎯 Contexto y Problema
[Describe en 2 a 3 oraciones qué problema actual existe, por qué es necesario resolverlo y qué impacto tiene.]

---

h2. 🛠️ Alcance Técnico
*Backend:*
* [ ] Archivos o servicios a modificar: `backend/src/...`
* [ ] Nuevos endpoints o modificaciones: `[METODO] /api/...`

*Frontend:*
* [ ] Vistas o componentes: `frontend/src/...`
* [ ] Textos i18n requeridos: `frontend/src/locales/{es,en}/translation.json`

*Base de Datos:*
* [ ] Migración DDL requerida: `docs/migrations/[fecha]_[nombre].sql`
* [ ] Índices o restricciones multi-tenant necesarios.

---

h2. 🛡️ Consideraciones de Seguridad y Multi-Tenant
* [ ] Aislamiento garantizado: Todas las consultas filtran por `empresa_id` o `slug`.
* [ ] Manejo fail-closed ante errores de autenticación o validación de permisos.
* [ ] Sanitización y validación estricta de payloads entrantes en backend.

---

h2. ✅ Criterios de Aceptación (Gherkin)

*Escenario 1: [Flujo principal exitoso]*
* *Dado que* [condición previa del usuario y del sistema]
* *Cuando* [el usuario realiza la acción]
* *Entonces* [el sistema responde con el resultado esperado]

*Escenario 2: [Manejo de error o caso de borde]*
* *Dado que* [condición previa de fallo]
* *Cuando* [el usuario intenta realizar la acción]
* *Entonces* [el sistema bloquea la acción y muestra mensaje claro al usuario]

---

h2. 🧪 Plan de Pruebas / QA Checklist
* [ ] Verificación de flujo exitoso en entorno local.
* [ ] Verificación de respuestas HTTP (200, 400, 403, 404).
* [ ] Build exitoso de frontend (`npm run build`).
* [ ] Compilación exitosa de TypeScript en backend (`node node_modules/typescript/bin/tsc --noEmit`).
```
