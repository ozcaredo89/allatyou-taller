import { Router } from 'express';
import { getTecnicos, createTecnico } from '../controllers/tecnicos.controller';
import { requireAuth } from '../middlewares/auth.middleware';

const router = Router();

router.use(requireAuth);

router.get('/', getTecnicos);
router.post('/', createTecnico);

export default router;
