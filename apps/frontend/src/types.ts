import type { RoomStateDTO, EvaluationResult } from "@inner-circle/contracts";

export type RoomStateResponse = { success: boolean; data: RoomStateDTO };
export type BasicResponse<T = unknown> = { success: boolean; data: T };

export interface InnerDisplayData {
  mode: string;
  task: { id: string; name: string; instructionInner: string } | null;
  pricing: RoomStateDTO["pricingSnapshot"];
}

export interface SessionEvalResult {
  sessionId: string;
  result: EvaluationResult;
}
