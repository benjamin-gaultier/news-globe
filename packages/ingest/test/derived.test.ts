import { describe, expect, it } from 'vitest';
import type { Article, ClusterTrend, StoryCluster, TrendsFile } from '@news-globe/shared';
import { addRun } from '../src/archive';
import { buildSearch, buildToday, buildTrends } from '../src/derived';
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
    const day = dayOf([
      [8, at8],
      [9, at9],
      [10, at10],
    ]);
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
    const search = buildSearch(T(10), [
      { code: 'FR', clusters: ranked('budget', 'strike') },
      { code: 'FR-BRE', clusters: ranked('storm') },
    ]);
    expect(search.items).toEqual([
      ['FR', 'budget', 1],
      ['FR', 'strike', 1],
      ['FR-BRE', 'storm', 1],
    ]);
  });
});

describe('buildToday', () => {
  const runAt = T(14);
  const story = (code: string, title: string, outlets: number): StoryCluster => ({
    ...cluster(article(`outlet-${code}-${title}`, title, T(13))),
    outletCount24h: outlets,
  });
  const trendsOf = (units: Record<string, Record<string, Partial<ClusterTrend>>>): TrendsFile => ({
    schemaVersion: 1,
    runAt,
    runs: [T(13), runAt],
    units: Object.fromEntries(
      Object.entries(units).map(([u, ts]) => [
        u,
        Object.fromEntries(Object.entries(ts).map(([id, t]) => [id, { ranks: [null, 1], firstSeen: runAt, state: null, ...t }])),
      ]),
    ),
    change: {},
  });

  it('lists the most widely covered national stories, at most two per country', () => {
    const fr = [story('FR', 'a', 9), story('FR', 'b', 8), story('FR', 'c', 7)];
    const us = [story('US', 'd', 5)];
    const bre = [story('FR-BRE', 'regional', 20)];
    const today = buildToday(trendsOf({}), [
      { code: 'FR', clusters: fr },
      { code: 'US', clusters: us },
      { code: 'FR-BRE', clusters: bre },
    ]);
    expect(today.top.map((s) => s.title)).toEqual(['a', 'b', 'd']);
    expect(today.top[0]).toMatchObject({ unit: 'FR', clusterId: fr[0]!.id, rank: 1, outlets: 9, firstSeen: runAt, state: null });
    expect(today).toMatchObject({ runAt, countries: 2, stories: 4 });
  });

  it('ranks stories by the share of their country’s press, not by outlets', () => {
    // NL has 8 outlets and LT 3: 4 of NL's is a smaller share than 3 of LT's.
    const pools = new Map([
      ['NL', 8],
      ['LT', 3],
    ]);
    const today = buildToday(
      trendsOf({}),
      [
        { code: 'NL', clusters: [story('NL', 'nl', 4)] },
        { code: 'LT', clusters: [story('LT', 'lt', 3)] },
      ],
      pools,
    );
    expect(today.top.map((s) => [s.title, s.outlets, s.coverage])).toEqual([
      ['lt', 3, 0.667],
      ['nl', 4, 0.375],
    ]);
  });

  it('breaks equal shares by rank before outlets', () => {
    const pools = new Map([
      ['NL', 8],
      ['LT', 2],
    ]);
    // 2 of 2 and 5 of 8 are both 0.5; NL's is its #2 story, LT's its #1.
    const today = buildToday(
      trendsOf({}),
      [
        { code: 'NL', clusters: [story('NL', 'nl1', 6), story('NL', 'nl2', 5)] },
        { code: 'LT', clusters: [story('LT', 'lt', 2)] },
      ],
      pools,
    );
    expect(today.top.map((s) => s.title)).toEqual(['nl1', 'lt', 'nl2']);
  });

  it('lists new and rising stories not already on top, and stories ranked high all day', () => {
    const fr = [story('FR', 'top', 9), story('FR', 'second', 8), story('FR', 'rising', 2)];
    const de = [story('DE', 'big', 10), story('DE', 'bigger', 9), story('DE', 'since morning', 3), story('DE', 'new', 1)];
    const trends = trendsOf({
      FR: { [fr[0]!.id]: { state: 'rising' }, [fr[2]!.id]: { state: 'rising' } },
      DE: { [de[2]!.id]: { firstSeen: T(6) }, [de[3]!.id]: { state: 'new' } },
    });
    const today = buildToday(trends, [
      { code: 'FR', clusters: fr },
      { code: 'DE', clusters: de },
    ]);
    // "top" (already in the top list) stays out of Rising.
    expect(today.rising.map((s) => s.title)).toEqual(['rising', 'new']);
    expect(today.rising.map((s) => s.state)).toEqual(['rising', 'new']);
    // #3 since 06:00, 8 h before the run: lasting. The others came in at 14:00 (or rank lower).
    expect(today.lasting.map((s) => s.title)).toEqual(['since morning']);
  });
});
