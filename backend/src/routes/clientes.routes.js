"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const clientes_controller_1 = require("../controllers/clientes.controller");
const router = (0, express_1.Router)();
router.get('/', clientes_controller_1.getClientes);
router.get('/:documento', clientes_controller_1.getClienteByDocumento);
router.post('/', clientes_controller_1.createCliente);
exports.default = router;
//# sourceMappingURL=clientes.routes.js.map