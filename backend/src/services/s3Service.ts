import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import dotenv from "dotenv";

dotenv.config();

const R2_ENDPOINT = process.env.R2_ENDPOINT || "https://c3d9de1ff85551756232965ea635ca84.r2.cloudflarestorage.com";
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || "54427cd05ebd71b5ea18d634048c65ec";
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || "8516ea21a858e1392dd86e05fc82c4e6603448604fe25bc7c71fa124307585fc";
export const BUCKET_NAME = process.env.R2_BUCKET_NAME || "allatyou-renting";

// Configuración del cliente S3 apuntando a Cloudflare R2
export const s3Client = new S3Client({
  region: "auto",
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

export const uploadFileToR2 = async (fileBuffer: Buffer, fileName: string, contentType: string): Promise<string> => {
  const customFileName = `${Date.now()}-${fileName.replace(/\s+/g, '-')}`;
  
  const uploadParams = {
    Bucket: BUCKET_NAME,
    Key: customFileName,
    Body: fileBuffer,
    ContentType: contentType,
  };

  try {
    await s3Client.send(new PutObjectCommand(uploadParams));
    
    // Si el usuario configuró R2_PUBLIC_DOMAIN lo usa, si no, usa el genérico de S3 (podría no ser público sin configuración de policies en Cloudflare)
    const baseUrl = process.env.R2_PUBLIC_DOMAIN || `${R2_ENDPOINT}/${BUCKET_NAME}`;
    const publicUrl = `${baseUrl}/${customFileName}`;
    
    return publicUrl;
  } catch (error) {
    console.error("Error uploading to R2:", error);
    throw error;
  }
};
