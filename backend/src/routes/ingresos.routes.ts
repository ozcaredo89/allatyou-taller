import { Router } from 'express';
import { getIngresosActivos, createIngreso } from '../controllers/ingresos.controller';

const router = Router();

router.get('/activos', getIngresosActivos);
router.post('/', createIngreso);

export default router;
