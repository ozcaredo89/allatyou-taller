import { Router } from 'express';
import {
  getRetencionProspectos,
  getResenasPendientes,
  marcarResenaIntentado,
  confirmarResena,
  deshacerResena,
  descartarResena,
  bulkDescartarResenas,
  getCrmConfig,
  updateCrmConfig,
  toggleNoContactar,
} from '../controllers/crm.controller';
import { requireAuth } from '../middlewares/auth.middleware';

const router = Router();

// Retención predictiva
router.get('/retencion', requireAuth, getRetencionProspectos);

// Reseñas de Google
router.get('/resenas', requireAuth, getResenasPendientes);
router.post('/resenas/bulk-descartar', requireAuth, bulkDescartarResenas);
router.post('/resenas/:id/intentar', requireAuth, marcarResenaIntentado);
router.post('/resenas/:id/confirmar', requireAuth, confirmarResena);
router.post('/resenas/:id/deshacer', requireAuth, deshacerResena);
router.post('/resenas/:id/descartar', requireAuth, descartarResena);

// Configuración CRM
router.get('/config', requireAuth, getCrmConfig);
router.put('/config', requireAuth, updateCrmConfig);

// No contactar (Ley 1581)
router.patch('/clientes/:clienteId/no-contactar', requireAuth, toggleNoContactar);

export default router;
