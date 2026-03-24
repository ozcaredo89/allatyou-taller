import { Router } from 'express';
import { getIngresosActivos, createIngreso, getIngresoById, updateIngreso } from '../controllers/ingresos.controller';

const router = Router();

router.get('/activos', getIngresosActivos);
router.post('/', createIngreso);
router.get('/:id', getIngresoById);
router.put('/:id', updateIngreso);

export default router;
