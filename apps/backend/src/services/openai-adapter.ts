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
                'You evaluate imitation tasks. Return strict JSON only: {"result":"PASSED|FAILED|UNCERTAIN","confidence":number,"reason":string}.'
            }
          ]
        },
        {
          role: "user",
          content: [
            { type: "input_text", text: payload.taskPrompt },
            { type: "input_image", image_url: payload.imageDataUrl }
          ]
        }
      ]
    });

    const text = response.output_text || "{\"result\":\"UNCERTAIN\",\"confidence\":0.0,\"reason\":\"no-output\"}";
    let parsed: { result: EvaluationResult; confidence?: number };
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { result: EvaluationResult.UNCERTAIN, confidence: 0 };
    }

    const allowed = new Set([EvaluationResult.PASSED, EvaluationResult.FAILED, EvaluationResult.UNCERTAIN]);
    const result = allowed.has(parsed.result) ? parsed.result : EvaluationResult.UNCERTAIN;

    return {
      result,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : null,
      raw: {
        response,
        parsed,
        latencyMs: Date.now() - startedAt
      }
    };
  }
}
