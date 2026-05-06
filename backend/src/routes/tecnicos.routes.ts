import { Router } from 'express';
import { getTecnicos, createTecnico, updateTecnico, deleteTecnico } from '../controllers/tecnicos.controller';
import { requireAuth } from '../middlewares/auth.middleware';

const router = Router();

router.use(requireAuth);

router.get('/', getTecnicos);
router.post('/', createTecnico);
router.put('/:id', updateTecnico);
router.delete('/:id', deleteTecnico);

export default router;
