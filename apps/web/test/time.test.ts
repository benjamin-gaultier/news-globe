import { describe, expect, it } from 'vitest';
import { relativeTime } from '../src/lib/time';

const NOW = Date.parse('2026-10-08T12:00:00Z');
const ago = (s: number) => new Date(NOW - s * 1000).toISOString();

describe('relativeTime', () => {
  it.each([
    [0, 'just now'],
    [59, 'just now'],
    [-30, 'just now'],
    [60, '1 minute ago'],
    [5 * 60, '5 minutes ago'],
    [3_600, '1 hour ago'],
    [3 * 3_600 + 20 * 60, '3 hours ago'],
    [86_400, 'yesterday'],
    [3 * 86_400, '3 days ago'],
    [-2 * 3_600, 'in 2 hours'],
  ])('%is ago → %s', (seconds, expected) => {
    expect(relativeTime(ago(seconds), NOW)).toBe(expected);
  });

  it('is empty for an unparseable date', () => {
    expect(relativeTime('not a date', NOW)).toBe('');
  });
});
