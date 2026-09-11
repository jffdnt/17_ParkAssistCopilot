import path from "node:path";
import { describe, expect, it } from "vitest";
import { inferFloor, loadBayMap } from "../src/server/services/bay-map.js";

describe("bay map", () => {
  it("loads the 5 Bell map extracted from the canvas app", async () => {
    const rows = await loadBayMap(path.resolve("src/server/data/bay-map.csv"));
    expect(rows).toHaveLength(946);
    expect(rows.every((row) => row.garage === "5 Bell")).toBe(true);
    expect(new Set(rows.map((row) => row.bayId)).size).toBeGreaterThan(940);
  });

  it("infers numeric and alphanumeric floors like the canvas component", () => {
    expect(inferFloor("744", "5070204")).toBe(7);
    expect(inferFloor("10b", "5100216")).toBe(10);
    expect(inferFloor("1B", "5010118")).toBe(1);
    expect(inferFloor("1101", "5090251")).toBe(11);
  });
});
