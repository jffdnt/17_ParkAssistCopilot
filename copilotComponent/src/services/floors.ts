/** Appends a floor if it is not already present. */
function addFloor(floors: number[], floor: number): void {
  if (floors.indexOf(floor) === -1) {
    floors.push(floor);
  }
}

/** Ascending, duplicate-free copy of a floor list. */
function normalize(floors: number[]): number[] {
  return floors
    .filter((floor, index) => floors.indexOf(floor) === index)
    .sort((left, right) => left - right);
}

/**
 * Parses the floor scope Copilot fills in. Accepts a list ("7,8,9"), a range
 * ("7-9", "7 to 9"), a single floor ("7"), or a mix ("2, 7-9").
 *
 * The tool parameter is a string rather than an integer array deliberately.
 * This host is documented to strip schema keywords it does not support, and a
 * dropped parameter silently widens the query to the whole garage — which is
 * the exact failure this parsing exists to fix. Plain string parameters are
 * known to survive the pipeline, so the range is expanded here instead.
 */
export function parseFloors(value: string | undefined): number[] | undefined {
  if (!value) {
    return undefined;
  }

  const floors: number[] = [];
  value.split(',').forEach((part) => {
    const range = /^\s*(\d{1,2})\s*(?:-|–|—|to|through|thru)\s*(\d{1,2})\s*$/i.exec(part);
    if (range) {
      const from = Number(range[1]);
      const to = Number(range[2]);
      for (let floor = Math.min(from, to); floor <= Math.max(from, to); floor += 1) {
        addFloor(floors, floor);
      }
      return;
    }
    const single = Number.parseInt(part.trim(), 10);
    if (Number.isFinite(single)) {
      addFloor(floors, single);
    }
  });

  return floors.length > 0 ? normalize(floors) : undefined;
}

/**
 * Human phrasing for a floor scope, so a card reads back the scope the way it
 * was asked for: "floors 7-9" rather than "floor 7".
 *
 * The server produces the same wording inside the authoritative answer
 * sentence (`result.summary`), which is what the card and the model both
 * quote. This copy covers the states where there is no result to quote yet —
 * loading and lookup failures — since the SPFx bundle cannot import from the
 * server build.
 */
export function describeFloors(floors: number[] | undefined): string {
  if (!floors || floors.length === 0) {
    return 'all floors';
  }
  if (floors.length === 1) {
    return `floor ${floors[0]}`;
  }

  const sorted = normalize(floors);
  const contiguous = sorted.every((floor, index) => index === 0 || floor === sorted[index - 1] + 1);
  if (contiguous) {
    return `floors ${sorted[0]}–${sorted[sorted.length - 1]}`;
  }
  return `floors ${sorted.slice(0, -1).join(', ')} and ${sorted[sorted.length - 1]}`;
}
