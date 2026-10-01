import { describeFloors, parseFloors } from './floors';

describe('Copilot floor scope parsing', () => {
  it('expands a range into every floor it covers', () => {
    expect(parseFloors('7-9')).toEqual([7, 8, 9]);
    expect(parseFloors('7 to 9')).toEqual([7, 8, 9]);
    expect(parseFloors('7 through 9')).toEqual([7, 8, 9]);
    expect(parseFloors('7–9')).toEqual([7, 8, 9]);
  });

  it('reads a list, a single floor, and a mix of both', () => {
    expect(parseFloors('2,5,9')).toEqual([2, 5, 9]);
    expect(parseFloors('7')).toEqual([7]);
    expect(parseFloors('2, 7-9')).toEqual([2, 7, 8, 9]);
  });

  it('normalizes order, duplicates, and a reversed range', () => {
    expect(parseFloors('9-7')).toEqual([7, 8, 9]);
    expect(parseFloors('9,7,9,8')).toEqual([7, 8, 9]);
  });

  it('returns undefined for an absent or unusable scope', () => {
    expect(parseFloors(undefined)).toBeUndefined();
    expect(parseFloors('')).toBeUndefined();
    expect(parseFloors('all floors')).toBeUndefined();
  });

  it('phrases a scope the way it was asked for', () => {
    expect(describeFloors([7, 8, 9])).toBe('floors 7–9');
    expect(describeFloors([7])).toBe('floor 7');
    expect(describeFloors([2, 5, 9])).toBe('floors 2, 5 and 9');
    expect(describeFloors(undefined)).toBe('all floors');
  });
});
