import { describe, it, expect } from "vitest";
import { DoorStatus, RoomMode } from "@inner-circle/contracts";
import { InvalidTransitionError, transitionRoomState } from "../src/domain/state-machine";

describe("room state machine", () => {
  it("transitions CLOSED -> VERIFICATION", () => {
    const next = transitionRoomState(
      { mode: RoomMode.CLOSED, doorStatus: DoorStatus.CLOSED },
      "BUZZER_PRESSED"
    );
    expect(next.mode).toBe(RoomMode.VERIFICATION);
  });

  it("transitions EVALUATION -> OPEN on passed", () => {
    const next = transitionRoomState(
      { mode: RoomMode.EVALUATION, doorStatus: DoorStatus.CLOSED },
      "EVALUATION_PASSED"
    );
    expect(next.mode).toBe(RoomMode.OPEN);
    expect(next.doorStatus).toBe(DoorStatus.OPEN);
  });

  it("rejects invalid transition", () => {
    expect(() =>
      transitionRoomState({ mode: RoomMode.CLOSED, doorStatus: DoorStatus.CLOSED }, "SOLVE_STARTED")
    ).toThrowError(InvalidTransitionError);
  });
});
