# Plantilla Rápida de Ticket JIRA

```markdown
h2. 📌 Metadatos: TALLER-[NUM] — [Nombre Breve]
* *Tipo:* Story / Bug / Task
* *Módulos:* Backend / Frontend / Database
* *Archivos:* `backend/src/...`, `frontend/src/...`

---

h2. 🎯 Objetivo
[1-2 oraciones del cambio concreto y su valor operativo].

---

h2. 🛠️ Cambios Realizados
* [x] **Backend:** Endpoint `[METODO] /api/...` con filtro `empresa_id`.
* [x] **Frontend:** Vista/componente `...` con acción/estado.
* [x] **Base de Datos:** DDL (si aplica) `docs/migrations/...`.

---

h2. ✅ Verificación Rápida
* [x] Type-check backend (`node node_modules/typescript/bin/tsc --noEmit`).
* [x] Type-check frontend (`node node_modules/typescript/bin/tsc --noEmit`).
* [x] Flujo probado en local exitosamente.
```
