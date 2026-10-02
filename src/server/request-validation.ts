import { GARAGE_STATUSES, type GarageStatus } from "../shared/contracts.js";

export class RequestValidationError extends Error {
  public readonly statusCode = 400;

  public constructor(message: string) {
    super(message);
    this.name = "RequestValidationError";
  }
}

interface IntegerBounds {
  min: number;
  max: number;
}

export function optionalInteger(
  value: unknown,
  label: string,
  bounds: IntegerBounds,
): number | undefined {
  if (value == null || value === "") return undefined;
  if (typeof value !== "string" || !/^-?\d+$/.test(value.trim())) {
    throw new RequestValidationError(`${label} must be a whole number.`);
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < bounds.min || parsed > bounds.max) {
    throw new RequestValidationError(`${label} must be between ${bounds.min} and ${bounds.max}.`);
  }
  return parsed;
}

/**
 * Parses a floor scope such as `7`, `7,8,9`, or `7-9`.
 *
 * Copilot commonly preserves the user's range notation when it fills the
 * OpenAPI string parameter, so the REST endpoint must accept the same forms
 * as the paired SPFx component instead of forcing the model to retry.
 */
export function integerList(value: unknown): number[] | undefined {
  if (value == null || value === "") return undefined;
  if (typeof value !== "string") {
    throw new RequestValidationError("floors must be whole numbers, ranges, or a comma-separated list.");
  }

  const floors: number[] = [];
  const addFloor = (floor: number): void => {
    if (floor < 1 || floor > 11) {
      throw new RequestValidationError("floors must contain values between 1 and 11.");
    }
    if (!floors.includes(floor)) floors.push(floor);
  };

  for (const rawPart of value.split(",")) {
    const part = rawPart.trim();
    const range = /^(\d+)\s*(?:-|–|—|to|through|thru)\s*(\d+)$/i.exec(part);
    if (range) {
      const from = Number(range[1]);
      const to = Number(range[2]);
      if (from < 1 || from > 11 || to < 1 || to > 11) {
        throw new RequestValidationError("floors must contain values between 1 and 11.");
      }
      for (let floor = Math.min(from, to); floor <= Math.max(from, to); floor += 1) {
        addFloor(floor);
      }
      continue;
    }

    if (!/^\d+$/.test(part)) {
      throw new RequestValidationError("floors must be whole numbers, ranges, or a comma-separated list.");
    }
    addFloor(Number(part));
  }

  return floors.length > 0 ? floors.sort((left, right) => left - right) : undefined;
}

export function plateQuery(value: unknown): string {
  const query = typeof value === "string" ? value.trim() : "";
  const normalized = query.replace(/[^a-z0-9]/gi, "");
  if (normalized.length < 3 || normalized.length > 16) {
    throw new RequestValidationError("Enter between 3 and 16 letters or numbers from the license plate.");
  }
  return query;
}

export function garageStatus(value: unknown): GarageStatus {
  if (typeof value === "string" && (GARAGE_STATUSES as readonly string[]).includes(value)) {
    return value as GarageStatus;
  }
  throw new RequestValidationError(`status must be one of: ${GARAGE_STATUSES.join(", ")}.`);
}
