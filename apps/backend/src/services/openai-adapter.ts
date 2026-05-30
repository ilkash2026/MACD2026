import OpenAI from "openai";
import { EvaluationResult } from "@inner-circle/contracts";
import { config } from "../config";

export interface EvaluationPayload {
  taskPrompt: string;
  imageDataUrl: string;
}

export interface EvaluationOutput {
  result: EvaluationResult;
  confidence: number | null;
  raw: unknown;
}

export interface IEvaluationAdapter {
  evaluate(payload: EvaluationPayload): Promise<EvaluationOutput>;
}

export class OpenAIEvaluationAdapter implements IEvaluationAdapter {
  private client = new OpenAI({ apiKey: config.openaiApiKey });

  private extractJsonObject(text: string): string | null {
    const trimmed = text.trim();
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;

    const fenced = trimmed.match(/```json\s*([\s\S]*?)\s*```/i);
    if (fenced?.[1]) return fenced[1].trim();

    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return trimmed.slice(firstBrace, lastBrace + 1).trim();
    }

    return null;
  }

  private parseEvaluation(text: string): { result: EvaluationResult; confidence: number | null } {
    const fallback = { result: EvaluationResult.UNCERTAIN, confidence: 0 };
    const jsonText = this.extractJsonObject(text);
    if (!jsonText) return fallback;

    let parsed: { result?: string; confidence?: number };
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      return fallback;
    }

    const normalized = typeof parsed.result === "string" ? parsed.result.toUpperCase().trim() : "UNCERTAIN";
    const allowed = new Set([EvaluationResult.PASSED, EvaluationResult.FAILED, EvaluationResult.UNCERTAIN]);
    const rawResult = allowed.has(normalized as EvaluationResult)
      ? (normalized as EvaluationResult)
      : EvaluationResult.UNCERTAIN;
    const confidence = typeof parsed.confidence === "number" ? Math.max(0, Math.min(1, parsed.confidence)) : null;

    // Guard against low-confidence false negatives.
    const result = rawResult === EvaluationResult.FAILED && (confidence ?? 0) < 0.55
      ? EvaluationResult.UNCERTAIN
      : rawResult;

    return { result, confidence };
  }

  async evaluate(payload: EvaluationPayload): Promise<EvaluationOutput> {
    const startedAt = Date.now();
    const response = await this.client.responses.create({
      model: config.openaiModel,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text:
                'You evaluate imitation tasks from one image. Return strict JSON only: {"result":"PASSED|FAILED|UNCERTAIN","confidence":number,"reason":string}. Use PASSED if the required gesture/action is clearly present. Use FAILED only if the image is clear and the required action is clearly missing/wrong. Use UNCERTAIN for blur, occlusion, bad framing, weak evidence, or mixed evidence.'
            }
          ]
        },
        {
          role: "user",
          content: [
            { type: "input_text", text: payload.taskPrompt },
            { type: "input_image", image_url: payload.imageDataUrl, detail: "auto" }
          ]
        }
      ]
    });

    const text = response.output_text || "{\"result\":\"UNCERTAIN\",\"confidence\":0.0,\"reason\":\"no-output\"}";
    const parsed = this.parseEvaluation(text);

    return {
      result: parsed.result,
      confidence: parsed.confidence,
      raw: {
        response,
        parsed,
        outputText: text,
        latencyMs: Date.now() - startedAt
      }
    };
  }
}
