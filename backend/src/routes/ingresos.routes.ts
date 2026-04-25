import { Router } from 'express';
import { getIngresosActivos, getHistorial, createIngreso, getIngresoById, updateIngreso, getReportesFinanzas, getReportesOperaciones, asignarTecnicos } from '../controllers/ingresos.controller';
import { requireAuth } from '../middlewares/auth.middleware';

const router = Router();

router.use(requireAuth);

router.get('/activos', getIngresosActivos);
router.get('/historial', getHistorial);
router.post('/', createIngreso);
router.get('/reportes/finanzas', getReportesFinanzas);
router.get('/reportes/operaciones', getReportesOperaciones);
router.get('/:id', getIngresoById);
router.put('/:id', updateIngreso);
router.post('/:id/tecnicos', asignarTecnicos);

export default router;
