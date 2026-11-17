---
trigger: always_on
---

# Regla Obligatoria del Proyecto: Specs y Flujo Git

Al iniciar **cualquier** tarea en este repositorio (`allatyou-taller`), debes revisar y cumplir automáticamente:

1. **Lectura de contexto obligatoria:**
   - Lee `CLAUDE.md` (reglas y mapa de módulos) y, del índice de `docs/specs/README.md`, **solo** la ficha del módulo que vas a tocar. No leas todas las fichas ni archivos de más de 1.000 líneas completos.
   - Respeta siempre el aislamiento multi-tenant (`.eq('empresa_id', req.empresa_id)`) y la zona horaria `America/Bogota`.

2. **Regla de Specs (`docs/specs/README.md`):**
   - Si se introduce un subsistema estructural nuevo o el usuario lo pide, crea la ficha siguiendo `docs/specs/TEMPLATE.md` (máximo 30 líneas) y agrégala al índice. Si un cambio vuelve falsa una ficha, corrígela en el mismo commit.
   - Para cambios iterativos, fixes o mejoras puntuales, ve directo al código sin burocracia.

3. **Flujo Git obligatorio al terminar cada cambio (sin pedir confirmación):**
   1. **Verificar:** Ejecuta `node node_modules/typescript/bin/tsc --noEmit` en `backend/` y `frontend/`. Si falla, no hagas commit.
   2. **Rama:** Crea `feature/<slug>` o `fix/<slug>` desde `main` actualizado (`feature/TALLER-XXX` si hay ticket).
   3. **Commit:** `git add` solo de los archivos del cambio (nunca `.env`). Mensaje `<tipo>(<alcance>): <descripción>` en español (con `[TALLER-XXX]` si hay ticket) y **sin** `Co-Authored-By`.
   4. **Push y PR:** `git push -u origin <rama>` y `gh pr create --base main --fill` (o con título/cuerpo claro).
   5. **Merge:** `gh pr merge --merge --delete-branch`, luego `git checkout main && git pull`. En un worktree: `gh pr merge --merge` y `git push origin --delete <rama>`, sin cambiar a `main`.
