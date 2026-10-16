import { Router } from 'express';
import { crearApiKey, listarApiKeys, revocarApiKey, getHistorialVehiculo } from '../controllers/integraciones.controller';
import { requireAuth } from '../middlewares/auth.middleware';
import { requireApiKey } from '../middlewares/apiKey.middleware';

const router = Router();

// Administración de keys (usuarios del panel)
router.post('/keys', requireAuth, crearApiKey);
router.get('/keys', requireAuth, listarApiKeys);
router.delete('/keys/:id', requireAuth, revocarApiKey);

// Consumo por integraciones (header X-API-Key)
router.get('/v1/vehiculos/:placa/historial', requireApiKey('historial_vehiculos:read'), getHistorialVehiculo);

export default router;
