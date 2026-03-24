import { Router, Request, Response } from 'express';
import multer from 'multer';
import { uploadFileToR2 } from '../services/s3Service';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post('/', upload.single('archivo'), async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No se envió ningún archivo.' });
      return;
    }

    const fileUrl = await uploadFileToR2(req.file.buffer, req.file.originalname, req.file.mimetype);
    res.json({ url: fileUrl });
  } catch (error: any) {
    res.status(500).json({ error: 'Fallo subiendo archivo', details: error.message });
  }
});

router.post('/multiple', upload.array('archivos', 10), async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
      res.status(400).json({ error: 'No se enviaron archivos.' });
      return;
    }

    const uploadPromises = req.files.map((file) => 
      uploadFileToR2(file.buffer, file.originalname, file.mimetype)
    );
    
    const urls = await Promise.all(uploadPromises);
    res.json({ urls });
  } catch (error: any) {
    res.status(500).json({ error: 'Fallo subiendo archivos', details: error.message });
  }
});

export default router;
