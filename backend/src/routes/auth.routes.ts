import { Router } from 'express';
import { getEmpresas, requestOtp, verifyOtp, registro, updateEmpresaConfig, loginWithPassword } from '../controllers/auth.controller';

const router = Router();

router.get('/empresas', getEmpresas);
router.patch('/empresas/:id/config', updateEmpresaConfig);
router.post('/request-otp', requestOtp);
router.post('/verify-otp', verifyOtp);
router.post('/registro', registro);
router.post('/login-password', loginWithPassword);

export default router;
