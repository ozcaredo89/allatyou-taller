import { Router } from 'express';
import { getMarcas, getLineasByMarca, createMarca, createLinea } from '../controllers/marcas.controller';
import { requireAuth } from '../middlewares/auth.middleware';

const router = Router();

router.use(requireAuth);

router.get('/', getMarcas);
router.post('/', createMarca);
router.get('/:id/lineas', getLineasByMarca);
router.post('/:id/lineas', createLinea);

export default router;
