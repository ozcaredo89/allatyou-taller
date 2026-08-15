import { rewrite } from '@vercel/edge';

export default function middleware(request) {
  const url = new URL(request.url);
  const host = request.headers.get('host') || '';

  if (host === 'eurofrenos.lat' || host === 'www.eurofrenos.lat') {
    url.pathname = '/landing/eurofrenos/index.html';
    return rewrite(url);
  }
}

export const config = {
  matcher: '/',
};
