import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

const validRequestId = /^[A-Za-z0-9._-]{1,64}$/;

export function normalizeRequestId(value: string | undefined): string {
  return value && validRequestId.test(value) ? value : randomUUID();
}

/** Structured access log that intentionally excludes query strings and bodies. */
export function requestTelemetry(request: Request, response: Response, next: NextFunction): void {
  const requestId = normalizeRequestId(request.header("x-request-id"));
  const startedAt = process.hrtime.bigint();
  response.setHeader("x-request-id", requestId);

  response.once("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    console.log(JSON.stringify({
      level: "info",
      event: "http_request",
      service: "parkassist-copilot",
      requestId,
      method: request.method,
      path: request.path,
      status: response.statusCode,
      durationMs: Math.round(durationMs * 10) / 10,
    }));
  });
  next();
}
