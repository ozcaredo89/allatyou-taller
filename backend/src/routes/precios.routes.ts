import { Router } from 'express';
import {
  betaTokenGuard,
  getVehiculosConPrecios,
  getMatrizPrecios,
  getAuditoriaPrecios,
} from '../controllers/precios.controller';
import { distributedRateLimiter } from '../middlewares/distributedRateLimiter.middleware';
import { tenantGuard } from '../middlewares/tenantGuard.middleware';

const router = Router({ mergeParams: true });

// Pipeline de ejecucion estricto:
// 1. betaTokenGuard (en memoria, fail-closed: CERO consultas a Supabase si el token falta o es invalido)
// 2. distributedRateLimiter (consulta log de peticiones en Supabase)
// 3. tenantGuard (consulta taller_empresas y adjunta tenantId y empresaConfigAI a req)
// 4. Controlador (utiliza los datos ya adjuntados, evitando consultas redundantes a taller_empresas)
router.get('/:slug/vehiculos', betaTokenGuard, distributedRateLimiter, tenantGuard, getVehiculosConPrecios);
router.get('/:slug/matriz', betaTokenGuard, distributedRateLimiter, tenantGuard, getMatrizPrecios);
router.get('/:slug/auditoria', betaTokenGuard, distributedRateLimiter, tenantGuard, getAuditoriaPrecios);

export default router;
