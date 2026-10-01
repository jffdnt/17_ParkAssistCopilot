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

/** Parses the REST representation `floors=7,8,9`. */
export function integerList(value: unknown): number[] | undefined {
  if (value == null || value === "") return undefined;
  if (typeof value !== "string") {
    throw new RequestValidationError("floors must be a comma-separated list of whole numbers.");
  }

  const parts = value.split(",");
  if (parts.some((part) => !/^\d+$/.test(part.trim()))) {
    throw new RequestValidationError("floors must be a comma-separated list of whole numbers.");
  }

  const floors = [...new Set(parts.map((part) => Number(part.trim())))];
  if (floors.some((floor) => floor < 1 || floor > 11)) {
    throw new RequestValidationError("floors must contain values between 1 and 11.");
  }
  return floors.length > 0 ? floors : undefined;
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
