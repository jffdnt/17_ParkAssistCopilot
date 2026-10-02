import type { IStatusDetail, IStatusSpace } from '../services/ParkAssistService';
import { ALL_FLOORS, MAX_LISTED_SPACES, applyDrilldownFilters, buildDrilldownContext, formatDuration } from './drilldownModel';

function space(spaceNumber: string, overrides: Partial<IStatusSpace> = {}): IStatusSpace {
  return {
    bayId: `b${spaceNumber}`,
    spaceNumber,
    designation: 'General',
    reserved: false,
    feedState: 'fresh',
    imageUrl: `https://mcp.example/api/cameras/b${spaceNumber}?sig=secret`,
    ...overrides
  };
}

const occupied: IStatusDetail = {
  status: 'occupied',
  garage: '5 Bell',
  generatedAt: '2026-10-01T20:00:00.000Z',
  staleAfterMinutes: 15,
  total: 4,
  floors: [
    {
      floor: 1,
      configured: 10,
      spaces: [space('101', { parkedMinutes: 30, plateDisplay: 'ABC 123' }), space('102', { parkedMinutes: 800, designation: 'EV' })]
    },
    { floor: 2, configured: 10, spaces: [space('201', { parkedMinutes: 125 }), space('202', { parkedMinutes: 300 })] },
    { floor: 3, configured: 10, spaces: [] }
  ]
};

describe('drill-down filters', () => {
  it('scopes by floor, then type, then legend toggles', () => {
    const view = applyDrilldownFilters(occupied, { floor: 1, hidden: new Set(['12h']) });
    expect(view.visibleFloors.map((entry) => entry.spaces.map((item) => item.spaceNumber))).toEqual([['101']]);
    // Legend counts ignore the legend's own toggles, so a hidden category still shows its count.
    expect(view.categoryCounts.get('12h')).toBe(1);
    expect(view.designationCounts.get('EV')).toBe(1);

    const evOnly = applyDrilldownFilters(occupied, { floor: ALL_FLOORS, designation: 'EV', hidden: new Set() });
    expect(evOnly.shownCount).toBe(1);
  });
});

describe('drill-down model context', () => {
  it('keeps garage-wide counts while describing the filtered view', () => {
    const context = buildDrilldownContext(
      occupied,
      'Occupied',
      { floor: 2, hidden: new Set() },
      { space: occupied.floors[1].spaces[0], floor: 2 }
    );
    expect(context.text).toContain('Garage-wide, 4 spaces are occupied.');
    expect(context.text).toContain('floor 1 2/10, floor 2 2/10, floor 3 0/10');
    expect(context.text).toContain('By time parked: Under 1h 1, 1–4h 1, 4–12h 1, 12h+ 1.');
    expect(context.text).toContain('currently viewing floor 2 only: 2 spaces shown.');
    expect(context.text).toContain('All 2 shown spaces are listed:');
    expect(context.text).toContain('selected Space 201, floor 2, General, parked 2h 5m (bay b201)');
    expect(context.structured).toMatchObject({ total: 4, shownCount: 2, isCompleteList: true, filters: { floor: 2 } });
  });

  it('never hands the model signed camera URLs', () => {
    const context = buildDrilldownContext(occupied, 'Occupied', { floor: ALL_FLOORS, hidden: new Set() }, undefined);
    expect(JSON.stringify(context)).not.toContain('sig=');
  });

  it('includes occupied plates but omits them from every other status context', () => {
    const occupiedContext = buildDrilldownContext(occupied, 'Occupied', { floor: ALL_FLOORS, hidden: new Set() }, undefined);
    expect(occupiedContext.text).toContain('Space 101, floor 1, General, plate ABC 123, parked 30m');
    expect(occupiedContext.structured.listedSpaces).toContainEqual(
      expect.objectContaining({ spaceNumber: '101', plateDisplay: 'ABC 123' })
    );

    const available: IStatusDetail = { ...occupied, status: 'available' };
    const availableContext = buildDrilldownContext(available, 'Available', { floor: ALL_FLOORS, hidden: new Set() }, undefined);
    expect(JSON.stringify(availableContext)).not.toContain('ABC 123');
  });

  it('says when the space list is truncated', () => {
    const many = Array.from({ length: MAX_LISTED_SPACES + 5 }, (_, index) => space(String(1000 + index)));
    const available: IStatusDetail = { ...occupied, status: 'available', total: many.length, floors: [{ floor: 1, configured: 300, spaces: many }] };
    const context = buildDrilldownContext(available, 'Available', { floor: ALL_FLOORS, hidden: new Set() }, undefined);
    expect(context.text).toContain(`The first ${MAX_LISTED_SPACES} of the ${MAX_LISTED_SPACES + 5} shown spaces are listed`);
    expect(context.structured.isCompleteList).toBe(false);
  });
});

describe('formatDuration', () => {
  it('formats minutes, hours, and days compactly', () => {
    expect(formatDuration(45)).toBe('45m');
    expect(formatDuration(120)).toBe('2h');
    expect(formatDuration(190)).toBe('3h 10m');
    expect(formatDuration(3120)).toBe('2d 4h');
  });
});
