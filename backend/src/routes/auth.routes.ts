import { Router } from 'express';
import { getEmpresas, requestOtp, verifyOtp, registro } from '../controllers/auth.controller';

const router = Router();

router.get('/empresas', getEmpresas);
router.post('/request-otp', requestOtp);
router.post('/verify-otp', verifyOtp);
router.post('/registro', registro);

export default router;
