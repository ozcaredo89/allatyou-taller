import { Router } from 'express';
import { getMarcas, getLineasByMarca, createMarca, createLinea } from '../controllers/marcas.controller';

const router = Router();

router.get('/', getMarcas);
router.post('/', createMarca);
router.get('/:id/lineas', getLineasByMarca);
router.post('/:id/lineas', createLinea);

export default router;
