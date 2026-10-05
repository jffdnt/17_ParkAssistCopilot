import type { GarageStatus, GarageStatusSpace } from "./contracts.js";

/**
 * How each drill-down status splits into categories. Copied from the SPFx
 * `copilotComponent/src/components/drilldownModel.ts`, which is a separate
 * package (React 18, Heft) and cannot import from here. Keep the two in step:
 * the generative UI and the Copilot card must bucket spaces identically, or the
 * same question gets different numbers depending on where it was asked.
 */

export type Tone = "success" | "brand" | "teal" | "marigold" | "warning" | "danger";

export interface StatusCategory {
  key: string;
  label: string;
  tone: Tone;
}

/** Every space falls in exactly one category, so category counts add up to the total. */
export function categoriesFor(status: GarageStatus): StatusCategory[] {
  switch (status) {
    case "available":
      return [{ key: "available", label: "Ready to park", tone: "success" }];
    case "occupied":
      return [
        { key: "lt1h", label: "Under 1h", tone: "teal" },
        { key: "1to4h", label: "1–4h", tone: "brand" },
        { key: "4to12h", label: "4–12h", tone: "marigold" },
        { key: "12h", label: "12h+", tone: "warning" },
        { key: "unknown", label: "Entry time unknown", tone: "brand" },
      ];
    case "stale-or-missing":
      return [
        { key: "stale", label: "Stale feed", tone: "warning" },
        { key: "missing", label: "No telemetry", tone: "danger" },
      ];
    case "out-of-service":
      return [{ key: "out-of-service", label: "Out of service", tone: "danger" }];
  }
}

export function categoryOf(status: GarageStatus, space: GarageStatusSpace): string {
  switch (status) {
    case "available":
      return "available";
    case "occupied": {
      const minutes = space.parkedMinutes;
      if (minutes === undefined) return "unknown";
      if (minutes < 60) return "lt1h";
      if (minutes < 240) return "1to4h";
      if (minutes < 720) return "4to12h";
      return "12h";
    }
    case "stale-or-missing":
      return space.feedState === "missing" ? "missing" : "stale";
    case "out-of-service":
      return "out-of-service";
  }
}

/** Compact duration: "45m", "3h 10m", "2d 4h". */
export function formatDuration(minutes: number): string {
  const rounded = Math.max(0, Math.round(minutes));
  if (rounded < 60) return `${rounded}m`;
  if (rounded < 1440) {
    const remainder = rounded % 60;
    return remainder === 0 ? `${Math.floor(rounded / 60)}h` : `${Math.floor(rounded / 60)}h ${remainder}m`;
  }
  const hours = Math.floor((rounded % 1440) / 60);
  return hours === 0 ? `${Math.floor(rounded / 1440)}d` : `${Math.floor(rounded / 1440)}d ${hours}h`;
}
