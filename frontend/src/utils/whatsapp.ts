/**
 * Genera el enlace para iniciar un chat en WhatsApp con un mensaje prellenado.
 * 
 * NOTA CRÍTICA DE CODIFICACIÓN (UTF-8 / EMOJIS / TILDES):
 * El acortador https://wa.me/ de Meta tiene un fallo conocido al redirigir en navegadores de escritorio:
 * corrompe secuencias UTF-8 multibyte (como tildes á, é, í, ó, ú, ñ y emojis)
 * convirtiéndolos en el carácter de reemplazo  (U+FFFD).
 * 
 * Por ello, en escritorio se apunta directamente a https://web.whatsapp.com/send
 * (sin redirección intermedia) y en móvil a https://api.whatsapp.com/send.
 */
export function generarLinkWhatsApp(telefono: string, mensaje: string): string {
  if (!telefono) return '';
  let telefonoLimpio = telefono.replace(/[\s-]/g, '');
  if (!telefonoLimpio.startsWith('+') && !telefonoLimpio.startsWith('57')) {
    telefonoLimpio = `57${telefonoLimpio}`;
  }
  // Remover el + para formato internacional
  telefonoLimpio = telefonoLimpio.replace('+', '');

  // Normalizar a Unicode NFC para asegurar caracteres precompuestos y evitar tildes rotas
  const mensajeNormalizado = (mensaje || '').normalize('NFC');
  const textoCodificado = encodeURIComponent(mensajeNormalizado);

  const isMobile =
    typeof navigator !== 'undefined' &&
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  return isMobile
    ? `https://api.whatsapp.com/send?phone=${telefonoLimpio}&text=${textoCodificado}`
    : `https://web.whatsapp.com/send?phone=${telefonoLimpio}&text=${textoCodificado}`;
}
