# Especificaciones Técnicas (Specs) — AllAtYou Taller

Directorio para especificaciones técnicas cuando se introducen nuevos subsistemas estructurales o el usuario lo solicite.

## Reglas Clave:
1. **Sin burocracia ni relleno:** Solo paths exactos, contratos API (body/response), DDL SQL y regla de aislamiento `.eq('empresa_id', req.empresa_id)`.
2. **Máximo 25-30 líneas:** Utilizar [`docs/specs/TEMPLATE.md`](./TEMPLATE.md).
3. **No requerida para cambios iterativos:** Mejoras de UI, fixes o peticiones puntuales del usuario se aplican directamente en código sin generar specs.

## Flujo Git (al terminar cada cambio, sin pedir confirmación)
1. **Verificar:** type-check de `backend/` y `frontend/` (`node node_modules/typescript/bin/tsc --noEmit`). Si falla, no se hace commit.
2. **Rama:** `feature/<slug>` o `fix/<slug>` desde `main` actualizado (`feature/TALLER-XXX` si hay ticket).
3. **Commit:** `git add` solo los archivos del cambio (nunca `.env` ni `docs/specs/` con datos personales). Mensaje `<tipo>(<alcance>): <descripción>` en español, con prefijo `[TALLER-XXX]` si hay ticket. Sin `Co-Authored-By`.
4. **Push y PR:** `git push -u origin <rama>` y `gh pr create --base main`.
5. **Merge:** `gh pr merge --merge --delete-branch`, luego `git checkout main && git pull`.
6. **Deploy:** automático al llegar a `main` (Railway backend, Vercel frontend). Las migraciones de `docs/migrations/` corren solas en Railway con `npm start`.
