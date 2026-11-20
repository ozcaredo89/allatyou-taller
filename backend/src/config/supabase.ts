import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn('Faltan variables de entorno SUPABASE_URL o SUPABASE_ANON_KEY. Verifica el archivo .env.');
}

export const supabase = createClient(supabaseUrl || '', supabaseKey || '');

let serviceClient: typeof supabase | undefined;

export function getInventoryClientIfConfigured() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || !supabaseUrl) return undefined;
  serviceClient ??= createClient(supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return serviceClient;
}

export function getInventoryClient() {
  const client = getInventoryClientIfConfigured();
  if (!client) throw new Error('El inventario requiere SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el backend.');
  return client;
}