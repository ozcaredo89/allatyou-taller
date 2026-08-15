import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import clientesRoutes from './routes/clientes.routes';
import vehiculosRoutes from './routes/vehiculos.routes';
import ingresosRoutes from './routes/ingresos.routes';
import marcasRoutes from './routes/marcas.routes';
import uploadRoutes from './routes/upload.routes';
import kioscoRoutes from './routes/kiosco.routes';
import tecnicosRoutes from './routes/tecnicos.routes';
import liquidacionesRoutes from './routes/liquidaciones.routes';
import crmRoutes from './routes/crm.routes';
import aiRoutes from './routes/ai.routes';
import gastosRoutes from './routes/gastos.routes';
dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// Confiar en el proxy de Railway/Vercel para obtener la IP real del cliente.
// Sin esto, req.ip devuelve la IP del load balancer y el rate limiter
// trataría a todos los usuarios como si fueran el mismo origen.
app.set('trust proxy', 1);

// Middleware
app.use(cors());
app.use(express.json());

import authRoutes from './routes/auth.routes';

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/clientes', clientesRoutes);
app.use('/api/vehiculos', vehiculosRoutes);
app.use('/api/ingresos', ingresosRoutes);
app.use('/api/marcas', marcasRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/tecnicos', tecnicosRoutes);
app.use('/api/kiosco', kioscoRoutes);
app.use('/api/liquidaciones', liquidacionesRoutes);
app.use('/api/crm', crmRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/gastos', gastosRoutes);
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Taller Mecánico API' });
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
// Forzar despliegue en Railway - fix is_verified founding admin 2026-05-16
