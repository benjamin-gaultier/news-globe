import { describe, expect, it } from 'vitest';
import type { ArchiveDay, ArchiveStory } from '@news-globe/shared';
import { entriesAt, runTimes, shiftDate, storiesAt } from '../src/lib/history';

const story = (unit: string, title: string, peakOutlets: number): ArchiveStory => ({
  unit,
  title,
  url: `https://example.com/${encodeURIComponent(title)}`,
  sources: ['a'],
  articleIds: [title],
  firstSeen: '2026-10-08T08:00:00.000Z',
  lastSeen: '2026-10-08T09:00:00.000Z',
  bestRank: 1,
  peakOutlets,
});

const day: ArchiveDay = {
  schemaVersion: 1,
  date: '2026-10-08',
  stories: [story('FR', 'Budget', 4), story('FR', 'Grève', 1), story('FR-BRE', 'Brest', 2), story('XX', 'Nowhere', 9)],
  runs: {
    '2026-10-08T09:00:00.000Z': { FR: [1, 0], 'FR-BRE': [2], XX: [3] },
    '2026-10-08T08:00:00.000Z': { FR: [0, 1], 'FR-BRE': [] },
  },
};

describe('history', () => {
  it('lists run times oldest first', () => {
    expect(runTimes(day)).toEqual(['2026-10-08T08:00:00.000Z', '2026-10-08T09:00:00.000Z']);
  });

  it('builds the globe’s index lines for one run, skipping unknown codes', () => {
    const at9 = entriesAt(day, '2026-10-08T09:00:00.000Z');
    expect([...at9.keys()]).toEqual(['FR', 'FR-BRE']);
    expect(at9.get('FR')).toMatchObject({ name: 'France', topTitle: 'Grève', topOutlets: 1, clusterCount: 2 });
    const at8 = entriesAt(day, '2026-10-08T08:00:00.000Z');
    expect(at8.get('FR')).toMatchObject({ topTitle: 'Budget', topOutlets: 4 });
    expect(at8.get('FR-BRE')).toEqual({ code: 'FR-BRE', name: 'Brittany', updatedAt: '2026-10-08T08:00:00.000Z', clusterCount: 0 });
  });

  it('lists a unit’s stories in rank order', () => {
    expect(storiesAt(day, '2026-10-08T09:00:00.000Z', 'FR').map((s) => s.title)).toEqual(['Grève', 'Budget']);
    expect(storiesAt(day, '2026-10-08T09:00:00.000Z', 'DE')).toEqual([]);
    expect(storiesAt(day, 'never', 'FR')).toEqual([]);
  });

  it('shifts dates across months and years', () => {
    expect(shiftDate('2026-10-01', -1)).toBe('2026-09-30');
    expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01');
  });
});
