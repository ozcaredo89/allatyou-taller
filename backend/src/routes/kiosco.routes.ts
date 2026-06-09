import { Router } from 'express';
import { getEmpresaBySlug, checkPlaca, registrarIngresoKiosco } from '../controllers/kiosco.controller';

const router = Router();

// Todas las rutas del kiosco son públicas (sin requireAuth)
router.get('/:slug', getEmpresaBySlug);
router.post('/check-placa', checkPlaca);
router.post('/registrar', registrarIngresoKiosco);

export default router;
