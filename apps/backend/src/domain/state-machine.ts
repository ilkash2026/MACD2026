import { DoorStatus, RoomMode } from "@inner-circle/contracts";

export type TransitionEvent =
  | "BUZZER_PRESSED"
  | "SOLVE_STARTED"
  | "EVALUATION_PASSED"
  | "EVALUATION_FAILED"
  | "OPEN_TIMEOUT"
  | "SYSTEM_ERROR"
  | "OPERATOR_BLOCK"
  | "OPERATOR_RESET";

export interface RoomTransitionInput {
  mode: RoomMode;
  doorStatus: DoorStatus;
}

export interface RoomTransitionOutput {
  mode: RoomMode;
  doorStatus: DoorStatus;
}

export class InvalidTransitionError extends Error {
  constructor(mode: RoomMode, event: TransitionEvent) {
    super(`Invalid transition: ${mode} -> ${event}`);
  }
}

const transitionMap: Record<RoomMode, Partial<Record<TransitionEvent, RoomTransitionOutput>>> = {
  [RoomMode.CLOSED]: {
    BUZZER_PRESSED: { mode: RoomMode.VERIFICATION, doorStatus: DoorStatus.CLOSED },
    SYSTEM_ERROR: { mode: RoomMode.BLOCKED, doorStatus: DoorStatus.CLOSED },
    OPERATOR_BLOCK: { mode: RoomMode.BLOCKED, doorStatus: DoorStatus.CLOSED }
  },
  [RoomMode.VERIFICATION]: {
    SOLVE_STARTED: { mode: RoomMode.EVALUATION, doorStatus: DoorStatus.CLOSED },
    SYSTEM_ERROR: { mode: RoomMode.BLOCKED, doorStatus: DoorStatus.CLOSED },
    OPERATOR_BLOCK: { mode: RoomMode.BLOCKED, doorStatus: DoorStatus.CLOSED }
  },
  [RoomMode.EVALUATION]: {
    EVALUATION_PASSED: { mode: RoomMode.OPEN, doorStatus: DoorStatus.OPEN },
    EVALUATION_FAILED: { mode: RoomMode.CLOSED, doorStatus: DoorStatus.CLOSED },
    SYSTEM_ERROR: { mode: RoomMode.BLOCKED, doorStatus: DoorStatus.CLOSED },
    OPERATOR_BLOCK: { mode: RoomMode.BLOCKED, doorStatus: DoorStatus.CLOSED }
  },
  [RoomMode.OPEN]: {
    OPEN_TIMEOUT: { mode: RoomMode.CLOSED, doorStatus: DoorStatus.CLOSED },
    SYSTEM_ERROR: { mode: RoomMode.BLOCKED, doorStatus: DoorStatus.CLOSED },
    OPERATOR_BLOCK: { mode: RoomMode.BLOCKED, doorStatus: DoorStatus.CLOSED }
  },
  [RoomMode.BLOCKED]: {
    OPERATOR_RESET: { mode: RoomMode.CLOSED, doorStatus: DoorStatus.CLOSED }
  }
};

export function transitionRoomState(input: RoomTransitionInput, event: TransitionEvent): RoomTransitionOutput {
  const next = transitionMap[input.mode][event];
  if (!next) {
    throw new InvalidTransitionError(input.mode, event);
  }
  return next;
}
