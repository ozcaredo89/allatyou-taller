export function generarLinkWhatsApp(telefono: string, mensaje: string): string {
  if (!telefono) return '';
  let telefonoLimpio = telefono.replace(/[\s-]/g, '');
  if (!telefonoLimpio.startsWith('+') && !telefonoLimpio.startsWith('57')) {
    telefonoLimpio = `57${telefonoLimpio}`;
  }
  // remover el + si lo tiene para formato wa.me
  telefonoLimpio = telefonoLimpio.replace('+', '');
  
  return `https://wa.me/${telefonoLimpio}?text=${encodeURIComponent(mensaje)}`;
}
