export enum RoomMode {
  CLOSED = "CLOSED",
  VERIFICATION = "VERIFICATION",
  EVALUATION = "EVALUATION",
  OPEN = "OPEN",
  BLOCKED = "BLOCKED"
}

export enum DoorStatus {
  CLOSED = "CLOSED",
  OPEN = "OPEN"
}

export enum SessionState {
  CREATED = "CREATED",
  VERIFICATION = "VERIFICATION",
  EVALUATION = "EVALUATION",
  PASSED = "PASSED",
  FAILED = "FAILED",
  UNCERTAIN = "UNCERTAIN",
  OVERRIDDEN = "OVERRIDDEN",
  COMPLETED = "COMPLETED"
}

export enum EvaluationResult {
  PASSED = "PASSED",
  FAILED = "FAILED",
  UNCERTAIN = "UNCERTAIN"
}

export enum DeviceType {
  PI = "PI",
  TABLET = "TABLET",
  DISPLAY = "DISPLAY",
  OPERATOR = "OPERATOR"
}

export enum DeviceRole {
  BUZZER_PI = "buzzer-pi",
  DOOR_COUNTER_ENTRY_PI = "door-counter-entry-pi",
  DOOR_COUNTER_EXIT_PI = "door-counter-exit-pi",
  ACCESS_CONTROL_TABLET = "access-control-tablet",
  INNER_DISPLAY = "inner-display",
  TRAFFIC_LIGHT_DISPLAY = "traffic-light-display",
  OPERATOR_TABLET = "operator-tablet"
}

export enum DeviceEventType {
  BUZZER_PRESSED = "BUZZER_PRESSED",
  ENTER_BEAM_TRIGGERED = "ENTER_BEAM_TRIGGERED",
  EXIT_BEAM_TRIGGERED = "EXIT_BEAM_TRIGGERED",
  HEARTBEAT = "HEARTBEAT"
}

export interface PricingSnapshot {
  occupancy: number;
  updatedAt: string;
  drinks: Array<{
    drinkId: string;
    name: string;
    outerPrice: number;
    innerPrice: number;
  }>;
}

export interface RoomStateDTO {
  mode: RoomMode;
  activeSessionId: string | null;
  doorStatus: DoorStatus;
  occupancyCount: number;
  openUntil: string | null;
  evaluationDeadline: string | null;
  currentTaskId: string | null;
  pricingSnapshot: PricingSnapshot;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

export type WsEventMap = {
  "room.state.changed": RoomStateDTO;
  "session.started": { sessionId: string; taskId: string };
  "session.evaluation.started": { sessionId: string; deadline: string | null };
  "session.evaluation.completed": { sessionId: string; result: EvaluationResult };
  "door.opened": { sessionId: string; openUntil: string };
  "door.closed": { reason: string };
  "occupancy.changed": { occupancyCount: number };
  "pricing.updated": PricingSnapshot;
  "device.status.changed": { deviceId: string; status: string; lastHeartbeat: string };
  "operator.audit.logged": { type: string; message: string; createdAt: string };
};

export interface CreateSessionRequest {
  startedByDevice: string;
}

export interface StartSolveRequest {
  startedBy: string;
}

export interface CreateSubmissionRequest {
  imageBase64: string;
  mimeType: string;
}

export interface OperatorOverrideRequest {
  action: "PASS" | "FAIL" | "OPEN_DOOR" | "BLOCK" | "RESET";
  sessionId?: string;
  reason: string;
}

export interface OccupancyAdjustRequest {
  delta: number;
  reason: string;
}
