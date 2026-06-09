import { Router } from 'express';
import { getEmpresas, requestOtp, verifyOtp, registro, updateEmpresaConfig, loginWithPassword, getEquipo, crearMiembroEquipo, aprobarMiembro } from '../controllers/auth.controller';
import { requireAuth } from '../middlewares/auth.middleware';

const router = Router();

router.get('/empresas', getEmpresas);
router.patch('/empresas/:id/config', updateEmpresaConfig);
router.post('/request-otp', requestOtp);
router.post('/verify-otp', verifyOtp);
router.post('/registro', registro);
router.post('/login-password', loginWithPassword);

// Equipo (protegidos)
router.get('/equipo', requireAuth, getEquipo);
router.post('/equipo', requireAuth, crearMiembroEquipo);
router.patch('/equipo/:id/aprobar', requireAuth, aprobarMiembro);

export default router;
