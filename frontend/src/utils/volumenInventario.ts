export const factorLitros = { cuarto: 0.946353, litro: 1, 'galón': 3.785412 } as const;
export type UnidadVolumen = keyof typeof factorLitros;

export const pluralVolumen: Record<UnidadVolumen | 'tambor', string> = {
  cuarto: 'cuartos', litro: 'litros', 'galón': 'galones', tambor: 'tambores',
};

const numero = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 3 });

export interface CapturaVolumen {
  cantidad_captura?: number;
  unidad_captura?: UnidadVolumen;
  precio_unitario_captura?: number;
}

export function aLitros(cantidad: number, unidad: UnidadVolumen) {
  return Math.round(cantidad * factorLitros[unidad] * 1000) / 1000;
}

export function mostrarCantidadInventario(item: {
  cantidad: number; cantidad_captura?: number; unidad_captura?: UnidadVolumen | 'und';
}, esGranel = false) {
  const unidad = item.unidad_captura;
  if (unidad && unidad !== 'und' && item.cantidad_captura != null) {
    const captura = `${numero.format(item.cantidad_captura)} ${item.cantidad_captura === 1 ? unidad : pluralVolumen[unidad]}`;
    return unidad === 'litro' ? captura : `${captura} (${numero.format(item.cantidad)} L)`;
  }
  return esGranel ? `${numero.format(item.cantidad)} L` : item.cantidad;
}
