import { Request, Response } from 'express';
import { supabase } from '../config/supabase';
import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = process.env.GEMINI_API_KEY;
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

export const chatConAsistente = async (req: Request, res: Response): Promise<void> => {
  try {
    const { empresa_id } = req;
    const { messages } = req.body; // messages: [{ role: 'user' | 'model', parts: [{ text: string }] }, ...]

    if (!empresa_id) {
      res.status(401).json({ error: 'Empresa no identificada' });
      return;
    }

    if (!messages || !Array.isArray(messages)) {
      res.status(400).json({ error: 'Formato de mensajes inválido' });
      return;
    }

    if (!genAI) {
      res.status(500).json({ error: 'GEMINI_API_KEY no configurada' });
      return;
    }

    // 1. Recopilación de Contexto

    // Vehículos activos en el taller (mismos estados que el Dashboard)
    const ESTADOS_ACTIVOS = ['recepcion', 'diagnostico', 'cotizacion', 'esperando_aprobacion', 'en_reparacion'];
    const { data: vehiculosTaller, error: errVehiculos } = await supabase
      .from('taller_ingresos')
      .select('id, estado')
      .eq('empresa_id', empresa_id)
      .in('estado', ESTADOS_ACTIVOS);

    if (errVehiculos) throw errVehiculos;

    // Desglose por estado para dar contexto más rico al AI
    const desglosePorEstado: Record<string, number> = {};
    (vehiculosTaller || []).forEach(v => {
      desglosePorEstado[v.estado] = (desglosePorEstado[v.estado] || 0) + 1;
    });

    // Ingresos facturados hoy/esta semana
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const inicioSemana = new Date(hoy);
    inicioSemana.setDate(hoy.getDate() - hoy.getDay() + (hoy.getDay() === 0 ? -6 : 1)); // Lunes

    // Traer items_factura para calcular el total (no existe columna 'total', se suma desde el JSONB)
    const { data: ingresosSemana, error: errIngresos } = await supabase
      .from('taller_ingresos')
      .select('items_factura, updated_at')
      .eq('empresa_id', empresa_id)
      .eq('estado', 'entregado')
      .gte('updated_at', inicioSemana.toISOString());

    if (errIngresos) throw errIngresos;

    let totalHoy = 0;
    let totalSemana = 0;

    if (ingresosSemana) {
      ingresosSemana.forEach(ingreso => {
        const total = (ingreso.items_factura || []).reduce((acc: number, item: any) => acc + (item.total || 0), 0);
        totalSemana += total;
        const fechaUpdated = new Date(ingreso.updated_at);
        if (fechaUpdated >= hoy) {
          totalHoy += total;
        }
      });
    }

    // Mantenimientos vencidos/proximos
    const { data: mantenimientos, error: errMantenimientos } = await supabase
      .from('taller_mv_proximos_mantenimientos')
      .select('*')
      .eq('empresa_id', empresa_id);

    // Consideramos vencidos si la fecha sugerida ya pasó.
    let vencidos = 0;
    if (!errMantenimientos && mantenimientos) {
        vencidos = mantenimientos.filter(m => {
            if (!m.fecha_sugerida) return false;
            return new Date(m.fecha_sugerida) < new Date();
        }).length;
    }

    const kpis = {
      vehiculos_en_taller_total: vehiculosTaller?.length || 0,
      vehiculos_por_estado: desglosePorEstado, // e.g. { recepcion: 3, diagnostico: 5, en_reparacion: 11 }
      total_facturado_hoy: totalHoy,
      total_facturado_semana: totalSemana,
      mantenimientos_vencidos: vencidos,
    };

    // 2. Integración con Gemini
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const systemInstruction = {
      role: 'system',
      parts: [{
        text: `Eres el Administrador Virtual de este taller mecánico. Tu rol es asistir al dueño basándote en los datos en tiempo real proporcionados en este JSON: ${JSON.stringify(kpis)}.
REGLAS ESTRICTAS:
NUNCA des consejos ni alertas no solicitadas.
Responde ÚNICAMENTE a lo que el usuario pregunta, de forma concisa y profesional.
Al final de tu respuesta, DEBES proporcionar siempre 3 opciones de preguntas de seguimiento (sugerencias) que el usuario podría hacerte, basadas en los datos disponibles. Formatea estas sugerencias al final de tu mensaje usando un bloque especial, por ejemplo: [SUGERENCIA: ¿Cuáles son los vehículos pendientes?].`
      }]
    };

    // Initialize chat with system instruction
    // Gemini requires: history must start with 'user' and alternate user/model.
    // We exclude the last message (sent via sendMessage) and ensure history starts with 'user'.
    const rawHistory = messages.slice(0, -1).map(m => ({
        role: m.role as 'user' | 'model',
        parts: m.parts,
    }));

    // Drop leading 'model' messages (Gemini will throw if history[0].role !== 'user')
    let historyStart = 0;
    while (historyStart < rawHistory.length && rawHistory[historyStart].role !== 'user') {
        historyStart++;
    }
    const safeHistory = rawHistory.slice(historyStart);

    const chat = model.startChat({
        systemInstruction,
        history: safeHistory,
    });

    const lastMessage = messages[messages.length - 1];
    let result;
    if (lastMessage) {
       result = await chat.sendMessage(lastMessage.parts[0].text);
    } else {
       // if no new message, we shouldn't really be here, but just in case
       res.status(400).json({ error: 'No user message provided' });
       return;
    }

    const responseText = result.response.text();

    res.json({ text: responseText });
  } catch (error: any) {
    console.error('Error en AI Controller:', error);
    res.status(500).json({ error: error.message });
  }
};
