import { describeFloors, parseFloors } from './floors';

describe('Copilot floor scope parsing', () => {
  it('expands ranges, lists, and reversed bounds', () => {
    expect(parseFloors('7-9')).toEqual([7, 8, 9]);
    expect(parseFloors('9 through 7, 2')).toEqual([2, 7, 8, 9]);
  });

  it('describes contiguous and non-contiguous scopes', () => {
    expect(describeFloors([7, 8, 9])).toBe('floors 7–9');
    expect(describeFloors([2, 5, 9])).toBe('floors 2, 5 and 9');
  });
});
