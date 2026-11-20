import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { RequestHandler } from 'express';
import multer from 'multer';

export const evidenciasTabla = 'public.taller_seguimiento_evidencias';
const maxArchivos = 4;
const maxEntrada = 25 * 1024 * 1024;
const maxSalida = 4 * 1024 * 1024;
const ejecutar = promisify(execFile);
const carga = multer({
  storage: multer.memoryStorage(),
  limits: { files: maxArchivos, fileSize: maxEntrada, fields: 5, fieldSize: 8000, parts: 10 }
}).array('evidencias', maxArchivos);

let cargasActivas = 0;

export const recibirEvidencias: RequestHandler = (req, res, next) => {
  if (!req.is('multipart/form-data')) {
    next();
    return;
  }
  if (cargasActivas >= 2) {
    res.status(503).json({ error: 'Hay otras evidencias en proceso. Intenta nuevamente en unos segundos.' });
    return;
  }
  cargasActivas++;
  let activo = true;
  let procesando = false;
  const liberar = () => {
    if (!activo) return;
    activo = false;
    cargasActivas--;
    res.off('close', liberarCargaInterrumpida);
  };
  const liberarCargaInterrumpida = () => { if (!procesando) liberar(); };
  res.once('close', liberarCargaInterrumpida);
  carga(req, res, error => {
    if (error) {
      liberar();
      res.status(400).json({ error: 'Adjunta hasta 4 archivos de máximo 25 MB cada uno.' });
      return;
    }
    procesando = true;
    res.locals.liberarCargaEvidencias = liberar;
    next();
  });
};

export class EvidenciaInvalida extends Error {}

export interface EvidenciaComprimida {
  tipo: 'image/jpeg' | 'video/mp4';
  contenido: Buffer;
}

function formato(buffer: Buffer): { demuxer: string; video: boolean } {
  if (buffer.subarray(0, 3).toString('hex') === 'ffd8ff') return { demuxer: 'jpeg_pipe', video: false };
  if (buffer.subarray(0, 8).toString('hex') === '89504e470d0a1a0a') return { demuxer: 'png_pipe', video: false };
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return { demuxer: 'webp_pipe', video: false };
  }
  if (buffer.toString('ascii', 4, 8) === 'ftyp') {
    return { demuxer: 'mov', video: true };
  }
  if (buffer.subarray(0, 4).toString('hex') === '1a45dfa3') return { demuxer: 'matroska', video: true };
  throw new EvidenciaInvalida('Usa fotos JPG, PNG o WebP y videos MP4, MOV o WebM.');
}

export async function comprimirEvidencias(archivos: Express.Multer.File[]): Promise<EvidenciaComprimida[]> {
  if (!archivos.length) return [];
  const formatos = archivos.map(archivo => formato(archivo.buffer));
  if (formatos.filter(f => f.video).length > 2) {
    throw new EvidenciaInvalida('Adjunta hasta 2 videos por avance.');
  }

  const ffmpeg: string | null = process.env.SEGUIMIENTO_FFMPEG_PATH || require('ffmpeg-static');
  if (!ffmpeg) throw new Error('FFmpeg no está disponible.');
  const carpeta = await mkdtemp(join(tmpdir(), 'taller-evidencia-'));
  try {
    const comprimidos: EvidenciaComprimida[] = [];
    for (const [indice, archivo] of archivos.entries()) {
      const { demuxer, video } = formatos[indice];
      const entrada = join(carpeta, indice + '.src');
      const salida = join(carpeta, indice + (video ? '.mp4' : '.jpg'));
      await writeFile(entrada, archivo.buffer);
      try {
        const { stderr } = await ejecutar(ffmpeg, [
          '-hide_banner', '-nostdin', '-protocol_whitelist', 'file', '-f', demuxer,
          '-threads', '2', '-max_pixels', '20000000', '-i', entrada,
          '-map', '0:v:0', '-map_metadata', '-1', '-map_chapters', '-1', '-filter_threads', '2',
          ...(video ? [
            '-map', '0:a:0?', '-t', '21',
            '-vf', "scale='min(854,iw)':'min(854,ih)':force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2,setsar=1,fps=24",
            '-c:v', 'libx264', '-threads', '2', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
            '-b:v', '850k', '-maxrate', '1000k', '-bufsize', '1000k',
            '-c:a', 'aac', '-ac', '1', '-b:a', '64k', '-movflags', '+faststart'
          ] : [
            '-an', '-frames:v', '1', '-vf', "scale='min(1600,iw)':'min(1600,ih)':force_original_aspect_ratio=decrease",
            '-c:v', 'mjpeg', '-threads', '2', '-q:v', '5'
          ]),
          salida
        ], { timeout: 12000, maxBuffer: 256 * 1024, windowsHide: true });

        if (video) {
          const duracion = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
          if (!duracion || Number(duracion[1]) * 3600 + Number(duracion[2]) * 60 + Number(duracion[3]) > 20) {
            throw new EvidenciaInvalida('Cada video debe tener una duración de máximo 20 segundos.');
          }
        }
        const contenido = await readFile(salida);
        if (!contenido.length || contenido.length > maxSalida) {
          throw new EvidenciaInvalida('No pudimos reducir el tamaño del archivo. Adjunta una versión más pequeña.');
        }
        comprimidos.push({ tipo: video ? 'video/mp4' : 'image/jpeg', contenido });
      } catch (error) {
        if (error instanceof EvidenciaInvalida) throw error;
        throw new EvidenciaInvalida('No pudimos procesar uno de los archivos. Revisa el formato o adjunta una versión más pequeña.');
      } finally {
        await rm(entrada, { force: true });
        await rm(salida, { force: true });
      }
    }
    return comprimidos;
  } finally {
    await rm(carpeta, { recursive: true, force: true });
  }
}
