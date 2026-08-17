import { rewrite } from '@vercel/edge';

export default function middleware(request) {
  const url = new URL(request.url);
  const host = request.headers.get('host') || '';

  if (host === 'eurofrenos.lat' || host === 'www.eurofrenos.lat') {
    // Si la petición ya viene prefijada con /landing/ no tocamos nada (evita loops)
    if (url.pathname.startsWith('/landing/')) {
      return;
    }

    // Ruta raíz → sirve el index.html de la landing
    if (url.pathname === '/' || url.pathname === '') {
      url.pathname = '/landing/eurofrenos/index.html';
      return rewrite(url);
    }

    // Cualquier otro asset (img/, CSS, JS, fuentes, favicon...) →
    // reescribir bajo /landing/eurofrenos/ para que Vercel sirva el archivo real
    url.pathname = `/landing/eurofrenos${url.pathname}`;
    return rewrite(url);
  }
}

export const config = {
  // Interceptar TODOS los paths del dominio propio, no solo '/'
  matcher: '/:path*',
};
