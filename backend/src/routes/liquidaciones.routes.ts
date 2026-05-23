import { Router } from 'express';
import { getLiquidaciones, updateLiquidacion, bulkUpdateLiquidaciones } from '../controllers/liquidaciones.controller';
import { requireAuth } from '../middlewares/auth.middleware';

const router = Router();

router.use(requireAuth);

router.get('/', getLiquidaciones);
router.put('/bulk', bulkUpdateLiquidaciones);
router.put('/:id', updateLiquidacion);

export default router;
