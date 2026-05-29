import { z } from "zod";

export const createSessionSchema = z.object({
  startedByDevice: z.string().min(1)
});

export const solveSchema = z.object({
  startedBy: z.string().min(1)
});

export const submissionSchema = z.object({
  imageBase64: z.string().min(10),
  mimeType: z.string().default("image/jpeg")
});

export const deviceEventSchema = z.object({
  deviceId: z.string().min(1),
  type: z.string().min(1),
  payload: z.record(z.any()).default({})
});

export const heartbeatSchema = z.object({
  metadata: z.record(z.any()).optional()
});

export const overrideSchema = z.object({
  action: z.enum(["PASS", "FAIL", "OPEN_DOOR", "BLOCK", "RESET"]),
  sessionId: z.string().optional(),
  reason: z.string().min(2)
});

export const occupancyAdjustSchema = z.object({
  delta: z.number().int(),
  reason: z.string().min(2)
});
