import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import clientesRoutes from './routes/clientes.routes';
import vehiculosRoutes from './routes/vehiculos.routes';
import ingresosRoutes from './routes/ingresos.routes';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/clientes', clientesRoutes);
app.use('/api/vehiculos', vehiculosRoutes);
app.use('/api/ingresos', ingresosRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Taller Mecánico API' });
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
