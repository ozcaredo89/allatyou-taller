"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const vehiculos_controller_1 = require("../controllers/vehiculos.controller");
const router = (0, express_1.Router)();
router.get('/', vehiculos_controller_1.getVehiculos);
router.get('/:placa', vehiculos_controller_1.getVehiculoByPlaca);
router.post('/', vehiculos_controller_1.createVehiculo);
exports.default = router;
//# sourceMappingURL=vehiculos.routes.js.map