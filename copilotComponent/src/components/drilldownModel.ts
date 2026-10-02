import type { GarageStatus, IStatusDetail, IStatusSpace } from '../services/ParkAssistService';

/**
 * Everything about a status drill-down that is not React: how spaces are
 * categorised, how the user's filters apply, and what Copilot is told about
 * the view. Shared by StatusDrilldown (what is drawn) and the model context
 * (what is said), so the card and Copilot can never describe different views.
 */

export type Tone = 'success' | 'brand' | 'teal' | 'marigold' | 'warning' | 'danger';

/** A legend entry: one way a tile in this drill-down can be coloured. */
export interface ICategory {
  key: string;
  label: string;
  tone: Tone;
}

/** `IDrilldownFilters.floor` value for "every floor". */
export const ALL_FLOORS: number = 0;

/**
 * Most spaces named in model context. Complete totals stay in the context, but
 * a short illustrative list keeps browser-hosted context updates within the
 * Copilot bridge payload limit.
 */
export const MAX_LISTED_SPACES: number = 12;

/**
 * How each status is broken down visually. Every space falls in exactly one
 * category, so the legend counts always add up to the total.
 */
export function categoriesFor(status: GarageStatus): ICategory[] {
  switch (status) {
    case 'available':
      return [{ key: 'available', label: 'Ready to park', tone: 'success' }];
    case 'occupied':
      return [
        { key: 'lt1h', label: 'Under 1h', tone: 'teal' },
        { key: '1to4h', label: '1–4h', tone: 'brand' },
        { key: '4to12h', label: '4–12h', tone: 'marigold' },
        { key: '12h', label: '12h+', tone: 'warning' },
        { key: 'unknown', label: 'Entry time unknown', tone: 'brand' }
      ];
    case 'stale-or-missing':
      return [
        { key: 'stale', label: 'Stale feed', tone: 'warning' },
        { key: 'missing', label: 'No telemetry', tone: 'danger' }
      ];
    case 'out-of-service':
      return [{ key: 'out-of-service', label: 'Out of service', tone: 'danger' }];
  }
}

export function categoryOf(status: GarageStatus, space: IStatusSpace): string {
  switch (status) {
    case 'available':
      return 'available';
    case 'occupied': {
      const minutes = space.parkedMinutes;
      if (minutes === undefined) return 'unknown';
      if (minutes < 60) return 'lt1h';
      if (minutes < 240) return '1to4h';
      if (minutes < 720) return '4to12h';
      return '12h';
    }
    case 'stale-or-missing':
      return space.feedState === 'missing' ? 'missing' : 'stale';
    case 'out-of-service':
      return 'out-of-service';
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

/** The short second line on a tile: what an operator scans for in this view. */
export function tileNote(status: GarageStatus, space: IStatusSpace): string {
  switch (status) {
    case 'occupied':
      return space.parkedMinutes === undefined ? '—' : formatDuration(space.parkedMinutes);
    case 'stale-or-missing':
      return space.feedState === 'missing' || space.thumbnailAgeMinutes === undefined
        ? 'none'
        : formatDuration(space.thumbnailAgeMinutes);
    case 'out-of-service':
      return space.health?.issueType ?? space.designation;
    default:
      return space.designation;
  }
}

function feedText(space: IStatusSpace): string {
  return space.feedState === 'missing' || space.thumbnailAgeMinutes === undefined
    ? 'no camera telemetry'
    : `camera ${formatDuration(space.thumbnailAgeMinutes)} old`;
}

/** One-line description of a space, used for tile tooltips and the model context. */
export function describeSpace(status: GarageStatus, space: IStatusSpace, floor: number): string {
  const parts = [`Space ${space.spaceNumber}`, `floor ${floor}`, space.designation];
  if (status === 'occupied' && space.plateDisplay) parts.push(`plate ${space.plateDisplay}`);
  if (status === 'occupied' && space.parkedMinutes !== undefined) {
    parts.push(`parked ${formatDuration(space.parkedMinutes)}`);
  }
  if (status === 'stale-or-missing') parts.push(feedText(space));
  if (space.reserved) parts.push('reserved');
  if (space.health?.issueType) parts.push(space.health.issueType);
  return parts.join(', ');
}

/** The user's choices on top of a drill-down. */
export interface IDrilldownFilters {
  /** A floor number, or ALL_FLOORS. */
  floor: number;
  designation?: string;
  /** Category keys the user has toggled off in the legend. */
  hidden: ReadonlySet<string>;
}

export interface IDrilldownSelection {
  space: IStatusSpace;
  floor: number;
}

export interface IFilteredDrilldown {
  /** Space types in the floor scope, before the type filter, for the type chips. */
  designationCounts: Map<string, number>;
  /** Categories after floor and type filters, before legend toggles, for the legend. */
  categoryCounts: Map<string, number>;
  /** What is drawn: floors with at least one space left after every filter. */
  visibleFloors: { floor: number; spaces: IStatusSpace[] }[];
  shownCount: number;
}

/** Applies the filters in a fixed order: floor scope → space type → legend toggles. */
export function applyDrilldownFilters(detail: IStatusDetail, filters: IDrilldownFilters): IFilteredDrilldown {
  const { floor, designation, hidden } = filters;
  const inScope = detail.floors.filter((entry) => floor === ALL_FLOORS || entry.floor === floor);
  const matchesType = (space: IStatusSpace): boolean =>
    designation === undefined || space.designation === designation;

  const designationCounts = new Map<string, number>();
  const categoryCounts = new Map<string, number>();
  inScope.forEach((entry) =>
    entry.spaces.forEach((space) => {
      designationCounts.set(space.designation, (designationCounts.get(space.designation) ?? 0) + 1);
      if (matchesType(space)) {
        const key = categoryOf(detail.status, space);
        categoryCounts.set(key, (categoryCounts.get(key) ?? 0) + 1);
      }
    })
  );

  const visibleFloors = inScope
    .map((entry) => ({
      floor: entry.floor,
      spaces: entry.spaces.filter((space) => matchesType(space) && !hidden.has(categoryOf(detail.status, space)))
    }))
    .filter((entry) => entry.spaces.length > 0);

  return {
    designationCounts,
    categoryCounts,
    visibleFloors,
    shownCount: visibleFloors.reduce((sum, entry) => sum + entry.spaces.length, 0)
  };
}

/** The drill-down's contribution to the component's model context. */
export interface IDrilldownContext {
  text: string;
  structured: Record<string, unknown>;
}

function countsText(entries: [string, number][]): string {
  return entries.map(([name, count]) => `${name} ${count}`).join(', ');
}

/**
 * What Copilot is told about the drill-down on screen. Garage-wide counts by
 * floor, category, and type always cover the whole status, so questions such as
 * "which floor has the most?" can be answered whatever the user has filtered
 * to. The space list follows the current filters and says outright when it is
 * truncated, because a model otherwise reads a partial list as the total.
 * Signed camera URLs are left out: they are short-lived and not for the model.
 */
export function buildDrilldownContext(
  detail: IStatusDetail,
  label: string,
  filters: IDrilldownFilters,
  selected: IDrilldownSelection | undefined
): IDrilldownContext {
  const status = detail.status;
  const name = label.toLowerCase();
  const categories = categoriesFor(status);
  const all = applyDrilldownFilters(detail, { floor: ALL_FLOORS, hidden: new Set() });
  const view = applyDrilldownFilters(detail, filters);

  const floorCounts = detail.floors.map((entry) => ({
    floor: entry.floor,
    count: entry.spaces.length,
    configured: entry.configured
  }));
  const categoryTotals = categories
    .map((category): [string, number] => [category.label, all.categoryCounts.get(category.key) ?? 0])
    .filter(([, count]) => count > 0);
  const typeTotals = Array.from(all.designationCounts.entries()).sort((left, right) => right[1] - left[1]);
  const hiddenLabels = categories.filter((category) => filters.hidden.has(category.key)).map((category) => category.label);

  const shown = view.visibleFloors.reduce<{ floor: number; space: IStatusSpace }[]>(
    (list, entry) => list.concat(entry.spaces.map((space) => ({ floor: entry.floor, space }))),
    []
  );
  const listed = shown.slice(0, MAX_LISTED_SPACES);
  const isCompleteList = listed.length === shown.length;

  const scope: string[] = [filters.floor === ALL_FLOORS ? 'all floors' : `floor ${filters.floor} only`];
  if (filters.designation) scope.push(`${filters.designation} spaces only`);
  if (hiddenLabels.length > 0) scope.push(`hiding ${hiddenLabels.join(', ')}`);

  const lines = [
    `The user has opened the "${label}" drill-down on the ParkAssist ${detail.garage} dashboard ` +
      `(live data as of ${detail.generatedAt}` +
      (status === 'stale-or-missing' ? `; a feed is stale after ${detail.staleAfterMinutes} minutes` : '') +
      ').',
    `Garage-wide, ${detail.total} spaces are ${name}.`,
    `By floor (${name} / configured): ` +
      floorCounts.map((entry) => `floor ${entry.floor} ${entry.count}/${entry.configured}`).join(', ') +
      '.'
  ];
  if (categories.length > 1 && categoryTotals.length > 0) {
    lines.push(`By ${status === 'occupied' ? 'time parked' : 'feed state'}: ${countsText(categoryTotals)}.`);
  }
  if (typeTotals.length > 0) lines.push(`By space type: ${countsText(typeTotals)}.`);
  lines.push(`The user is currently viewing ${scope.join('; ')}: ${view.shownCount} spaces shown.`);
  if (shown.length > 0) {
    lines.push(
      (isCompleteList
        ? `All ${shown.length} shown spaces are listed:`
        : `The first ${listed.length} of the ${shown.length} shown spaces are listed; the rest are not in this context:`) +
        '\n' +
        listed.map((entry) => `- ${describeSpace(status, entry.space, entry.floor)}`).join('\n')
    );
  }
  if (selected) {
    lines.push(
      `The user has selected ${describeSpace(status, selected.space, selected.floor)} (bay ${selected.space.bayId}); ` +
        `its camera preview is on screen.`
    );
  }
  lines.push(
    status === 'occupied'
      ? 'Answer questions about what the user is looking at from these facts. The listed and selected occupied spaces may include full license plates. Do not call another tool unless the user asks for data these facts do not cover.'
      : 'Answer questions about what the user is looking at from these facts. Do not call another tool unless the user asks for data these facts do not cover. License plates are not part of this view.'
  );

  return {
    text: lines.join('\n'),
    structured: {
      status,
      label,
      generatedAt: detail.generatedAt,
      staleAfterMinutes: detail.staleAfterMinutes,
      total: detail.total,
      floors: floorCounts,
      categories: categoryTotals.map(([category, count]) => ({ category, count })),
      spaceTypes: typeTotals.map(([type, count]) => ({ type, count })),
      filters: {
        floor: filters.floor === ALL_FLOORS ? 'all' : filters.floor,
        spaceType: filters.designation ?? 'all',
        hiddenCategories: hiddenLabels
      },
      shownCount: view.shownCount,
      isCompleteList,
      listedSpaces: listed.map((entry) => ({
        spaceNumber: entry.space.spaceNumber,
        bayId: entry.space.bayId,
        floor: entry.floor,
        spaceType: entry.space.designation,
        category: categoryOf(status, entry.space),
        plateDisplay: status === 'occupied' ? entry.space.plateDisplay : undefined,
        reserved: entry.space.reserved,
        parkedMinutes: entry.space.parkedMinutes,
        feedState: entry.space.feedState,
        thumbnailAgeMinutes: entry.space.thumbnailAgeMinutes,
        healthIssue: entry.space.health?.issueType
      })),
      selectedSpace: selected
        ? {
            spaceNumber: selected.space.spaceNumber,
            bayId: selected.space.bayId,
            floor: selected.floor,
            plateDisplay: status === 'occupied' ? selected.space.plateDisplay : undefined
          }
        : undefined
    }
  };
}
