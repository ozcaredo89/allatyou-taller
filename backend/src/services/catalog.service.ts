import { supabase } from '../config/supabase';

/**
 * Estructura de un ítem de catálogo del taller (derivado de items_factura)
 */
interface ItemCatalogo {
  descripcion: string;
  tipo: 'repuesto' | 'mano_obra';
  precio_min: number;
  precio_max: number;
  precio_promedio: number;
  ocurrencias: number;
}

/**
 * Estructura del catálogo completo de un taller
 */
export interface CatalogoTaller {
  nombre: string;
  telefono: string | null;
  config_ai: {
    activo: boolean;
    modo_precios: 'rangos' | 'exacto';
    presupuesto_diario_usd: number;
    telefono_leads: string | null;
    email_notificaciones: string | null;
  };
  empresa_id: string;
  repuestos: ItemCatalogo[];
  mano_obra: ItemCatalogo[];
}

/**
 * Servicio de Catálogo de Precios por Taller
 *
 * Obtiene el catálogo de servicios y repuestos de un taller específico
 * consultando los ítems históricos de facturación.
 *
 * El modo de precios (config_ai.modo_precios) controla si se exponen
 * los precios exactos o rangos con variación (±10-15%) como protección
 * anti-scraping de datos competitivos.
 */
export async function obtenerCatalogoTaller(slug: string): Promise<CatalogoTaller | null> {
  // 1. Obtener datos de la empresa
  const { data: empresa, error: errEmpresa } = await supabase
    .from('taller_empresas')
    .select('id, nombre, telefono_contacto, config_ai')
    .eq('slug', slug)
    .single();

  if (errEmpresa || !empresa) {
    return null;
  }

  // 2. Verificar que el módulo IA esté activo para este taller
  const configAI = empresa.config_ai ?? {
    activo: true,
    modo_precios: 'rangos',
    presupuesto_diario_usd: 0.50,
    telefono_leads: null,
    email_notificaciones: null,
  };

  if (!configAI.activo) {
    return null; // Módulo desactivado por el taller
  }

  // 3. Obtener los últimos 60 días de ítems facturados para construir catálogo
  const hace60Dias = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

  const { data: ingresos, error: errIngresos } = await supabase
    .from('taller_ingresos')
    .select('items_factura')
    .eq('empresa_id', empresa.id)
    .eq('estado', 'entregado')
    .gte('updated_at', hace60Dias)
    .not('items_factura', 'is', null);

  // Agregar ítems por descripción y tipo para calcular precios representativos
  const agregados: Record<string, {
    tipo: 'repuesto' | 'mano_obra';
    precios: number[];
  }> = {};

  if (!errIngresos && ingresos) {
    for (const ingreso of ingresos) {
      for (const item of (ingreso.items_factura || [])) {
        if (!item.descripcion || !item.precio_unitario) continue;

        const clave = `${item.tipo}::${item.descripcion.toLowerCase().trim()}`;

        if (!agregados[clave]) {
          agregados[clave] = { tipo: item.tipo, precios: [] };
        }
        agregados[clave].precios.push(Number(item.precio_unitario));
      }
    }
  }

  // 4. Construir catálogo ordenado por frecuencia (los más comunes primero)
  const modoPrecios = configAI.modo_precios ?? 'rangos';

  const todosLosItems: ItemCatalogo[] = Object.entries(agregados)
    .filter(([, v]) => v.precios.length >= 1)
    .map(([clave, v]) => {
      const [, descripcion] = clave.split('::');
      const sorted = [...v.precios].sort((a, b) => a - b);
      const min = sorted[0];
      const max = sorted[sorted.length - 1];
      const promedio = Math.round(v.precios.reduce((a, b) => a + b, 0) / v.precios.length);

      return {
        descripcion: capitalizar(descripcion),
        tipo: v.tipo,
        precio_min: aplicarDelta(modoPrecios, min, -0.10),
        precio_max: aplicarDelta(modoPrecios, max, 0.15),
        precio_promedio: aplicarDelta(modoPrecios, promedio, 0),
        ocurrencias: v.precios.length,
      };
    })
    .sort((a, b) => b.ocurrencias - a.ocurrencias);

  const repuestos = todosLosItems.filter(i => i.tipo === 'repuesto').slice(0, 40);
  const manoObra = todosLosItems.filter(i => i.tipo === 'mano_obra').slice(0, 30);

  return {
    nombre: empresa.nombre,
    telefono: empresa.telefono_contacto ?? configAI.telefono_leads ?? null,
    config_ai: configAI,
    empresa_id: empresa.id,
    repuestos,
    mano_obra: manoObra,
  };
}

/**
 * Formatea el catálogo en texto legible optimizado para el system prompt de Gemini/OpenAI.
 * Se aplica formato Markdown para facilitar la comprensión del modelo.
 */
export function formatearCatalogoParaPrompt(catalogo: CatalogoTaller): string {
  const modoStr = catalogo.config_ai.modo_precios === 'rangos' ? 'RANGOS ORIENTATIVOS' : 'PRECIOS DE REFERENCIA';
  const lineas: string[] = [`### Catálogo de ${modoStr} en COP (Pesos Colombianos)\n`];

  if (catalogo.mano_obra.length > 0) {
    lineas.push('**Mano de Obra:**');
    for (const item of catalogo.mano_obra) {
      if (item.precio_min === item.precio_max) {
        lineas.push(`- ${item.descripcion}: $${formatCOP(item.precio_promedio)}`);
      } else {
        lineas.push(`- ${item.descripcion}: $${formatCOP(item.precio_min)} – $${formatCOP(item.precio_max)}`);
      }
    }
  }

  if (catalogo.repuestos.length > 0) {
    lineas.push('\n**Repuestos y Materiales:**');
    for (const item of catalogo.repuestos) {
      if (item.precio_min === item.precio_max) {
        lineas.push(`- ${item.descripcion}: $${formatCOP(item.precio_promedio)}`);
      } else {
        lineas.push(`- ${item.descripcion}: $${formatCOP(item.precio_min)} – $${formatCOP(item.precio_max)}`);
      }
    }
  }

  if (lineas.length <= 1) {
    lineas.push('_El taller aún no cuenta con un catálogo configurado. Ofrece rangos de mercado para Colombia._');
  }

  return lineas.join('\n');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function aplicarDelta(modo: string, precio: number, delta: number): number {
  if (modo !== 'rangos' || delta === 0) return Math.round(precio);
  return Math.round(precio * (1 + delta));
}

function formatCOP(valor: number): string {
  return new Intl.NumberFormat('es-CO').format(Math.round(valor));
}

function capitalizar(texto: string): string {
  if (!texto) return texto;
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}
