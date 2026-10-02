import { describe, expect, it } from "vitest";
import { isValidPluginApiKey } from "../src/server/auth.js";

describe("plugin API key authorization", () => {
  const expected = "a-strong-plugin-key-with-more-than-32-bytes";

  it("accepts an exact key", () => {
    expect(isValidPluginApiKey(expected, expected)).toBe(true);
  });

  it("rejects missing and incorrect keys", () => {
    expect(isValidPluginApiKey(undefined, expected)).toBe(false);
    expect(isValidPluginApiKey(expected, undefined)).toBe(false);
    expect(isValidPluginApiKey("wrong", expected)).toBe(false);
  });
});
