import { Router } from 'express';
import {
  getLiquidaciones,
  updateLiquidacion,
  bulkUpdateLiquidaciones,
  liquidarTecnico,
} from '../controllers/liquidaciones.controller';
import { requireAuth } from '../middlewares/auth.middleware';

const router = Router();

router.use(requireAuth);

router.get('/', getLiquidaciones);
router.post('/liquidar', liquidarTecnico);
router.put('/bulk', bulkUpdateLiquidaciones);
router.put('/:id', updateLiquidacion);

export default router;
