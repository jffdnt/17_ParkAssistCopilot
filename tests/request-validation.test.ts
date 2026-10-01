import { describe, expect, it } from "vitest";
import {
  integerList,
  optionalInteger,
  plateQuery,
  RequestValidationError,
} from "../src/server/request-validation.js";

describe("component REST request validation", () => {
  it("accepts bounded integers and rejects partial or out-of-range values", () => {
    expect(optionalInteger("12", "limit", { min: 1, max: 24 })).toBe(12);
    expect(() => optionalInteger("12abc", "limit", { min: 1, max: 24 })).toThrow(RequestValidationError);
    expect(() => optionalInteger("25", "limit", { min: 1, max: 24 })).toThrow("limit must be between 1 and 24");
  });

  it("parses, deduplicates, and bounds floor lists", () => {
    expect(integerList("9,7,9")).toEqual([9, 7]);
    expect(() => integerList("7,bad")).toThrow(RequestValidationError);
    expect(() => integerList("12")).toThrow("floors must contain values between 1 and 11");
  });

  it("validates the normalized plate query length", () => {
    expect(plateQuery(" AB-123 ")).toBe("AB-123");
    expect(() => plateQuery("---")).toThrow(RequestValidationError);
    expect(() => plateQuery("A".repeat(17))).toThrow(RequestValidationError);
  });
});
