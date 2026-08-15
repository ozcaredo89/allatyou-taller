import { GoogleGenerativeAI, Content } from '@google/generative-ai';

// ============================================================
// Tarifas de precios por proveedor (USD por 1M tokens)
// Última verificación: 2026-08-15
// Actualizar aquí si cambian los precios oficiales.
// Fuentes:
//   Gemini: https://ai.google.dev/pricing
//   OpenAI: https://platform.openai.com/pricing
// ============================================================
const PRECIOS: Record<string, { input: number; output: number }> = {
  gemini: { input: 0.075, output: 0.300 },  // gemini-2.5-flash
  openai: { input: 0.150, output: 0.600 },  // gpt-4o-mini
};

/**
 * Estructura de un mensaje del historial conversacional.
 * Compatible con los formatos de Gemini y OpenAI a través de los adaptadores.
 */
export interface MensajeChat {
  role: 'user' | 'model' | 'assistant';
  parts: { text: string }[];
}

/**
 * Resultado normalizado que devuelve cualquier adaptador de proveedor.
 */
export interface ResultadoIA {
  texto: string;
  tokens_in: number;
  tokens_out: number;
  costo_usd: number;
  proveedor: string;
}

/**
 * Interfaz común que deben implementar todos los adaptadores de proveedores de IA.
 */
export interface IAiProvider {
  nombre: string;
  estaDisponible(): boolean;
  chat(params: {
    systemPrompt: string;
    historial: MensajeChat[];
    ultimoMensaje: string;
  }): Promise<ResultadoIA>;
}

// ============================================================
// Adaptador: Google Gemini 2.5 Flash
// ============================================================
export class GeminiProvider implements IAiProvider {
  nombre = 'gemini';
  private client: GoogleGenerativeAI | null;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    this.client = apiKey ? new GoogleGenerativeAI(apiKey) : null;
  }

  estaDisponible(): boolean {
    return this.client !== null;
  }

  async chat({ systemPrompt, historial, ultimoMensaje }: {
    systemPrompt: string;
    historial: MensajeChat[];
    ultimoMensaje: string;
  }): Promise<ResultadoIA> {
    if (!this.client) throw new Error('Gemini API key no configurada.');

    const model = this.client.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 800,
      },
    });

    // Gemini requiere que el historial comience con rol 'user'
    const historialGemini: Content[] = historial
      .filter(m => m.role === 'user' || m.role === 'model')
      .map(m => ({ role: m.role as 'user' | 'model', parts: m.parts }));

    // Eliminar mensajes iniciales de 'model' (no permitidos por Gemini)
    let inicio = 0;
    while (inicio < historialGemini.length && historialGemini[inicio].role !== 'user') {
      inicio++;
    }
    const historialSeguro = historialGemini.slice(inicio);

    const chatSession = model.startChat({
      systemInstruction: { role: 'system', parts: [{ text: systemPrompt }] },
      history: historialSeguro,
    });

    const result = await chatSession.sendMessage(ultimoMensaje);
    const usage = result.response.usageMetadata;
    const tokensIn = usage?.promptTokenCount ?? 0;
    const tokensOut = usage?.candidatesTokenCount ?? 0;
    const costo = calcularCosto('gemini', tokensIn, tokensOut);

    return {
      texto: result.response.text(),
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      costo_usd: costo,
      proveedor: 'gemini',
    };
  }
}

// ============================================================
// Adaptador: OpenAI GPT-4o-mini (Fallback)
// ============================================================
export class OpenAIProvider implements IAiProvider {
  nombre = 'openai';
  private apiKey: string | undefined;

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY;
  }

  estaDisponible(): boolean {
    return !!this.apiKey;
  }

  async chat({ systemPrompt, historial, ultimoMensaje }: {
    systemPrompt: string;
    historial: MensajeChat[];
    ultimoMensaje: string;
  }): Promise<ResultadoIA> {
    if (!this.apiKey) throw new Error('OpenAI API key no configurada.');

    // Normalizar historial al formato de mensajes de OpenAI
    const mensajesOpenAI = [
      { role: 'system', content: systemPrompt },
      ...historial.map(m => ({
        role: m.role === 'model' ? 'assistant' : 'user',
        content: m.parts[0]?.text ?? '',
      })),
      { role: 'user', content: ultimoMensaje },
    ];

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: mensajesOpenAI,
        temperature: 0.4,
        max_tokens: 800,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${errorBody}`);
    }

    const data = await response.json() as any;
    const tokensIn = data.usage?.prompt_tokens ?? 0;
    const tokensOut = data.usage?.completion_tokens ?? 0;
    const costo = calcularCosto('openai', tokensIn, tokensOut);

    return {
      texto: data.choices?.[0]?.message?.content ?? '',
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      costo_usd: costo,
      proveedor: 'openai',
    };
  }
}

// ============================================================
// Adaptador: Fallback Estático (cuando todos los proveedores fallan)
// ============================================================
export class StaticFallbackProvider implements IAiProvider {
  nombre = 'static_fallback';

  estaDisponible(): boolean {
    return true; // Siempre disponible
  }

  async chat(_params: {
    systemPrompt: string;
    historial: MensajeChat[];
    ultimoMensaje: string;
  }): Promise<ResultadoIA> {
    return {
      texto: `🔧 En este momento nuestro asistente virtual no está disponible.
Para recibir tu cotización personalizada, contáctanos directamente — estamos listos para atenderte.
[SUGERENCIA: ¿Cómo puedo agendar una cita?]
[SUGERENCIA: ¿Cuál es el horario de atención?]`,
      tokens_in: 0,
      tokens_out: 0,
      costo_usd: 0,
      proveedor: 'static_fallback',
    };
  }
}

// ============================================================
// Helper: Calcular costo en USD dado tokens y proveedor
// ============================================================
export function calcularCosto(
  proveedor: string,
  tokensIn: number,
  tokensOut: number
): number {
  const precio = PRECIOS[proveedor];
  if (!precio) return 0;
  const costoIn = (tokensIn / 1_000_000) * precio.input;
  const costoOut = (tokensOut / 1_000_000) * precio.output;
  return parseFloat((costoIn + costoOut).toFixed(6));
}
