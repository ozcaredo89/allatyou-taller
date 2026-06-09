import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// Extend Express Request object
declare module 'express-serve-static-core' {
  interface Request {
    empresa_id?: string;
    user_email?: string;
  }
}

const JWT_SECRET = process.env.JWT_SECRET || 'allatyou-super-secret-key';

export const requireAuth = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Autorización requerida. Token faltante.' });
      return;
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as { empresa_id: string, email: string };
    
    req.empresa_id = decoded.empresa_id;
    req.user_email = decoded.email;
    
    next();
  } catch (error) {
    res.status(403).json({ error: 'Token inválido o expirado.' });
  }
};
