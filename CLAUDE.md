# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

**AllAtYou Taller** (a.k.a. "TallerPro") is a multi-tenant SaaS for managing auto repair shops (Spanish-language, Colombia-based). It is a two-project repo with no root package.json — `backend/` and `frontend/` are independent npm projects, each with its own `node_modules`, run separately.

- `backend/` — Express + TypeScript API, Supabase (Postgres) as the data layer, deployed on Railway.
- `frontend/` — React 19 + TypeScript + Vite + Tailwind v4 SPA, deployed on Vercel.
- `docs/` — Raw SQL: `database_schema.sql.txt` (base schema) and `migrations/*.sql` (point-in-time migrations applied manually against Supabase).

---

## Commands

All commands are run from inside `backend/` or `frontend/` respectively (no root scripts).

### Backend (`backend/`)
- `npm run dev` — nodemon + `tsc` + run `dist/index.js`, restarts on `.ts`/`.json` changes.
- `npm run build` — `tsc` compile to `dist/`.
- `npm start` — run compiled `dist/index.js` (production).
- `node node_modules/typescript/bin/tsc --noEmit` — Type-check backend without emitting files.

### Frontend (`frontend/`)
- `npm run dev` — Vite dev server.
- `npm run build` — `tsc -b` then `vite build`.
- `npm run lint` — ESLint over the whole project.
- `npm run preview` — preview the production build.
- `node node_modules/typescript/bin/tsc --noEmit` — Type-check frontend without emitting files.

---

## Core Architecture & Multi-Tenancy Rules

1. **Tenant Isolation**: Every workshop is a tenant (`taller_empresas`). Nearly all business tables are prefixed with `taller_` and include `empresa_id` or `empresa_slug`. There is no Postgres RLS on app keys; **every controller query must filter `.eq('empresa_id', req.empresa_id)`** or `.eq('empresa_slug', slug)`.
2. **Frontend Tenant Routing**: Routes are scoped by `/:slug/*` (e.g. `/:slug/nuevo-ingreso`). `ProtectedLayout` validates session match against `empresaSlug` in `AuthContext`.
3. **Database Timezone**: All date-based operations and daily limits (especially budgets/KPIs) must be calculated against **`America/Bogota`** timezone, as Supabase default server time is UTC.

---

## Backend Subsystems & Conventions

4. **Express App Setup (`backend/src/index.ts`)**:
   - `app.set('trust proxy', 1)` is enabled to ensure `req.ip` resolves to the client's real IP behind Railway/Vercel proxies for rate limiters.
5. **Database Naming Convention**:
   - Every table MUST use the `taller_` prefix (e.g., `taller_ingresos`, `taller_ai_uso_diario`, `taller_ai_uso_global`, `taller_leads_ia`, `taller_ai_conversaciones_log`).
6. **Authentication & Device Session**:
   - Handled via JWT in `middlewares/auth.middleware.ts` (`requireAuth`). Supports OTP and email+password. Device fingerprints are validated against `taller_dispositivos_autorizados`.
7. **Ingresos State Machine**:
   - Follows `recepcion → diagnostico → cotizacion → esperando_aprobacion → en_reparacion → entregado` / `cancelado`. State updates must record duration in `taller_ingresos_tiempos` and log to `taller_ingresos_bitacora`. Labor commissions recalculate on `entregado`.
8. **Public AI Assistant & Quotation Module**:
   - Exposed on `POST /api/ai/public/chat` and `POST /api/ai/public/lead` (unauthenticated, public-facing).
   - **4-Layer Defense Pipeline**:
     1. `turnstileGuard`: Validates Cloudflare Turnstile token (fail-closed in prod, bypass only with `NODE_ENV=development` & `DISABLE_TURNSTILE_DEV=true`).
     2. `distributedRateLimiter`: Distributed sliding-window rate limit (15 req/10min per IP, 60 req/10min per tenant) backed by `taller_ai_conversaciones_log`.
     3. `tenantGuard`: Anti-enumeration guard; returns uniform 404 for invalid/inactive tenants and logs attempts via `logearIntento()`.
     4. `budgetGuard`: Hard USD budget cap circuit breaker (daily global limit + per-tenant limit from `config_ai`). Fails **closed** (returns 503 + WhatsApp fallback) on DB errors or budget exhaustion.
   - **Multi-Provider AI Router (`services/aiRouter.service.ts`)**:
     - Cascade order: Google Gemini 2.5 Flash (`gemini-2.5-flash`) → OpenAI GPT-4o-mini (`gpt-4o-mini`) → Static Fallback.
     - Post-call atomic cost accumulation via Postgres RPC `acumular_costo_diario`.
     - Deduplicated email alert notifications at 70% and 100% budget thresholds via Resend.
   - **Lead Capture & Legal Compliance**:
     - `POST /api/ai/public/lead` requires explicit consent checkbox (`acepta_terminos: true`) complying with Colombian Habeas Data (Ley 1581 de 2012).
9. **File Editing Quirk**:
   - Some build artifacts (`.js`, `.d.ts`) exist alongside `.ts` in `backend/src/`. Always edit `.ts` files only.

---

## Frontend Subsystems & Conventions

10. **API Client (`src/services/api.ts`)**:
    - Central Axios instance injecting JWT bearer token from `localStorage['taller_auth']` and handling 401/403 session expiration.
11. **Session Management**:
    - Use `useAuth()` from `src/context/AuthContext.tsx` rather than direct `localStorage` access.
12. **Public Chatbot Widget (`src/components/PublicAIChatbot.tsx`)**:
    - Standalone embeddable widget with invisible Turnstile integration, interactive question chips, Golden Rule highlight, Habeas Data lead modal, and WhatsApp direct fallback.
13. **White-Label / Edge Routing (`frontend/middleware.js`)**:
    - Vercel Edge Middleware rewrites custom host headers (e.g. `eurofrenos.lat`) to `/landing/<slug>/index.html`.

---

## Security Critical Reminders

14. **Fail-Closed on Budgets**: Never change `budgetGuard` to fail-open; unexpected LLM expenses must be prevented at all costs.
15. **Environment Variable Hygiene**:
    - Never hardcode secrets in services. Cloudflare R2 credentials, Turnstile keys, Gemini/OpenAI keys, and Resend keys must strictly come from `process.env`.
    - Do not commit real API keys to `.env.example` files.
