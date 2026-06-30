import { Router } from 'express';
import { 
  getEmpresas, requestOtp, verifyOtp, registro, updateEmpresaConfig, loginWithPassword, 
  getEquipo, crearMiembroEquipo, aprobarMiembro,
  getDispositivos, revocarDispositivo, logout
} from '../controllers/auth.controller';
import { requireAuth } from '../middlewares/auth.middleware';

const router = Router();

router.get('/empresas', getEmpresas);
router.patch('/empresas/:id/config', updateEmpresaConfig);
router.post('/request-otp', requestOtp);
router.post('/verify-otp', verifyOtp);
router.post('/registro', registro);
router.post('/login-password', loginWithPassword);
router.post('/logout', logout); // opcionalmente podría requerir auth pero mejor dejarlo abierto para limpiar siempre

// Equipo (protegidos)
router.get('/equipo', requireAuth, getEquipo);
router.post('/equipo', requireAuth, crearMiembroEquipo);
router.patch('/equipo/:id/aprobar', requireAuth, aprobarMiembro);

// Dispositivos (protegidos)
router.get('/dispositivos', requireAuth, getDispositivos);
router.delete('/dispositivos/:id', requireAuth, revocarDispositivo);

export default router;
