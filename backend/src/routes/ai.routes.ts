import { Router } from 'express';
import {
  chatConAsistente,
  chatPublicoCotizacion,
  registrarLeadPublico,
  getConfigAI,
  updateConfigAI,
  getLeadsIA,
  updateEstadoLead,
  getUsageIA,
} from '../controllers/ai.controller';
import { requireAuth } from '../middlewares/auth.middleware';
import { turnstileGuard } from '../middlewares/turnstile.middleware';
import { distributedRateLimiter } from '../middlewares/distributedRateLimiter.middleware';
import { tenantGuard } from '../middlewares/tenantGuard.middleware';
import { budgetGuard } from '../middlewares/budgetGuard.middleware';

const router = Router();

// ─── Rutas Privadas (Administrador Interno — requiere JWT) ────────────────────
router.post('/chat', requireAuth, chatConAsistente);

// ─── Rutas Públicas (Chatbot de Cotizaciones — sin JWT) ───────────────────────
// Pipeline de seguridad: Turnstile → Rate Limiter → Tenant Guard → Budget Guard → Controlador
router.post(
  '/public/chat',
  turnstileGuard,
  distributedRateLimiter,
  tenantGuard,
  budgetGuard,
  chatPublicoCotizacion
);

// Captura de leads (sin Turnstile propio — el flujo ya pasó por /public/chat)
router.post('/public/lead', distributedRateLimiter, registrarLeadPublico);

// ─── Rutas de Administración del Módulo IA (requiere JWT) ────────────────────
router.get('/admin/config', requireAuth, getConfigAI);
router.put('/admin/config', requireAuth, updateConfigAI);
router.get('/admin/leads', requireAuth, getLeadsIA);
router.put('/admin/leads/:id', requireAuth, updateEstadoLead);
router.get('/admin/usage', requireAuth, getUsageIA);

export default router;
