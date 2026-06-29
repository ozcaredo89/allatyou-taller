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

    // Vehículos en el taller hoy (recepcion, diagnostico, en_reparacion)
    const { data: vehiculosTaller, error: errVehiculos } = await supabase
      .from('taller_ingresos')
      .select('id')
      .eq('empresa_id', empresa_id)
      .in('estado', ['recepcion', 'diagnostico', 'en_reparacion']);

    if (errVehiculos) throw errVehiculos;

    // Ingresos facturados hoy/esta semana
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const inicioSemana = new Date(hoy);
    inicioSemana.setDate(hoy.getDate() - hoy.getDay() + (hoy.getDay() === 0 ? -6 : 1)); // Lunes

    // Traer todos los ingresos de la semana y sumar (podríamos hacerlo con RPC o agrupando, pero en backend JS es simple)
    const { data: ingresosSemana, error: errIngresos } = await supabase
      .from('taller_ingresos')
      .select('total, fecha_ingreso')
      .eq('empresa_id', empresa_id)
      .gte('fecha_ingreso', inicioSemana.toISOString());

    if (errIngresos) throw errIngresos;

    let totalHoy = 0;
    let totalSemana = 0;

    if (ingresosSemana) {
      ingresosSemana.forEach(ingreso => {
        const total = Number(ingreso.total || 0);
        totalSemana += total;
        const fechaIngreso = new Date(ingreso.fecha_ingreso);
        if (fechaIngreso >= hoy) {
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
      vehiculos_en_taller: vehiculosTaller?.length || 0,
      total_facturado_hoy: totalHoy,
      total_facturado_semana: totalSemana,
      mantenimientos_vencidos: vencidos,
    };

    // 2. Integración con Gemini
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const systemInstruction = `Eres el Administrador Virtual de este taller mecánico. Tu rol es asistir al dueño basándote en los datos en tiempo real proporcionados en este JSON: ${JSON.stringify(kpis)}.
REGLAS ESTRICTAS:
NUNCA des consejos ni alertas no solicitadas.
Responde ÚNICAMENTE a lo que el usuario pregunta, de forma concisa y profesional.
Al final de tu respuesta, DEBES proporcionar siempre 3 opciones de preguntas de seguimiento (sugerencias) que el usuario podría hacerte, basadas en los datos disponibles. Formatea estas sugerencias al final de tu mensaje usando un bloque especial, por ejemplo: [SUGERENCIA: ¿Cuáles son los vehículos pendientes?].`;

    // Initialize chat with system instruction
    const chat = model.startChat({
        systemInstruction,
        history: messages.slice(0, -1).map(m => ({
            role: m.role,
            parts: m.parts,
        }))
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
