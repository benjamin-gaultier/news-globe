import { describe, expect, it } from 'vitest';
import type { Article, StoryCluster } from '@news-globe/shared';
import { addRun } from '../src/archive';
import { buildSearch, buildTrends } from '../src/derived';
import { buildCluster } from '../src/rank';
import { article } from './helpers';

const T = (h: number) => `2026-10-08T${String(h).padStart(2, '0')}:00:00.000Z`;
const cluster = (...arts: Article[]): StoryCluster => buildCluster(arts, () => 0, Date.parse(T(12)), 24);

// One article per story, reused across runs so the archive recognises it.
const stories = Object.fromEntries(
  ['budget', 'strike', 'storm', 'trial', 'election', 'match', 'fire'].map((k) => [k, article(`outlet-${k}`, k, T(8))]),
);
const ranked = (...keys: string[]) => keys.map((k) => cluster(stories[k]!));

function dayOf(runs: [number, StoryCluster[]][]) {
  let day = null as Parameters<typeof addRun>[0];
  for (const [h, clusters] of runs) day = addRun(day, { runAt: T(h), units: [{ code: 'FR', clusters }] });
  return day!;
}

describe('buildTrends', () => {
  it('gives each story its rank history and marks new and rising ones', () => {
    const at8 = ranked('budget', 'strike', 'storm', 'trial', 'election');
    const at9 = ranked('budget', 'strike', 'storm', 'trial', 'election');
    const at10 = ranked('election', 'fire', 'budget', 'strike');
    const day = dayOf([[8, at8], [9, at9], [10, at10]]);
    const trends = buildTrends(day, T(10), [{ code: 'FR', clusters: at10 }]);

    expect(trends.runs).toEqual([T(8), T(9), T(10)]);
    const fr = trends.units.FR!;
    expect(fr[at10[0]!.id]).toEqual({ ranks: [5, 5, 1], firstSeen: T(8), state: 'rising' });
    expect(fr[at10[1]!.id]).toEqual({ ranks: [null, null, 2], firstSeen: T(10), state: 'new' });
    expect(fr[at10[2]!.id]).toMatchObject({ ranks: [1, 1, 3], state: null });
    expect(trends.change.FR).toBe(2);
  });

  it('shows no badges on the day’s first run', () => {
    const at0 = ranked('budget', 'strike');
    const trends = buildTrends(dayOf([[0, at0]]), T(0), [{ code: 'FR', clusters: at0 }]);
    expect(Object.values(trends.units.FR!).map((t) => t.state)).toEqual([null, null]);
    expect(trends.change.FR).toBe(0);
  });

  it('keeps only the last runs of the day', () => {
    const runs: [number, StoryCluster[]][] = Array.from({ length: 15 }, (_, h) => [h, ranked('budget')]);
    const trends = buildTrends(dayOf(runs), T(14), [{ code: 'FR', clusters: runs[14]![1] }]);
    expect(trends.runs).toHaveLength(12);
    expect(trends.runs[0]).toBe(T(3));
  });
});

describe('buildSearch', () => {
  it('lists every ranked headline with its unit and outlets', () => {
    const search = buildSearch(T(10), [{ code: 'FR', clusters: ranked('budget', 'strike') }, { code: 'FR-BRE', clusters: ranked('storm') }]);
    expect(search.items).toEqual([
      ['FR', 'budget', 1],
      ['FR', 'strike', 1],
      ['FR-BRE', 'storm', 1],
    ]);
  });
});
