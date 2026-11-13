---
trigger: always_on
---

# Regla Obligatoria del Proyecto: Specs y Flujo Git

Al iniciar **cualquier** tarea en este repositorio (`allatyou-taller`), debes revisar y cumplir automáticamente:

1. **Lectura de contexto obligatoria:**
   - Lee `CLAUDE.md` y `docs/specs/README.md` antes de planificar o editar código.
   - Respeta siempre el aislamiento multi-tenant (`.eq('empresa_id', req.empresa_id)`) y la zona horaria `America/Bogota`.

2. **Regla de Specs (`docs/specs/README.md`):**
   - Si se introduce un subsistema estructural nuevo o el usuario lo pide, crea/actualiza la spec siguiendo `docs/specs/TEMPLATE.md` (máximo 25-30 líneas, sin relleno).
   - Para cambios iterativos, fixes o mejoras puntuales, ve directo al código sin burocracia.

3. **Flujo Git obligatorio al terminar cada cambio (sin pedir confirmación):**
   1. **Verificar:** Ejecuta `node node_modules/typescript/bin/tsc --noEmit` en `backend/` y `frontend/`. Si falla, no hagas commit.
   2. **Rama:** Crea `feature/<slug>` o `fix/<slug>` desde `main` actualizado (`feature/TALLER-XXX` si hay ticket).
   3. **Commit:** `git add` solo de los archivos del cambio (nunca `.env`). Mensaje `<tipo>(<alcance>): <descripción>` en español (con `[TALLER-XXX]` si hay ticket) y **sin** `Co-Authored-By`.
   4. **Push y PR:** `git push -u origin <rama>` y `gh pr create --base main --fill` (o con título/cuerpo claro).
   5. **Merge:** `gh pr merge --merge --delete-branch`, luego `git checkout main && git pull`.
