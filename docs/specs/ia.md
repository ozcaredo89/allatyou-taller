# Ficha — Inteligencia artificial (chatbot público y usos internos)

**Leer si:** la tarea llama a un modelo de IA, toca el chatbot público, sus defensas o el presupuesto · **Actualizada:** 2026-11-16

## Archivos
- Rutas y lógica: `backend/src/routes/ai.routes.ts`, `backend/src/controllers/ai.controller.ts`
- Proveedores: `services/aiRouter.service.ts` → `routerIA`; `services/aiProvider.adapter.ts` → `GeminiProvider`, `OpenAIProvider`, `StaticFallbackProvider`, `PRECIOS`
- Defensas: `middlewares/{turnstile,distributedRateLimiter,tenantGuard,budgetGuard}.middleware.ts`, `middlewares/utils/logearIntento.ts`
- Frontend: `components/PublicAIChatbot.tsx` (widget público), `AIChatDrawer.tsx` (asistente interno), `NotaPorVoz.tsx` (dictado)
- Datos: `backend/migrations/create_ai_public_module.sql` → `taller_ai_uso_diario`, `taller_ai_uso_global`, `taller_ai_conversaciones_log`, `taller_leads_ia`; RPC `acumular_costo_diario`, `marcar_alerta_enviada`; ajustes del taller en `taller_empresas.config_ai`

## Contratos
- `POST /api/ai/public/chat` (sin JWT) — pasa en orden por Turnstile → límite de peticiones → `tenantGuard` → `budgetGuard` → `chatPublicoCotizacion`.
- `POST /api/ai/public/lead` (sin JWT) — exige `acepta_terminos: true` (Habeas Data, Ley 1581 de 2012).
- Internos con `requireAuth`: `POST /chat`, `POST /justificar-repuesto`, `POST /pulir-nota` → `{ texto, pulido, sin_contenido? }`.
- Administración con `requireAuth`: `GET|PUT /admin/config`, `GET /admin/leads`, `PUT /admin/leads/:id`, `GET /admin/usage`.

## Reglas de negocio
- Orden de proveedores: `gemini-2.5-flash` → `gpt-4o-mini` → respuesta fija. El costo se acumula después de cada llamada con `acumular_costo_diario`.
- Topes diarios en USD: global `AI_BUDGET_GLOBAL_USD` (2.00 por defecto) y por taller `config_ai.presupuesto_diario_usd` (0.50 por defecto). Correo de alerta al 70 % y al 100 %, una vez por día.
- `budgetGuard` falla **cerrado**: error de base de datos o tope alcanzado → 503 con derivación a WhatsApp. El limitador de peticiones falla abierto.
- Límite público: 15 peticiones/10 min por IP y 60/10 min por taller, contadas en `taller_ai_conversaciones_log`.
- `tenantGuard` responde el mismo 404 para taller inexistente o inactivo (no revela cuáles existen).

## Trampas / no tocar
- `budgetGuard` depende de `req.empresaConfigAI`, que solo pone `tenantGuard`: no sirve en rutas internas. Para una ruta interna nueva usar `hayPresupuestoIA` (en `ai.controller.ts`) y, sin presupuesto, devolver un resultado degradado sin llamar al modelo.
- Las llamadas internas pasan `omitirLog: true` a `routerIA`; si no, cuentan contra el límite del chatbot público. Su costo sí se suma al mismo tope diario del taller.
- `StaticFallbackProvider` devuelve un texto pensado para el chatbot: en usos internos comprobar `resultado.proveedor === 'static_fallback'` y no mostrarlo.
- `GeminiProvider` corta en 400 tokens de salida. `justificarRepuesto` llama a Gemini directo con el precio escrito a mano; si cambian los precios hay que actualizar ese cálculo además de `PRECIOS`.
- `app.set('trust proxy', 1)` en `index.ts` es lo que hace que el límite por IP vea la IP real; no quitarlo.
