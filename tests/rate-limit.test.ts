import { describe, expect, it } from "vitest";
import { FixedWindowRateLimiter } from "../src/server/middleware/rate-limit.js";

describe("fixed-window rate limiting", () => {
  it("allows the configured count and rejects the next request", () => {
    const limiter = new FixedWindowRateLimiter(2, 1_000);
    expect(limiter.consume("client", 1_000)).toMatchObject({ allowed: true, remaining: 1 });
    expect(limiter.consume("client", 1_100)).toMatchObject({ allowed: true, remaining: 0 });
    expect(limiter.consume("client", 1_200)).toMatchObject({ allowed: false, remaining: 0 });
  });

  it("isolates clients and resets the window", () => {
    const limiter = new FixedWindowRateLimiter(1, 1_000);
    expect(limiter.consume("first", 1_000).allowed).toBe(true);
    expect(limiter.consume("second", 1_100).allowed).toBe(true);
    expect(limiter.consume("first", 2_000)).toMatchObject({ allowed: true, remaining: 0 });
  });
});
