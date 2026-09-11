import { describe, expect, it } from "vitest";
import { CameraUrlSigner } from "../src/server/services/camera-signing.js";

describe("camera preview signing", () => {
  it("accepts an unmodified link before expiry", () => {
    const signer = new CameraUrlSigner("https://garage.example", "a-long-test-secret", 300);
    const url = new URL(signer.sign("5070204", 1_000));
    expect(signer.verify("5070204", url.searchParams.get("exp") ?? undefined, url.searchParams.get("sig") ?? undefined, 1_100)).toBe(true);
  });

  it("rejects tampered and expired links", () => {
    const signer = new CameraUrlSigner("https://garage.example", "a-long-test-secret", 300);
    const url = new URL(signer.sign("5070204", 1_000));
    const expires = url.searchParams.get("exp") ?? undefined;
    const signature = url.searchParams.get("sig") ?? undefined;
    expect(signer.verify("5070205", expires, signature, 1_100)).toBe(false);
    expect(signer.verify("5070204", expires, signature, 1_301)).toBe(false);
  });
});
