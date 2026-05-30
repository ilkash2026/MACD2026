import { EvaluationResult } from "@inner-circle/contracts";
import { prisma } from "../db";
import type { IEvaluationAdapter } from "./openai-adapter";
import type { StorageService } from "./storage-service";

export class EvaluationService {
  constructor(
    private readonly storageService: StorageService,
    private readonly adapter: IEvaluationAdapter
  ) {}

  async evaluateSubmission(input: {
    sessionId: string;
    taskPrompt: string;
    imageBase64: string;
    mimeType: string;
  }): Promise<EvaluationResult> {
    const start = Date.now();
    let uploadedUrl = "";
    let storageUploadError: string | null = null;

    try {
      const uploaded = await this.storageService.uploadBase64Image(input.imageBase64, input.mimeType, input.sessionId);
      uploadedUrl = uploaded.url;
    } catch (error) {
      storageUploadError = (error as Error).message;
    }

    const evaluation = await this.adapter.evaluate({
      taskPrompt: input.taskPrompt,
      imageDataUrl: `data:${input.mimeType};base64,${input.imageBase64}`
    });

    await prisma.submissionEvaluation.create({
      data: {
        sessionId: input.sessionId,
        imageUrl: uploadedUrl,
        evaluationStatus: "COMPLETED",
        confidence: evaluation.confidence,
        rawModelResponse: {
          model: evaluation.raw,
          ...(storageUploadError ? { storageUploadError } : {})
        } as object,
        normalizedResult: evaluation.result,
        latencyMs: Date.now() - start
      }
    });

    await prisma.session.update({
      where: { id: input.sessionId },
      data: {
        evaluationResult: evaluation.result,
        solveEndedAt: new Date()
      }
    });

    return evaluation.result;
  }

  async saveFailedEvaluation(input: { sessionId: string; reason: string }): Promise<void> {
    await prisma.submissionEvaluation.create({
      data: {
        sessionId: input.sessionId,
        imageUrl: "",
        evaluationStatus: "ERROR",
        confidence: null,
        rawModelResponse: { error: input.reason },
        normalizedResult: EvaluationResult.UNCERTAIN,
        latencyMs: 0
      }
    });
  }
}
