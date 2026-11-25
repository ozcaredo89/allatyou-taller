# CLAUDE.md

**AllAtYou Taller** ("TallerPro"): SaaS multi-tenant para talleres automotrices (español, Colombia). Dos proyectos npm independientes, sin `package.json` raíz:

- `backend/` — Express + TypeScript, Supabase (Postgres). Deploy: Railway.
- `frontend/` — React 19 + Vite + Tailwind v4 (SPA). Deploy: Vercel.
- `backend/migrations/*.sql` — migraciones; `docs/specs/` — fichas por módulo (leer solo la que toque).

## Reglas que aplican siempre

1. **Aislamiento por taller:** no hay RLS. Toda consulta filtra `.eq('empresa_id', req.empresa_id)` (o `.eq('empresa_slug', slug)` en rutas públicas). `req.empresa_id` lo pone `requireAuth`.
2. **Zona horaria:** fechas, rangos y topes diarios en `America/Bogota` (Supabase corre en UTC). Usar `utils/dateUtils.ts` (`bogotaToday`, `getBogotaRange`, `bogotaDayBounds`), existe en backend y frontend.
3. **Tablas:** siempre con prefijo `taller_`.
4. **Presupuesto de IA fail-closed:** nunca volver `budgetGuard` fail-open ni llamar a un LLM sin verificar presupuesto. Detalle en `docs/specs/ia.md`.
5. **Secretos:** solo desde `process.env`. No subir llaves reales a `.env.example`.
6. **Editar solo `.ts`:** en `backend/src/` hay `.js`/`.d.ts`/`.map` versionados junto a algunos `.ts`; no tocarlos.
7. **Frontend:** llamadas por `src/services/api.ts` (inyecta JWT, maneja 401/403); sesión con `useAuth()`, no `localStorage` directo. Rutas bajo `/:slug/*` en `src/App.tsx`.
8. **Estados de ingreso:** `recepcion → diagnostico → cotizacion → esperando_aprobacion → en_reparacion → entregado` / `cancelado`. Cada cambio registra en `taller_ingresos_tiempos` y `taller_ingresos_bitacora`; las comisiones se recalculan en `entregado`. Todo en `updateIngreso`.

## Mapa: dónde vive cada cosa

Rutas en `backend/src/routes/<x>.routes.ts`, lógica en `backend/src/controllers/<x>.controller.ts`, montadas en `backend/src/index.ts` como `/api/<x>`.

| Módulo | Backend (`<x>`) | Frontend (`frontend/src/`) | Ficha |
|---|---|---|---|
| Ingresos, tablero, bitácora | `ingresos` | `pages/{Dashboard,NuevoIngreso,Historial,HistorialDetalle}`, `components/{ModalEditarIngreso,TimelineDrawer,SelectorVehiculo}` | — |
| Diagnóstico | `ingresos` (`PUT /:id`), `upload` | `pages/Diagnostico`, `components/NotaPorVoz` | — |
| Cotización y salida | `ingresos`, `gastos` | `pages/Checkout` | — |
| Seguimiento y reportes | `ingresos` (`/reportes/*`, `/:id/seguimiento`) | `pages/Reportes`, `components/Reporte*`, `ModalSeguimientoIngreso` | `reportes-operativos-y-seguimiento.md` |
| Gastos | `gastos`, `utils/gastosProrrateo` | `pages/Gastos`, `components/ModalVincular*` | — |
| Inventario | `inventario`, `services/ventasMostrador`, `ingresos.updateIngreso` | `pages/Inventario`, `pages/Checkout` | `inventario.md` |
| Sincronización con Renting | `ingresos`, `services/allatyouSync.service` | `components/RentingSyncModal` | `sincronizacion-gastos-renting.md` |
| CRM (retención y reseñas) | `crm` | `pages/CRM`, `utils/whatsapp` | `crm-resenas-mejoras.md` |
| Acceso, equipo, dispositivos | `auth`, `middlewares/auth.middleware` | `pages/{Login,Registro,Equipo,Configuracion}`, `context/AuthContext` | `recuperacion-contrasena.md` |
| Técnicos y liquidaciones | `tecnicos`, `liquidaciones` | `pages/ReporteLiquidaciones`, `components/ModalAsignarTecnicos` | — |
| IA (chatbot público y usos internos) | `ai`, `services/aiRouter.service`, `middlewares/{turnstile,distributedRateLimiter,tenantGuard,budgetGuard}` | `components/{PublicAIChatbot,AIChatDrawer,NotaPorVoz}` | `ia.md` |
| Kiosco de autoservicio | `kiosco` | `pages/Kiosco` (`/kiosco/:slug`) | — |
| Precios públicos y API externa | `precios` (`/api/public/precios`), `integraciones`, `middlewares/apiKey.middleware` | — | — |
| Estilo visual | — | `components/ModalConfirmacion`, `index.css` | `ui-design-system.md` |

Otros: marca blanca en `frontend/middleware.js` (reescribe dominios propios a `/landing/<slug>/index.html`); textos en `frontend/src/locales/{es,en}/translation.json`; archivos a R2 en `services/s3Service.ts`; correo en `services/emailService.ts`.

## Cómo gastar pocos tokens aquí

- **Archivos enormes, no leer completos:** `pages/Reportes.tsx` (~3.300 líneas), `ingresos.controller.ts` (~3.000), `pages/CRM.tsx` (~1.900), `pages/Checkout.tsx`, `pages/Gastos.tsx`, `gastos.controller.ts`, `pages/Dashboard.tsx` (1.200–1.400). Buscar la función o el texto con Grep y leer solo ese rango.
- **Tareas repetidas** (endpoint, endpoint con IA, migración, textos, campo de texto con voz): seguir `docs/specs/recetas.md` en vez de explorar.
- **Esquema:** `docs/database_schema.sql.txt` está desactualizado (solo 5 tablas base). Las columnas reales se ven en `backend/migrations/` y en el código; `taller_empresas`, `taller_empresas_correos`, `taller_tecnicos` y `taller_ingresos_tiempos` no tienen DDL en el repo.
- **Comandos** (dentro de `backend/` o `frontend/`): `npm run dev`; frontend además `npm run lint`; backend `npm run db:migrate:dev` y `npm test`.
- **Verificar:** `node node_modules/typescript/bin/tsc --noEmit` dentro de `backend/` y de `frontend/`. No correr `npm run build` en cada cambio. En un worktree no hay `node_modules`: correr `npm ci` en la carpeta a verificar.

## Forma de trabajo (Regla de Oro)

- **Directo al código.** Sin specs ni tickets JIRA para cambios iterativos, mejoras de UI, fixes o peticiones puntuales. Ficha nueva solo para un subsistema nuevo o si el usuario la pide (`docs/specs/TEMPLATE.md`, máximo 30 líneas).
- **Si un cambio vuelve falsa una ficha o este mapa, corregir esa línea en el mismo commit.**
- **Respuestas breves**, con enlaces a los archivos tocados.
- **Flujo git automático al terminar:** type-check, rama, commit, push, PR y merge a `main` según [`docs/specs/README.md`](docs/specs/README.md#flujo-git-al-terminar-cada-cambio-sin-pedir-confirmación). El merge despliega solo (Railway aplica las migraciones pendientes al arrancar).
