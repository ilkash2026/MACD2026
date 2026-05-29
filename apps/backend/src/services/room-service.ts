import {
  DeviceEventType,
  DoorStatus,
  EvaluationResult,
  RoomMode,
  SessionState,
  type PricingSnapshot,
  type RoomStateDTO
} from "@inner-circle/contracts";
import type { Task } from "@prisma/client";
import { config } from "../config";
import { prisma } from "../db";
import { calculateInnerPrice, type PricingConfig } from "../domain/pricing-engine";
import { InvalidTransitionError, transitionRoomState, type TransitionEvent } from "../domain/state-machine";
import { emitEvent } from "../socket";

const dedupeWindowMs = 1200;

export class RoomService {
  private openTimeout: NodeJS.Timeout | null = null;
  private lastDeviceEventMap = new Map<string, number>();

  async init(): Promise<void> {
    const state = await prisma.roomState.findUnique({ where: { id: "global" } });
    if (!state) {
      await prisma.roomState.create({
        data: {
          id: "global",
          mode: RoomMode.CLOSED,
          doorStatus: DoorStatus.CLOSED,
          occupancyCount: 0
        }
      });
    }

    await this.recoverOpenTimeoutAfterRestart();
  }

  async getRoomState(): Promise<RoomStateDTO> {
    const state = await prisma.roomState.findUniqueOrThrow({ where: { id: "global" } });
    const pricingSnapshot = await this.computePricingSnapshot(state.occupancyCount);
    return {
      mode: state.mode as RoomMode,
      activeSessionId: state.activeSessionId,
      doorStatus: state.doorStatus as DoorStatus,
      occupancyCount: state.occupancyCount,
      openUntil: state.openUntil ? state.openUntil.toISOString() : null,
      evaluationDeadline: state.evaluationDeadline ? state.evaluationDeadline.toISOString() : null,
      currentTaskId: state.currentTaskId,
      pricingSnapshot
    };
  }

  async createSession(startedByDevice: string): Promise<{ sessionId: string }> {
    const room = await prisma.roomState.findUniqueOrThrow({ where: { id: "global" } });
    if (room.mode !== RoomMode.CLOSED) {
      throw new Error("Room is not in CLOSED mode");
    }

    const task =
      (await prisma.task.findFirst({ where: { active: true }, orderBy: { updatedAt: "desc" } })) ??
      (await prisma.task.findFirst({ orderBy: { updatedAt: "desc" } }));
    if (!task) throw new Error("No active task configured");

    const session = await prisma.session.create({
      data: {
        startedByDevice,
        activeTaskId: task.id,
        state: SessionState.VERIFICATION,
        observationStartedAt: new Date()
      }
    });

    await this.applyTransition("BUZZER_PRESSED", {
      activeSessionId: session.id,
      currentTaskId: task.id,
      evaluationDeadline: null
    });

    await this.logAudit("SESSION_STARTED", "INFO", "Session started from buzzer", {
      sessionId: session.id,
      taskId: task.id,
      startedByDevice
    });

    emitEvent("session.started", { sessionId: session.id, taskId: task.id });
    return { sessionId: session.id };
  }

  async startSolve(sessionId: string): Promise<void> {
    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) throw new Error("Session not found");

    await prisma.session.update({
      where: { id: sessionId },
      data: {
        state: SessionState.EVALUATION,
        observationEndedAt: new Date(),
        solveStartedAt: new Date()
      }
    });

    const deadline = new Date(Date.now() + config.evaluationTimeoutSeconds * 1000);
    await this.applyTransition("SOLVE_STARTED", { evaluationDeadline: deadline });
    emitEvent("session.evaluation.started", { sessionId, deadline: deadline.toISOString() });
  }

  async completeEvaluation(sessionId: string, result: EvaluationResult, reason?: string): Promise<void> {
    if (result === EvaluationResult.PASSED) {
      await prisma.session.update({
        where: { id: sessionId },
        data: {
          state: SessionState.PASSED,
          finalOutcome: "AUTO_PASS"
        }
      });
      await this.applyTransition("EVALUATION_PASSED", {
        evaluationDeadline: null,
        openUntil: new Date(Date.now() + config.openWindowSeconds * 1000)
      });
      await this.scheduleOpenTimeout();
      emitEvent("session.evaluation.completed", { sessionId, result });
      return;
    }

    const isUncertain = result === EvaluationResult.UNCERTAIN;
    if (isUncertain && config.allowUncertainAutoOpen) {
      await this.applyTransition("EVALUATION_PASSED", {
        evaluationDeadline: null,
        openUntil: new Date(Date.now() + config.openWindowSeconds * 1000)
      });
      await this.scheduleOpenTimeout();
    } else {
      await this.applyTransition("EVALUATION_FAILED", {
        activeSessionId: null,
        currentTaskId: null,
        evaluationDeadline: null,
        openUntil: null
      });
    }

    await prisma.session.update({
      where: { id: sessionId },
      data: {
        state: isUncertain ? SessionState.UNCERTAIN : SessionState.FAILED,
        finalOutcome: reason ?? result
      }
    });

    emitEvent("session.evaluation.completed", { sessionId, result });
  }

  async processDeviceEvent(deviceId: string, type: string, payload: Record<string, unknown>): Promise<void> {
    await prisma.deviceEvent.create({
      data: { deviceId, type, payload }
    });

    const dedupeKey = `${deviceId}:${type}`;
    const lastAt = this.lastDeviceEventMap.get(dedupeKey) ?? 0;
    const now = Date.now();
    if (now - lastAt < dedupeWindowMs) {
      return;
    }
    this.lastDeviceEventMap.set(dedupeKey, now);

    if (type === DeviceEventType.ENTER_BEAM_TRIGGERED) {
      await this.adjustOccupancy(1, "ENTRY_BEAM", payload);
    }
    if (type === DeviceEventType.EXIT_BEAM_TRIGGERED) {
      await this.adjustOccupancy(-1, "EXIT_BEAM", payload);
    }
  }

  async operatorOverride(input: {
    action: "PASS" | "FAIL" | "OPEN_DOOR" | "BLOCK" | "RESET";
    reason: string;
    sessionId?: string;
  }): Promise<void> {
    const room = await prisma.roomState.findUniqueOrThrow({ where: { id: "global" } });

    await prisma.operatorAction.create({
      data: {
        action: input.action,
        reason: input.reason,
        payload: { sessionId: input.sessionId }
      }
    });

    if (input.action === "BLOCK") {
      await this.applyTransition("OPERATOR_BLOCK");
      await this.logAudit("OPERATOR_BLOCK", "WARN", "Operator blocked the system", input);
      return;
    }

    if (input.action === "RESET") {
      await this.applyTransition("OPERATOR_RESET", {
        activeSessionId: null,
        currentTaskId: null,
        evaluationDeadline: null,
        openUntil: null
      });
      await this.logAudit("OPERATOR_RESET", "INFO", "Operator reset the system", input);
      return;
    }

    if (input.action === "OPEN_DOOR" || input.action === "PASS") {
      const activeSessionId = input.sessionId ?? room.activeSessionId;
      if (!activeSessionId) throw new Error("No active session to open");

      if (room.mode === RoomMode.VERIFICATION) {
        await this.applyTransition("SOLVE_STARTED", {
          evaluationDeadline: new Date(Date.now() + config.evaluationTimeoutSeconds * 1000)
        });
      }

      await prisma.session.update({
        where: { id: activeSessionId },
        data: {
          state: SessionState.OVERRIDDEN,
          overrideAction: input.action,
          overrideReason: input.reason,
          finalOutcome: "OPERATOR_OPENED"
        }
      });
      await this.applyTransition("EVALUATION_PASSED", {
        openUntil: new Date(Date.now() + config.openWindowSeconds * 1000),
        evaluationDeadline: null
      });
      await this.scheduleOpenTimeout();
      await this.logAudit("OPERATOR_OVERRIDE", "WARN", "Operator opened door", input);
      return;
    }

    if (input.action === "FAIL") {
      const activeSessionId = input.sessionId ?? room.activeSessionId;
      if (!activeSessionId) throw new Error("No active session to fail");

      if (room.mode === RoomMode.VERIFICATION) {
        await this.applyTransition("SOLVE_STARTED", {
          evaluationDeadline: new Date(Date.now() + config.evaluationTimeoutSeconds * 1000)
        });
      }

      await prisma.session.update({
        where: { id: activeSessionId },
        data: {
          state: SessionState.OVERRIDDEN,
          overrideAction: input.action,
          overrideReason: input.reason,
          finalOutcome: "OPERATOR_FAILED"
        }
      });
      await this.applyTransition("EVALUATION_FAILED", {
        activeSessionId: null,
        currentTaskId: null,
        evaluationDeadline: null,
        openUntil: null
      });
      await this.logAudit("OPERATOR_OVERRIDE", "WARN", "Operator failed session", input);
    }
  }

  async operatorAdjustOccupancy(delta: number, reason: string): Promise<void> {
    await this.adjustOccupancy(delta, "OPERATOR_ADJUST", { reason });
  }

  async deviceHeartbeat(deviceId: string, metadata: Record<string, unknown> = {}): Promise<void> {
    await prisma.device.upsert({
      where: { id: deviceId },
      create: {
        id: deviceId,
        type: "PI",
        role: metadata.role && typeof metadata.role === "string" ? metadata.role : "unknown",
        status: "ONLINE",
        lastHeartbeat: new Date(),
        metadata
      },
      update: {
        status: "ONLINE",
        lastHeartbeat: new Date(),
        metadata
      }
    });

    emitEvent("device.status.changed", {
      deviceId,
      status: "ONLINE",
      lastHeartbeat: new Date().toISOString()
    });
  }

  private async adjustOccupancy(delta: number, source: string, payload: Record<string, unknown>): Promise<void> {
    const room = await prisma.roomState.findUniqueOrThrow({ where: { id: "global" } });
    const next = Math.max(0, room.occupancyCount + delta);
    await prisma.roomState.update({ where: { id: "global" }, data: { occupancyCount: next } });
    const pricing = await this.computePricingSnapshot(next);
    emitEvent("occupancy.changed", { occupancyCount: next });
    emitEvent("pricing.updated", pricing);

    await this.logAudit("OCCUPANCY_CHANGED", "INFO", "Occupancy changed", {
      from: room.occupancyCount,
      to: next,
      source,
      payload
    });
  }

  async listCurrentDrinksForDisplay(): Promise<PricingSnapshot> {
    const room = await prisma.roomState.findUniqueOrThrow({ where: { id: "global" } });
    return this.computePricingSnapshot(room.occupancyCount);
  }

  async getCurrentTask(): Promise<Task | null> {
    const room = await prisma.roomState.findUnique({ where: { id: "global" } });
    if (!room?.currentTaskId) return null;
    return prisma.task.findUnique({ where: { id: room.currentTaskId } });
  }

  private async computePricingSnapshot(occupancy: number): Promise<PricingSnapshot> {
    const drinks = await prisma.drink.findMany({
      where: { active: true },
      include: { pricingRule: true },
      orderBy: { name: "asc" }
    });

    const priced = drinks.map((drink) => {
      const cfg = (drink.pricingRule?.config ?? { ranges: [{ multiplier: 1 }] }) as PricingConfig;
      return {
        drinkId: drink.id,
        name: drink.name,
        outerPrice: drink.basePriceOuter,
        innerPrice: calculateInnerPrice(drink.basePriceOuter, occupancy, cfg)
      };
    });

    return {
      occupancy,
      updatedAt: new Date().toISOString(),
      drinks: priced
    };
  }

  private async applyTransition(event: TransitionEvent, overrides: Record<string, unknown> = {}): Promise<void> {
    const room = await prisma.roomState.findUniqueOrThrow({ where: { id: "global" } });
    let transition;
    try {
      transition = transitionRoomState({ mode: room.mode as RoomMode, doorStatus: room.doorStatus as DoorStatus }, event);
    } catch (error) {
      if (error instanceof InvalidTransitionError) {
        await this.logAudit("INVALID_TRANSITION", "ERROR", error.message, {
          mode: room.mode,
          event
        });
      }
      throw error;
    }

    const updated = await prisma.roomState.update({
      where: { id: "global" },
      data: {
        mode: transition.mode,
        doorStatus: transition.doorStatus,
        ...overrides
      }
    });

    const snapshot = await this.getRoomState();
    emitEvent("room.state.changed", snapshot);

    if (transition.doorStatus === DoorStatus.OPEN) {
      emitEvent("door.opened", {
        sessionId: updated.activeSessionId ?? "",
        openUntil: updated.openUntil?.toISOString() ?? new Date().toISOString()
      });
    }

    if (transition.doorStatus === DoorStatus.CLOSED) {
      emitEvent("door.closed", { reason: event });
    }

    await this.logAudit("STATE_TRANSITION", "INFO", `${room.mode} -> ${transition.mode}`, {
      event,
      from: room,
      to: updated
    });
  }

  private async scheduleOpenTimeout(timeoutMs = config.openWindowSeconds * 1000): Promise<void> {
    if (this.openTimeout) clearTimeout(this.openTimeout);
    this.openTimeout = setTimeout(async () => {
      try {
        await this.applyTransition("OPEN_TIMEOUT", {
          activeSessionId: null,
          currentTaskId: null,
          openUntil: null,
          evaluationDeadline: null
        });
      } catch {
        await this.logAudit("TIMEOUT_ERROR", "ERROR", "Failed to close room on timeout", {});
      }
    }, timeoutMs);
  }

  private async recoverOpenTimeoutAfterRestart(): Promise<void> {
    const room = await prisma.roomState.findUniqueOrThrow({ where: { id: "global" } });
    if (room.mode !== RoomMode.OPEN) return;

    const nowMs = Date.now();
    const openUntilMs = room.openUntil?.getTime() ?? 0;

    if (openUntilMs <= nowMs) {
      await this.applyTransition("OPEN_TIMEOUT", {
        activeSessionId: null,
        currentTaskId: null,
        openUntil: null,
        evaluationDeadline: null
      });
      return;
    }

    await this.scheduleOpenTimeout(openUntilMs - nowMs);
  }

  private async logAudit(type: string, severity: string, message: string, payload: Record<string, unknown>): Promise<void> {
    const entry = await prisma.auditLog.create({
      data: { type, severity, message, payload }
    });

    emitEvent("operator.audit.logged", {
      type: entry.type,
      message: entry.message,
      createdAt: entry.createdAt.toISOString()
    });
  }
}

export const roomService = new RoomService();
