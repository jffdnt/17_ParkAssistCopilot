import { readFile } from "node:fs/promises";
import path from "node:path";
import type { BayMapRow } from "../types.js";

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      values.push(value);
      value = "";
    } else {
      value += character;
    }
  }

  values.push(value);
  return values;
}

export function inferFloor(spaceNumber: string, bayId: string): number {
  const cleanSpace = spaceNumber.trim();
  const cleanBay = bayId.replace(/^\+/, "");
  const numericSpace = Number.parseInt(cleanSpace, 10);

  let floorFromBay = 0;
  if (/^5\d{6}$/.test(cleanBay)) {
    floorFromBay = Number.parseInt(cleanBay.slice(1, 3), 10);
  } else if (/^\d{3}$/.test(cleanBay)) {
    floorFromBay = Number.parseInt(cleanBay[0], 10);
  }

  let floorFromSpace = 0;
  if (Number.isFinite(numericSpace)) {
    if (numericSpace < 200) floorFromSpace = 1;
    else if (numericSpace < 1000) floorFromSpace = Math.floor(numericSpace / 100);
    else floorFromSpace = Math.floor(numericSpace / 100);
  } else {
    const leadingFloor = cleanSpace.match(/^(10|11|[1-9])/i)?.[1];
    floorFromSpace = leadingFloor ? Number.parseInt(leadingFloor, 10) : 1;
  }

  let floor = floorFromBay || floorFromSpace || 1;
  if (floorFromSpace > 1 && floorFromSpace !== floor) {
    floor = floorFromSpace;
  }
  return Math.max(1, floor);
}

export async function loadBayMap(filePath = process.env.BAY_MAP_PATH ?? path.resolve(process.cwd(), "src/server/data/bay-map.csv")): Promise<BayMapRow[]> {
  const csv = await readFile(filePath, "utf8");
  const lines = csv.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]);
  const index = (header: string) => headers.indexOf(header);
  const bayIdIndex = index("bayId");
  const spaceNumberIndex = index("spaceNumber");
  const designationIndex = index("designation");
  const garageIndex = index("garage");

  if ([bayIdIndex, spaceNumberIndex, designationIndex, garageIndex].some((value) => value < 0)) {
    throw new Error("bay-map.csv is missing one or more required columns.");
  }

  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    const bayId = cells[bayIdIndex]?.trim() ?? "";
    const spaceNumber = cells[spaceNumberIndex]?.trim() ?? "";
    return {
      bayId,
      spaceNumber,
      designation: cells[designationIndex]?.trim() || "General",
      garage: cells[garageIndex]?.trim() || "5 Bell",
      floor: inferFloor(spaceNumber, bayId),
    };
  }).filter((row) => row.bayId && row.spaceNumber);
}
