"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCliente = exports.getClienteByDocumento = exports.getClientes = void 0;
const express_1 = require("express");
const supabase_1 = require("../config/supabase");
const getClientes = async (req, res) => {
    try {
        const { data, error } = await supabase_1.supabase.from('taller_clientes').select('*');
        if (error)
            throw error;
        res.json(data);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.getClientes = getClientes;
const getClienteByDocumento = async (req, res) => {
    try {
        const { documento } = req.params;
        const { data, error } = await supabase_1.supabase
            .from('taller_clientes')
            .select('*')
            .eq('documento', documento)
            .single();
        if (error && error.code !== 'PGRST116')
            throw error; // PGRST116 is not found
        if (!data) {
            res.status(404).json({ error: 'Cliente no encontrado' });
            return;
        }
        res.json(data);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.getClienteByDocumento = getClienteByDocumento;
const createCliente = async (req, res) => {
    try {
        const { documento, nombre_completo, telefono, email } = req.body;
        // UPSERT or Insert Check
        const { data: existing } = await supabase_1.supabase
            .from('taller_clientes')
            .select('*')
            .eq('documento', documento)
            .single();
        if (existing) {
            res.status(400).json({ error: 'Cliente con documento ya existe' });
            return;
        }
        const { data, error } = await supabase_1.supabase
            .from('taller_clientes')
            .insert([{ documento, nombre_completo, telefono, email }])
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
exports.createCliente = createCliente;
//# sourceMappingURL=clientes.controller.js.map