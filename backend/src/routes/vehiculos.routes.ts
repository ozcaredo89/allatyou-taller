import { Router } from 'express';
import { getVehiculos, getVehiculoByPlaca, createVehiculo } from '../controllers/vehiculos.controller';

const router = Router();

router.get('/', getVehiculos);
router.get('/:placa', getVehiculoByPlaca);
router.post('/', createVehiculo);

export default router;
