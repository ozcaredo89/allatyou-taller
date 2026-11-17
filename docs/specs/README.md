# Fichas de módulo — AllAtYou Taller

Cada ficha le dice a un agente **dónde tocar y qué no romper** en un módulo, sin tener que leer el código completo. No son actas de lo construido.

## Índice: leer solo la ficha de lo que se va a tocar

| Si la tarea toca… | Leer |
|---|---|
| Un endpoint, una migración, textos o un campo con dictado por voz | [`recetas.md`](./recetas.md) |
| Chatbot público, cualquier llamada a un modelo de IA, presupuesto de IA | [`ia.md`](./ia.md) |
| Promesa de entrega, alertas de avance, pestañas de `Reportes` | [`reportes-operativos-y-seguimiento.md`](./reportes-operativos-y-seguimiento.md) |
| Envío de gastos a AllAtYou Renting al dar salida | [`sincronizacion-gastos-renting.md`](./sincronizacion-gastos-renting.md) |
| Reseñas de Google, descarte de tarjetas del CRM | [`crm-resenas-mejoras.md`](./crm-resenas-mejoras.md) |
| Login, OTP, contraseñas, dispositivos autorizados | [`recuperacion-contrasena.md`](./recuperacion-contrasena.md) |
| Modales, colores, botones, cualquier pantalla nueva | [`ui-design-system.md`](./ui-design-system.md) |

Módulos sin ficha: usar el mapa de [`CLAUDE.md`](../../CLAUDE.md).

## Reglas de una ficha
1. **Máximo 30 líneas**, con [`TEMPLATE.md`](./TEMPLATE.md) (`recetas.md` es la única excepción: una receta de pocas líneas por tarea).
2. **Solo lo que no se ve rápido en el código:** archivos y funciones por nombre, reglas de negocio, trampas. Nada de JSON de ejemplo, flujos narrados, listas de estados locales ni checklists de prueba.
3. **Funciones por nombre, no por número de línea** (los números caducan).
4. **Se crea solo** para un subsistema nuevo o si el usuario la pide; los cambios iterativos van directo al código.
5. **Se mantiene:** si un cambio vuelve falsa una línea, se corrige en el mismo commit. Una ficha nueva se agrega al índice de arriba y al mapa de `CLAUDE.md`.

## Flujo Git (al terminar cada cambio, sin pedir confirmación)
1. **Verificar:** type-check de `backend/` y `frontend/` (`node node_modules/typescript/bin/tsc --noEmit`). Si falla, no se hace commit. En un worktree sin `node_modules`, correr antes `npm ci` en esa carpeta.
2. **Rama:** `feature/<slug>` o `fix/<slug>` desde `main` actualizado (`feature/TALLER-XXX` si hay ticket). En un worktree: `git fetch origin && git checkout -b <rama> origin/main`.
3. **Commit:** `git add` solo los archivos del cambio (nunca `.env` ni datos personales). Mensaje `<tipo>(<alcance>): <descripción>` en español, con prefijo `[TALLER-XXX]` si hay ticket. Sin `Co-Authored-By`.
4. **Push y PR:** `git push -u origin <rama>` y `gh pr create --base main`.
5. **Merge:** `gh pr merge --merge --delete-branch`, luego `git checkout main && git pull`. En un worktree `main` está ocupado por el checkout principal: usar `gh pr merge --merge` y `git push origin --delete <rama>`, sin cambiar a `main`.
6. **Deploy:** automático al llegar a `main` (Railway backend, Vercel frontend). Las migraciones pendientes de `docs/migrations/` corren solas en Railway con `npm start`.
