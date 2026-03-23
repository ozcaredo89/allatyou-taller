"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const ingresos_controller_1 = require("../controllers/ingresos.controller");
const router = (0, express_1.Router)();
router.get('/activos', ingresos_controller_1.getIngresosActivos);
router.post('/', ingresos_controller_1.createIngreso);
exports.default = router;
//# sourceMappingURL=ingresos.routes.js.map