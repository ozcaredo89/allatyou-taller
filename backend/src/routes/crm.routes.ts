import { Router } from 'express';
import { getRetencionProspectos } from '../controllers/crm.controller';
import { requireAuth } from '../middlewares/auth.middleware';

const router = Router();

router.get('/retencion', requireAuth, getRetencionProspectos);

export default router;
