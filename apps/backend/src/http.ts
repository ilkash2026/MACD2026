import type { Response } from "express";
import type { ApiResponse } from "@inner-circle/contracts";

export function ok<T>(res: Response, data: T): void {
  const body: ApiResponse<T> = { success: true, data };
  res.json(body);
}

export function fail(res: Response, code: string, message: string, status = 400): void {
  const body: ApiResponse<never> = { success: false, error: { code, message } };
  res.status(status).json(body);
}
