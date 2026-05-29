import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: Number(process.env.PORT ?? 8080),
  operatorApiKey: process.env.OPERATOR_API_KEY ?? "change-me",
  openWindowSeconds: Number(process.env.OPEN_WINDOW_SECONDS ?? 20),
  evaluationTimeoutSeconds: Number(process.env.EVALUATION_TIMEOUT_SECONDS ?? 30),
  allowUncertainAutoOpen: process.env.ALLOW_UNCERTAIN_AUTO_OPEN === "true",
  imageStorageMode: process.env.IMAGE_STORAGE_MODE ?? "local",
  localUploadDir: process.env.LOCAL_UPLOAD_DIR ?? "apps/backend/uploads",
  gcsBucketName: process.env.GCS_BUCKET_NAME ?? "",
  gcpProjectId: process.env.GCP_PROJECT_ID ?? "",
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  openaiModel: process.env.OPENAI_MODEL ?? "gpt-4.1-mini"
};
