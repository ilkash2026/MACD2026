import { env } from "./env";
import type { BasicResponse, RoomStateResponse } from "./types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${env.apiBaseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

export const api = {
  roomState: () => request<RoomStateResponse>("/api/v1/room-state"),
  innerDisplay: () => request<BasicResponse>("/api/v1/inner-display"),
  createSession: (startedByDevice: string) =>
    request<BasicResponse<{ sessionId: string }>>("/api/v1/sessions", {
      method: "POST",
      body: JSON.stringify({ startedByDevice })
    }),
  startSolve: (sessionId: string, startedBy: string) =>
    request<BasicResponse>(`/api/v1/sessions/${sessionId}/solve`, {
      method: "POST",
      body: JSON.stringify({ startedBy })
    }),
  submitImage: (sessionId: string, imageBase64: string, mimeType: string) =>
    request<BasicResponse>(`/api/v1/sessions/${sessionId}/submissions`, {
      method: "POST",
      body: JSON.stringify({ imageBase64, mimeType })
    }),
  operator: {
    roomState: () => request<RoomStateResponse>("/api/v1/room-state"),
    tasks: () => request<BasicResponse>("/api/v1/operator/tasks", { headers: { "x-operator-key": env.operatorApiKey } }),
    createTask: (payload: object) =>
      request<BasicResponse>("/api/v1/operator/tasks", {
        method: "POST",
        headers: { "x-operator-key": env.operatorApiKey },
        body: JSON.stringify(payload)
      }),
    updateTask: (id: string, payload: object) =>
      request<BasicResponse>(`/api/v1/operator/tasks/${id}`, {
        method: "PATCH",
        headers: { "x-operator-key": env.operatorApiKey },
        body: JSON.stringify(payload)
      }),
    deactivateTask: (id: string) =>
      request<BasicResponse>(`/api/v1/operator/tasks/${id}`, {
        method: "DELETE",
        headers: { "x-operator-key": env.operatorApiKey }
      }),
    deleteTask: (id: string) =>
      request<BasicResponse>(`/api/v1/operator/tasks/${id}`, {
        method: "DELETE",
        headers: { "x-operator-key": env.operatorApiKey }
      }),
    drinks: () => request<BasicResponse>("/api/v1/operator/drinks", { headers: { "x-operator-key": env.operatorApiKey } }),
    createDrink: (payload: object) =>
      request<BasicResponse>("/api/v1/operator/drinks", {
        method: "POST",
        headers: { "x-operator-key": env.operatorApiKey },
        body: JSON.stringify(payload)
      }),
    updateDrink: (id: string, payload: object) =>
      request<BasicResponse>(`/api/v1/operator/drinks/${id}`, {
        method: "PATCH",
        headers: { "x-operator-key": env.operatorApiKey },
        body: JSON.stringify(payload)
      }),
    deleteDrink: (id: string) =>
      request<BasicResponse>(`/api/v1/operator/drinks/${id}`, {
        method: "DELETE",
        headers: { "x-operator-key": env.operatorApiKey }
      }),
    pricingRules: () => request<BasicResponse>("/api/v1/operator/pricing-rules", { headers: { "x-operator-key": env.operatorApiKey } }),
    createPricingRule: (payload: object) =>
      request<BasicResponse>("/api/v1/operator/pricing-rules", {
        method: "POST",
        headers: { "x-operator-key": env.operatorApiKey },
        body: JSON.stringify(payload)
      }),
    updatePricingRule: (id: string, payload: object) =>
      request<BasicResponse>(`/api/v1/operator/pricing-rules/${id}`, {
        method: "PATCH",
        headers: { "x-operator-key": env.operatorApiKey },
        body: JSON.stringify(payload)
      }),
    devices: () => request<BasicResponse>("/api/v1/operator/devices", { headers: { "x-operator-key": env.operatorApiKey } }),
    sessions: () => request<BasicResponse>("/api/v1/operator/sessions", { headers: { "x-operator-key": env.operatorApiKey } }),
    auditLogs: () => request<BasicResponse>("/api/v1/operator/audit-logs", { headers: { "x-operator-key": env.operatorApiKey } }),
    override: (payload: object) =>
      request<BasicResponse>("/api/v1/operator/override", {
        method: "POST",
        headers: { "x-operator-key": env.operatorApiKey },
        body: JSON.stringify(payload)
      }),
    occupancyAdjust: (delta: number, reason: string) =>
      request<BasicResponse>("/api/v1/operator/occupancy/adjust", {
        method: "POST",
        headers: { "x-operator-key": env.operatorApiKey },
        body: JSON.stringify({ delta, reason })
      })
  }
};
