import { Router } from "express";
import { DeviceEventType, EvaluationResult } from "@inner-circle/contracts";
import { prisma } from "../db";
import { fail, ok } from "../http";
import { submissionSchema, createSessionSchema, deviceEventSchema, heartbeatSchema, solveSchema } from "../validation";
import { roomService } from "../services/room-service";
import type { EvaluationService } from "../services/evaluation-service";

export function createPublicRouter(evaluationService: EvaluationService): Router {
  const router = Router();

  router.get("/room-state", async (_req, res) => {
    const state = await roomService.getRoomState();
    return ok(res, state);
  });

  router.get("/inner-display", async (_req, res) => {
    const state = await roomService.getRoomState();
    const task = await roomService.getCurrentTask();
    const pricing = await roomService.listCurrentDrinksForDisplay();
    return ok(res, {
      mode: state.mode,
      task: task
        ? {
            id: task.id,
            name: task.name,
            instructionInner: task.instructionInner
          }
        : null,
      pricing
    });
  });

  router.post("/sessions", async (req, res) => {
    const parsed = createSessionSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, "INVALID_BODY", parsed.error.message, 400);

    try {
      const output = await roomService.createSession(parsed.data.startedByDevice);
      return ok(res, output);
    } catch (error) {
      return fail(res, "SESSION_CREATE_FAILED", (error as Error).message, 409);
    }
  });

  router.post("/sessions/:id/solve", async (req, res) => {
    const parsed = solveSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, "INVALID_BODY", parsed.error.message, 400);

    try {
      await roomService.startSolve(req.params.id);
      return ok(res, { sessionId: req.params.id, startedBy: parsed.data.startedBy });
    } catch (error) {
      return fail(res, "SOLVE_START_FAILED", (error as Error).message, 409);
    }
  });

  router.post("/sessions/:id/submissions", async (req, res) => {
    const parsed = submissionSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, "INVALID_BODY", parsed.error.message, 400);

    try {
      const session = await prisma.session.findUnique({
        where: { id: req.params.id },
        include: { task: true }
      });
      if (!session) return fail(res, "NOT_FOUND", "Session not found", 404);

      const result = await evaluationService.evaluateSubmission({
        sessionId: session.id,
        taskPrompt: session.task.evaluationPrompt,
        imageBase64: parsed.data.imageBase64,
        mimeType: parsed.data.mimeType
      });

      await roomService.completeEvaluation(session.id, result);
      return ok(res, { sessionId: session.id, result });
    } catch (error) {
      await roomService.completeEvaluation(req.params.id, EvaluationResult.UNCERTAIN, "evaluation-error");
      await evaluationService.saveFailedEvaluation({ sessionId: req.params.id, reason: (error as Error).message });
      return fail(res, "EVALUATION_FAILED", (error as Error).message, 500);
    }
  });

  router.post("/device-events", async (req, res) => {
    const parsed = deviceEventSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, "INVALID_BODY", parsed.error.message, 400);

    try {
      await roomService.processDeviceEvent(parsed.data.deviceId, parsed.data.type, parsed.data.payload);
      if (parsed.data.type === DeviceEventType.BUZZER_PRESSED) {
        await roomService.createSession(parsed.data.deviceId);
      }
      return ok(res, { accepted: true });
    } catch (error) {
      return fail(res, "DEVICE_EVENT_FAILED", (error as Error).message, 409);
    }
  });

  router.post("/devices/:id/heartbeat", async (req, res) => {
    const parsed = heartbeatSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, "INVALID_BODY", parsed.error.message, 400);

    await roomService.deviceHeartbeat(req.params.id, parsed.data.metadata);
    return ok(res, { accepted: true });
  });

  return router;
}
