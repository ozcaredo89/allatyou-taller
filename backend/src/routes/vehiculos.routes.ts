import { Router } from 'express';
import { getVehiculos, getVehiculoByPlaca, createVehiculo, updateVehiculo } from '../controllers/vehiculos.controller';
import { requireAuth } from '../middlewares/auth.middleware';

const router = Router();

router.use(requireAuth);

router.get('/', getVehiculos);
router.get('/:placa', getVehiculoByPlaca);
router.post('/', createVehiculo);
router.put('/:id', updateVehiculo);

export default router;
