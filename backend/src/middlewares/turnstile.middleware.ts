import { Request, Response, NextFunction } from 'express';

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const TURNSTILE_SECRET = process.env.TURNSTILE_SECRET_KEY;

/**
 * Middleware: Cloudflare Turnstile Bot Protection
 *
 * PRODUCCIÓN: Siempre obligatorio. No hay bypass posible.
 * DESARROLLO: Solo se puede omitir si NODE_ENV === 'development'
 *             Y DISABLE_TURNSTILE_DEV === 'true'.
 *
 * El token se lee del header 'cf-turnstile-token' o del body como
 * 'cf_turnstile_token', para dar flexibilidad al cliente.
 */
export async function turnstileGuard(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // --- Blindaje de Producción ---
  // El bypass NUNCA está disponible si NODE_ENV no es 'development'.
  const isDev = process.env.NODE_ENV === 'development';
  const bypassEnabled = process.env.DISABLE_TURNSTILE_DEV === 'true';

  if (isDev && bypassEnabled) {
    // Advertencia fuerte para que no pase desapercibido en logs
    console.warn(
      '⚠️  [Turnstile] BYPASS ACTIVO — Solo válido en entorno de desarrollo local. ' +
      'Si ves este mensaje en producción, hay un error de configuración crítico en tus variables de entorno.'
    );
    next();
    return;
  }

  // En producción, si no hay secret key configurada, es un error de configuración fatal.
  if (!TURNSTILE_SECRET) {
    console.error('[Turnstile] TURNSTILE_SECRET_KEY no está configurada en variables de entorno.');
    res.status(500).json({ error: 'Error de configuración del servidor.' });
    return;
  }

  // El token puede venir como header o en el body
  const token =
    (req.headers['cf-turnstile-token'] as string) ||
    req.body?.cf_turnstile_token;

  if (!token) {
    res.status(403).json({ error: 'Token de verificación requerido.' });
    return;
  }

  try {
    // Verificar contra la API de Cloudflare
    const verifyRes = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret: TURNSTILE_SECRET,
        response: token,
        remoteip: req.ip || '',
      }).toString(),
    });

    const data = await verifyRes.json() as { success: boolean; 'error-codes'?: string[] };

    if (!data.success) {
      console.warn('[Turnstile] Token inválido:', data['error-codes']);
      res.status(403).json({ error: 'Verificación de seguridad fallida. Recarga la página.' });
      return;
    }

    next();
  } catch (err) {
    console.error('[Turnstile] Error al verificar con Cloudflare:', err);
    // En caso de error de red con Cloudflare, se rechaza por seguridad (fail-closed)
    res.status(503).json({ error: 'No se pudo verificar el token de seguridad. Intenta de nuevo.' });
  }
}
