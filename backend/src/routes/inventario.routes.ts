import { Router } from 'express';
import { anularMovimiento, desactivarItem, guardarItem, listarItems, listarMovimientos, registrarMovimiento } from '../controllers/inventario.controller';
import { requireAuth } from '../middlewares/auth.middleware';

const router = Router();
router.use(requireAuth);
router.get('/items', listarItems);
router.post('/items', guardarItem);
router.put('/items/:id', guardarItem);
router.delete('/items/:id', desactivarItem);
router.get('/movimientos', listarMovimientos);
router.post('/movimientos', registrarMovimiento);
router.post('/movimientos/:id/anular', anularMovimiento);

export default router;
