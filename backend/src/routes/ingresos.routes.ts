import { Router } from 'express';
import { getIngresosActivos, getCentinelaStatus, getHistorial, createIngreso, getIngresoById, updateIngreso, getReportesFinanzas, getReportesFinanzasDetalle, getReportesOperaciones, getReportesRepuestos, getReportePostmortem, getReporteHorasTecnicos, getReporteIngresosDiarios, asignarTecnicos, rediagnosticarIngreso, getBitacora, buscarIngresosPorPlaca, syncIngresoToRenting, getRentingLeasingInfo, registrarSeguimiento, getConfigSeguimiento, updateConfigSeguimiento, getCatalogoItems } from '../controllers/ingresos.controller';
import { requireAuth } from '../middlewares/auth.middleware';
import { recibirEvidencias } from '../services/seguimientoEvidencias';

const router = Router();

router.use(requireAuth);

router.get('/activos', getIngresosActivos);
router.get('/centinela', getCentinelaStatus);
router.get('/historial', getHistorial);
router.get('/buscar', buscarIngresosPorPlaca);
router.get('/catalogo-items', getCatalogoItems);
router.get('/config/seguimiento', getConfigSeguimiento);
router.put('/config/seguimiento', updateConfigSeguimiento);
router.post('/', createIngreso);
router.get('/reportes/finanzas', getReportesFinanzas);
router.get('/reportes/finanzas/detalle', getReportesFinanzasDetalle);
router.get('/reportes/operaciones', getReportesOperaciones);
router.get('/reportes/repuestos', getReportesRepuestos);
router.get('/reportes/postmortem', getReportePostmortem);
router.get('/reportes/horas-tecnicos', getReporteHorasTecnicos);
router.get('/reportes/ingresos-diarios', getReporteIngresosDiarios);
router.get('/:id', getIngresoById);
router.put('/:id', updateIngreso);
router.post('/:id/seguimiento', recibirEvidencias, registrarSeguimiento);
router.get('/:id/renting-leasing', getRentingLeasingInfo);
router.post('/:id/renting-sync', syncIngresoToRenting);
router.post('/:id/tecnicos', asignarTecnicos);
router.post('/:id/rediagnosticar', rediagnosticarIngreso);
router.get('/:id/bitacora', getBitacora);

export default router;
