import { Router } from 'express';
import { getClientes, getClienteByDocumento, createCliente, updateCliente } from '../controllers/clientes.controller';
import { requireAuth } from '../middlewares/auth.middleware';

const router = Router();

router.use(requireAuth);

router.get('/', getClientes);
router.get('/:documento', getClienteByDocumento);
router.post('/', createCliente);
router.put('/:id', updateCliente);

export default router;
