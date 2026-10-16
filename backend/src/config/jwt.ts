import dotenv from 'dotenv';

dotenv.config();

// Sin valor por defecto: un secreto conocido permitiría falsificar tokens de cualquier empresa.
// Fail-closed: el servidor no arranca si falta.
if (!process.env.JWT_SECRET) {
  throw new Error('Falta la variable de entorno JWT_SECRET. El servidor no puede arrancar sin ella.');
}

export const JWT_SECRET: string = process.env.JWT_SECRET;
