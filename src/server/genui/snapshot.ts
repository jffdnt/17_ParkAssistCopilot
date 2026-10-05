import type { SourceData } from "../../shared/genui/hydrate.js";
import type { Source } from "../../shared/genui/spec.js";
import type { ParkingDataService } from "../services/parking-data.js";

/** Rows per list query. The service's own maximum; totals cover the full match set regardless. */
const LIST_LIMIT = 24;

/**
 * One consistent picture of the garage for one chat turn.
 *
 * The model reads data through the data tools, then renders a view bound to
 * the same queries. Both go through here, so the view shows exactly the
 * numbers the model reasoned about. Two layers make that hold:
 *  - every query in the turn derives from a single upstream read
 *    (`ParkingDataService.forTurn`), so different queries agree with each other;
 *  - each distinct query is answered once, so a data tool and a view agree.
 * Without this, the upstream feed's flapping (stale counts swing 45 → 115
 * between calls) would let the model's sentence and the chart beside it
 * disagree, and the shared cache can expire mid-turn.
 */
export class TurnSnapshot {
  private readonly answers = new Map<string, Promise<SourceData>>();
  private readonly parking: ParkingDataService;

  public constructor(parking: ParkingDataService) {
    this.parking = parking.forTurn();
  }

  public fetch(source: Source): Promise<SourceData> {
    const key = snapshotKey(source);
    let answer = this.answers.get(key);
    if (!answer) {
      answer = this.load(source);
      // A failed fetch must not be memoised, or one truncated upstream
      // response would poison every later read in the turn.
      answer.catch(() => this.answers.delete(key));
      this.answers.set(key, answer);
    }
    return answer;
  }

  private async load(source: Source): Promise<SourceData> {
    switch (source.query) {
      case "overview":
        return { kind: "list", result: await this.parking.getOverview() };
      case "availableSpaces":
        return {
          kind: "list",
          result: await this.parking.findAvailableSpaces({
            floors: source.floors,
            designation: source.designation,
            limit: LIST_LIMIT,
            page: 1,
          }),
        };
      case "plateSearch":
        return { kind: "list", result: await this.parking.searchLicensePlate(source.plate, { limit: LIST_LIMIT, page: 1 }) };
      case "staleFeeds":
        return {
          kind: "list",
          result: await this.parking.getStaleCameraFeeds({
            floors: source.floors,
            thresholdMinutes: source.thresholdMinutes,
            limit: LIST_LIMIT,
            page: 1,
          }),
        };
      case "statusDetail":
        return { kind: "detail", detail: await this.parking.getStatusDetail(source.status) };
    }
  }
}

/**
 * Identity of a query, ignoring the spec-local `id` and argument order, so
 * "floors 9, 7, 8" and "floors 7-9" from a data tool and a view hit one entry.
 */
export function snapshotKey(source: Source): string {
  switch (source.query) {
    case "overview":
      return "overview";
    case "availableSpaces":
      return `availableSpaces|${floorKey(source.floors)}|${source.designation?.trim().toLowerCase() ?? ""}`;
    case "plateSearch":
      return `plateSearch|${source.plate.replace(/[^a-z0-9]/gi, "").toUpperCase()}`;
    case "staleFeeds":
      return `staleFeeds|${floorKey(source.floors)}|${source.thresholdMinutes ?? ""}`;
    case "statusDetail":
      return `statusDetail|${source.status}`;
  }
}

function floorKey(floors: number[] | undefined): string {
  return floors ? [...new Set(floors)].sort((left, right) => left - right).join(",") : "";
}
