import { Router } from 'express';
import { getIngresosActivos, getHistorial, createIngreso, getIngresoById, updateIngreso } from '../controllers/ingresos.controller';
import { requireAuth } from '../middlewares/auth.middleware';

const router = Router();

router.use(requireAuth);

router.get('/activos', getIngresosActivos);
router.get('/historial', getHistorial);
router.post('/', createIngreso);
router.get('/:id', getIngresoById);
router.put('/:id', updateIngreso);

export default router;
