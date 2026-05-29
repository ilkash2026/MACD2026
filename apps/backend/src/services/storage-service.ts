import fs from "node:fs/promises";
import path from "node:path";
import { Storage } from "@google-cloud/storage";
import { config } from "../config";

export interface UploadedImage {
  url: string;
  key: string;
}

export class StorageService {
  private gcs = config.imageStorageMode === "gcs" ? new Storage({ projectId: config.gcpProjectId || undefined }) : null;

  async uploadBase64Image(base64: string, mimeType: string, sessionId: string): Promise<UploadedImage> {
    const extension = mimeType.includes("png") ? "png" : "jpg";
    const key = `${sessionId}/${Date.now()}.${extension}`;
    const buffer = Buffer.from(base64, "base64");

    if (config.imageStorageMode === "gcs" && this.gcs && config.gcsBucketName) {
      const bucket = this.gcs.bucket(config.gcsBucketName);
      const file = bucket.file(key);
      await file.save(buffer, { contentType: mimeType });
      await file.makePublic();
      return { key, url: `https://storage.googleapis.com/${config.gcsBucketName}/${key}` };
    }

    const outputDir = path.resolve(process.cwd(), config.localUploadDir);
    const filePath = path.join(outputDir, key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, buffer);
    return { key, url: `/uploads/${key}` };
  }
}
