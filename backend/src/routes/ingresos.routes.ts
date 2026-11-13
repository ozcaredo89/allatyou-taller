import { Router } from 'express';
import { getIngresosActivos, getCentinelaStatus, getHistorial, createIngreso, getIngresoById, updateIngreso, getReportesFinanzas, getReportesFinanzasDetalle, getReportesOperaciones, getReportesRepuestos, getReportePostmortem, getReporteHorasTecnicos, asignarTecnicos, rediagnosticarIngreso, getBitacora, buscarIngresosPorPlaca, syncIngresoToRenting, getRentingLeasingInfo, registrarSeguimiento, getConfigSeguimiento, updateConfigSeguimiento } from '../controllers/ingresos.controller';
import { requireAuth } from '../middlewares/auth.middleware';

const router = Router();

router.use(requireAuth);

router.get('/activos', getIngresosActivos);
router.get('/centinela', getCentinelaStatus);
router.get('/historial', getHistorial);
router.get('/buscar', buscarIngresosPorPlaca);
router.get('/config/seguimiento', getConfigSeguimiento);
router.put('/config/seguimiento', updateConfigSeguimiento);
router.post('/', createIngreso);
router.get('/reportes/finanzas', getReportesFinanzas);
router.get('/reportes/finanzas/detalle', getReportesFinanzasDetalle);
router.get('/reportes/operaciones', getReportesOperaciones);
router.get('/reportes/repuestos', getReportesRepuestos);
router.get('/reportes/postmortem', getReportePostmortem);
router.get('/reportes/horas-tecnicos', getReporteHorasTecnicos);
router.get('/:id', getIngresoById);
router.put('/:id', updateIngreso);
router.post('/:id/seguimiento', registrarSeguimiento);
router.get('/:id/renting-leasing', getRentingLeasingInfo);
router.post('/:id/renting-sync', syncIngresoToRenting);
router.post('/:id/tecnicos', asignarTecnicos);
router.post('/:id/rediagnosticar', rediagnosticarIngreso);
router.get('/:id/bitacora', getBitacora);

export default router;
