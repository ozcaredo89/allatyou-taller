import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

const MENSAJE_INTERNO = 'Ocurrió un error inesperado. Intenta de nuevo y, si persiste, contacta a soporte.';

/**
 * Evita mostrar al usuario detalles técnicos (tablas, columnas, SQL) en respuestas 500 (502/503 llevan mensajes propios).
 * El mensaje original queda en el log con una referencia que también recibe el usuario.
 */
export function ocultarErroresInternos(req: Request, res: Response, next: NextFunction): void {
  const json = res.json.bind(res);
  res.json = (body?: any) => {
    if (res.statusCode === 500 && body && typeof body.error === 'string') {
      const ref = crypto.randomBytes(3).toString('hex');
      console.error(`[error ${ref}] ${req.method} ${req.originalUrl} → ${res.statusCode}: ${body.error}`);
      return json({ ...body, error: `${MENSAJE_INTERNO} (ref. ${ref})` });
    }
    return json(body);
  };
  next();
}
