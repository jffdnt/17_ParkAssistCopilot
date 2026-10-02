import { afterEach, describe, expect, it, vi } from "vitest";

const originalEnvironment = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, originalEnvironment);
  vi.resetModules();
});

function setValidProductionEnvironment(): void {
  process.env.NODE_ENV = "production";
  process.env.AUTH_MODE = "entra";
  process.env.ENTRA_TENANT_ID = "11111111-1111-1111-1111-111111111111";
  process.env.ENTRA_CLIENT_ID = "22222222-2222-2222-2222-222222222222";
  process.env.CAMERA_SIGNING_SECRET = "a-random-looking-test-secret-that-is-long-enough";
  process.env.PLUGIN_API_KEY = "a-random-looking-plugin-key-that-is-long-enough";
}

describe("production configuration", () => {
  it("rejects anonymous authentication", async () => {
    setValidProductionEnvironment();
    process.env.AUTH_MODE = "none";
    await expect(import("../src/server/config.js")).rejects.toThrow("AUTH_MODE=none is not allowed");
  });

  it("rejects the documented placeholder camera secret", async () => {
    setValidProductionEnvironment();
    process.env.CAMERA_SIGNING_SECRET = "replace-with-at-least-32-random-characters";
    await expect(import("../src/server/config.js")).rejects.toThrow("non-placeholder value");
  });

  it("rejects a short camera secret", async () => {
    setValidProductionEnvironment();
    process.env.CAMERA_SIGNING_SECRET = "too-short";
    await expect(import("../src/server/config.js")).rejects.toThrow("at least 32 bytes");
  });

  it("accepts an authenticated production configuration with a strong camera secret", async () => {
    setValidProductionEnvironment();
    const { config } = await import("../src/server/config.js");
    expect(config.authMode).toBe("entra");
  });

  it("rejects a missing or short plugin API key", async () => {
    setValidProductionEnvironment();
    delete process.env.PLUGIN_API_KEY;
    await expect(import("../src/server/config.js")).rejects.toThrow("PLUGIN_API_KEY");

    vi.resetModules();
    setValidProductionEnvironment();
    process.env.PLUGIN_API_KEY = "too-short";
    await expect(import("../src/server/config.js")).rejects.toThrow("at least 32 bytes");
  });

  it("rejects invalid operational bounds", async () => {
    setValidProductionEnvironment();
    process.env.RATE_LIMIT_MAX_REQUESTS = "0";
    await expect(import("../src/server/config.js")).rejects.toThrow(
      "RATE_LIMIT_MAX_REQUESTS must be between 1 and 100000",
    );
  });
});
