import { describe, expect, it } from 'vitest';
import type { Article } from '@news-globe/shared';
import { buildCluster, coverage, pickRepresentative, rankClusters } from '../src/rank';
import { article } from './helpers';

const NOW = Date.parse('2026-10-06T12:00:00.000Z');
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();
const AUTHORITY: Record<string, number> = { lemonde: 10, franceinfo: 9, lefigaro: 8, liberation: 7, ouestfrance: 6 };
const authorityOf = (id: string) => AUTHORITY[id] ?? 0;
const build = (...arts: Article[]) => buildCluster(arts, authorityOf, NOW, 24);

describe('pickRepresentative', () => {
  it('prefers the highest-authority outlet', () => {
    const figaro = article('lefigaro', 'x', hoursAgo(5));
    const monde = article('lemonde', 'x', hoursAgo(1));
    expect(pickRepresentative([figaro, monde], authorityOf)).toBe(monde);
  });

  it('breaks authority ties with the earliest article', () => {
    const later = article('lemonde', 'x', hoursAgo(1));
    const earlier = article('lemonde', 'x', hoursAgo(3));
    expect(pickRepresentative([later, earlier], authorityOf)).toBe(earlier);
  });
});

describe('buildCluster', () => {
  it('keeps one related article per other outlet, most recent first', () => {
    const rep = article('lemonde', 'x', hoursAgo(2));
    const fi1 = article('franceinfo', 'x', hoursAgo(4));
    const fi2 = article('franceinfo', 'x', hoursAgo(1));
    const lib = article('liberation', 'x', hoursAgo(3));
    const c = build(fi1, rep, fi2, lib);
    expect(c.representative).toBe(rep);
    expect(c.related).toEqual([fi2, lib]);
    expect(c.outletCount).toBe(3);
    expect(c.latestPublishedAt).toBe(hoursAgo(1));
  });

  it('only counts outlets inside the 24h window for ranking', () => {
    const c = build(article('lemonde', 'x', hoursAgo(2)), article('lefigaro', 'x', hoursAgo(30)));
    expect(c.outletCount).toBe(2);
    expect(c.outletCount24h).toBe(1);
  });
});

describe('rankClusters', () => {
  it('orders by distinct outlets in 24h, then by recency', () => {
    const threeOutlets = build(
      article('lemonde', 'a', hoursAgo(10)),
      article('lefigaro', 'a', hoursAgo(9)),
      article('liberation', 'a', hoursAgo(8)),
    );
    const twoRecent = build(article('lemonde', 'b', hoursAgo(1)), article('ouestfrance', 'b', hoursAgo(2)));
    const twoOlder = build(article('franceinfo', 'c', hoursAgo(5)), article('lefigaro', 'c', hoursAgo(6)));
    const oneFresh = build(article('lemonde', 'd', hoursAgo(0.1)));
    // Many outlets, but all outside the window: counts as zero.
    const stale = build(
      article('lemonde', 'e', hoursAgo(30)),
      article('lefigaro', 'e', hoursAgo(31)),
      article('liberation', 'e', hoursAgo(32)),
    );

    const ranked = rankClusters([oneFresh, stale, twoOlder, threeOutlets, twoRecent], 10);
    expect(ranked.map((c) => c.representative.title)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('caps single-outlet stories per outlet, then backfills', () => {
    const burst = Array.from({ length: 5 }, (_, i) => build(article('tvvendee', `v${i}`, hoursAgo(0.1 * (i + 1)))));
    const shared = build(article('france3', 's', hoursAgo(9)), article('ici', 's', hoursAgo(8)));
    const others = [build(article('france3', 'f', hoursAgo(3))), build(article('ici', 'i', hoursAgo(4)))];
    const ranked = rankClusters([...burst, shared, ...others], 6, 2);
    expect(ranked.map((c) => c.representative.title)).toEqual(['s', 'v0', 'v1', 'f', 'i', 'v2']);
  });

  it('keeps at most `limit` clusters', () => {
    const clusters = Array.from({ length: 20 }, (_, i) => build(article('lemonde', `t${i}`, hoursAgo(i))));
    expect(rankClusters(clusters, 15)).toHaveLength(15);
  });
});

describe('coverage', () => {
  it('is the share of the country’s other outlets on the story, with a small pool pulled down', () => {
    expect(coverage(2, 2)).toBeCloseTo(0.667, 3);
    expect(coverage(8, 8)).toBeCloseTo(0.933, 3);
    expect(coverage(4, 8)).toBe(0.4);
    expect(coverage(3, 4)).toBeCloseTo(0.571, 3);
    expect(coverage(4, 8, 1)).toBe(0.375);
  });

  it('lets a small country’s story outrank a bigger country’s when more of its press carries it', () => {
    // Raw outlets would put 4 of 8 first; 3 of 3 is the whole of that country's press.
    expect(coverage(3, 3)).toBeGreaterThan(coverage(4, 8));
  });

  it('scores a single outlet 0, whatever the pool', () => {
    expect(coverage(1, 1)).toBe(0);
    expect(coverage(1, 8)).toBe(0);
    expect(coverage(0, 5)).toBe(0);
  });

  it('widens a pool smaller than the outlets counted', () => {
    expect(coverage(5, 3)).toBe(coverage(5, 5));
  });
});
