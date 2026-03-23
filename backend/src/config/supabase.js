"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.supabase = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseKey) {
    console.warn('Faltan variables de entorno SUPABASE_URL o SUPABASE_ANON_KEY. Verifica el archivo .env.');
}
exports.supabase = (0, supabase_js_1.createClient)(supabaseUrl || '', supabaseKey || '');
//# sourceMappingURL=supabase.js.map