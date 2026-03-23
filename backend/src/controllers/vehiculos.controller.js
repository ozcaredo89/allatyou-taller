"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createVehiculo = exports.getVehiculoByPlaca = exports.getVehiculos = void 0;
const express_1 = require("express");
const supabase_1 = require("../config/supabase");
const getVehiculos = async (req, res) => {
    try {
        const { data, error } = await supabase_1.supabase.from('taller_vehiculos').select('*, taller_clientes(*)');
        if (error)
            throw error;
        res.json(data);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.getVehiculos = getVehiculos;
const getVehiculoByPlaca = async (req, res) => {
    try {
        const { placa } = req.params;
        const { data, error } = await supabase_1.supabase
            .from('taller_vehiculos')
            .select('*, taller_clientes(*)')
            .eq('placa', placa.toUpperCase())
            .single();
        if (error && error.code !== 'PGRST116')
            throw error;
        if (!data) {
            res.status(404).json({ error: 'Vehiculo no encontrado' });
            return;
        }
        res.json(data);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.getVehiculoByPlaca = getVehiculoByPlaca;
const createVehiculo = async (req, res) => {
    try {
        const { cliente_id, placa, marca, linea, modelo_anio, color } = req.body;
        const { data: existing } = await supabase_1.supabase
            .from('taller_vehiculos')
            .select('*')
            .eq('placa', placa.toUpperCase())
            .single();
        if (existing) {
            res.status(400).json({ error: 'Vehiculo con placa ya existe' });
            return;
        }
        const { data, error } = await supabase_1.supabase
            .from('taller_vehiculos')
            .insert([{
                cliente_id,
                placa: placa.toUpperCase(),
                marca,
                linea,
                modelo_anio,
                color
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
exports.createVehiculo = createVehiculo;
//# sourceMappingURL=vehiculos.controller.js.map