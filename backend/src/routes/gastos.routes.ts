import { Router } from 'express';
import {
  getCategorias,
  createCategoria,
  updateCategoria,
  deleteCategoria,
  inicializarCategorias,
  getGastos,
  createGasto,
  updateGasto,
  deleteGasto,
  getRecurrentes,
  getPendientes,
  createRecurrente,
  updateRecurrente,
  deleteRecurrente,
} from '../controllers/gastos.controller';
import { requireAuth } from '../middlewares/auth.middleware';

const router = Router();

router.use(requireAuth);

// ── Categorías ──
router.get('/categorias', getCategorias);
router.post('/categorias/inicializar', inicializarCategorias);
router.post('/categorias', createCategoria);
router.put('/categorias/:id', updateCategoria);
router.delete('/categorias/:id', deleteCategoria);

// ── Gastos Recurrentes (Plantillas) — antes de /:id para no colisionar ──
router.get('/recurrentes/pendientes', getPendientes);
router.get('/recurrentes', getRecurrentes);
router.post('/recurrentes', createRecurrente);
router.put('/recurrentes/:id', updateRecurrente);
router.delete('/recurrentes/:id', deleteRecurrente);

// ── Gastos Ejecutados ──
router.get('/', getGastos);
router.post('/', createGasto);
router.put('/:id', updateGasto);
router.delete('/:id', deleteGasto);

export default router;
