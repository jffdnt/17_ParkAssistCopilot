import { describe, expect, it } from "vitest";
import { normalizeRequestId } from "../src/server/middleware/request-telemetry.js";

describe("request telemetry", () => {
  it("preserves safe correlation IDs", () => {
    expect(normalizeRequestId("teams-request_123.abc")).toBe("teams-request_123.abc");
  });

  it("replaces unsafe or oversized IDs", () => {
    expect(normalizeRequestId("contains spaces")).toMatch(/^[0-9a-f-]{36}$/);
    expect(normalizeRequestId("x".repeat(65))).toMatch(/^[0-9a-f-]{36}$/);
  });
});
