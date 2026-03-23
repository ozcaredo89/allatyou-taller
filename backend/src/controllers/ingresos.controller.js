"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createIngreso = exports.getIngresosActivos = void 0;
const express_1 = require("express");
const supabase_1 = require("../config/supabase");
// Obtiene todos los ingresos que actualmente están en el taller activos
const getIngresosActivos = async (req, res) => {
    try {
        const { data, error } = await supabase_1.supabase
            .from('taller_ingresos')
            .select('*, taller_vehiculos(*, taller_clientes(*))')
            .in('estado', ['recepcion', 'diagnostico', 'en_reparacion', 'cotizacion']);
        if (error)
            throw error;
        res.json(data);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.getIngresosActivos = getIngresosActivos;
const createIngreso = async (req, res) => {
    try {
        const { vehiculo_id, kilometraje, nivel_gasolina, motivo_visita, checklist_inventario, estado_carroceria, observaciones_recepcion } = req.body;
        const { data, error } = await supabase_1.supabase
            .from('taller_ingresos')
            .insert([{
                vehiculo_id,
                kilometraje,
                nivel_gasolina,
                motivo_visita,
                checklist_inventario: checklist_inventario || {},
                estado_carroceria: estado_carroceria || {},
                observaciones_recepcion,
                estado: 'recepcion' // Estado inicial por defecto
            }])
            .select()
            .single();
        if (error)
            throw error;
        res.status(201).json(data);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.createIngreso = createIngreso;
//# sourceMappingURL=ingresos.controller.js.map