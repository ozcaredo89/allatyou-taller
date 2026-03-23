"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const clientes_routes_1 = __importDefault(require("./routes/clientes.routes"));
const vehiculos_routes_1 = __importDefault(require("./routes/vehiculos.routes"));
const ingresos_routes_1 = __importDefault(require("./routes/ingresos.routes"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const port = process.env.PORT || 3001;
// Middleware
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Routes
app.use('/api/clientes', clientes_routes_1.default);
app.use('/api/vehiculos', vehiculos_routes_1.default);
app.use('/api/ingresos', ingresos_routes_1.default);
app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'Taller Mecánico API' });
});
app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});
//# sourceMappingURL=index.js.map