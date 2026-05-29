import express from "express";
import cors from "cors";
import path from "node:path";
import http from "node:http";
import { config } from "./config";
import { initSocket } from "./socket";
import { roomService } from "./services/room-service";
import { StorageService } from "./services/storage-service";
import { EvaluationService } from "./services/evaluation-service";
import { OpenAIEvaluationAdapter } from "./services/openai-adapter";
import { createPublicRouter } from "./routes/public";
import { createOperatorRouter } from "./routes/operator";

async function bootstrap(): Promise<void> {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "20mb" }));
  app.use("/uploads", express.static(path.resolve(process.cwd(), config.localUploadDir)));

  await roomService.init();

  const evaluationService = new EvaluationService(new StorageService(), new OpenAIEvaluationAdapter());

  app.get("/healthz", (_req, res) => res.json({ ok: true }));
  app.use("/api/v1", createPublicRouter(evaluationService));
  app.use("/api/v1/operator", createOperatorRouter());

  const server = http.createServer(app);
  initSocket(server);

  server.listen(config.port, () => {
    console.log(`Backend running on :${config.port}`);
  });
}

bootstrap().catch((error) => {
  console.error(error);
  process.exit(1);
});
