import { Router } from 'express';
import { getClientes, getClienteByDocumento, createCliente } from '../controllers/clientes.controller';
import { requireAuth } from '../middlewares/auth.middleware';

const router = Router();

router.use(requireAuth);

router.get('/', getClientes);
router.get('/:documento', getClienteByDocumento);
router.post('/', createCliente);

export default router;
