import type { NextFunction, Request, Response } from "express";

interface WindowEntry {
  count: number;
  resetAt: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
}

/**
 * Small fixed-window limiter for a single service replica. Azure ingress/WAF
 * remains the correct distributed control when the app scales beyond one.
 */
export class FixedWindowRateLimiter {
  private readonly entries = new Map<string, WindowEntry>();
  private nextSweepAt = 0;

  public constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  public consume(key: string, now = Date.now()): RateLimitDecision {
    if (now >= this.nextSweepAt) this.sweep(now);

    let entry = this.entries.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + this.windowMs };
      this.entries.set(key, entry);
    }
    entry.count += 1;

    return {
      allowed: entry.count <= this.limit,
      limit: this.limit,
      remaining: Math.max(this.limit - entry.count, 0),
      resetAt: entry.resetAt,
    };
  }

  private sweep(now: number): void {
    for (const [key, entry] of this.entries) {
      if (entry.resetAt <= now) this.entries.delete(key);
    }
    this.nextSweepAt = now + this.windowMs;
  }
}

export function createRateLimitMiddleware(limiter: FixedWindowRateLimiter) {
  return (request: Request, response: Response, next: NextFunction): void => {
    if (request.method === "OPTIONS") {
      next();
      return;
    }

    const key = request.ip || request.socket.remoteAddress || "unknown";
    const decision = limiter.consume(key);
    const resetSeconds = Math.max(Math.ceil((decision.resetAt - Date.now()) / 1000), 0);
    response.setHeader("RateLimit-Limit", decision.limit);
    response.setHeader("RateLimit-Remaining", decision.remaining);
    response.setHeader("RateLimit-Reset", resetSeconds);
    if (!decision.allowed) {
      response.setHeader("Retry-After", Math.max(resetSeconds, 1));
      response.status(429).json({ error: "Too many requests. Try again shortly." });
      return;
    }
    next();
  };
}
