import { Router } from 'express';
import { chatConAsistente } from '../controllers/ai.controller';
import { requireAuth } from '../middlewares/auth.middleware';

const router = Router();

router.use(requireAuth);

router.post('/chat', chatConAsistente);

export default router;
