import { describe, expect, it } from 'vitest';
import type { TodayStory, WorldStory } from '@news-globe/shared';
import { notIn, topStories } from '../src/lib/briefing';

const national = (unit: string, clusterId: string, outlets: number): TodayStory => ({
  unit,
  clusterId,
  title: `${unit} ${clusterId}`,
  url: `https://example.com/${clusterId}`,
  source: 'Outlet',
  language: 'en',
  imageUrl: null,
  outlets,
  rank: 1,
  firstSeen: '2026-10-08T08:00:00Z',
  state: null,
});

/** A cross-border story: each country's cluster id and outlets, as `code/clusterId outlets`. */
const across = (id: string, ...countries: string[]): WorldStory => ({
  id,
  names: [],
  countries: countries.map((c) => {
    const [code, clusterId, outlets] = c.split(/[/ ]/) as [string, string, string];
    return { code, clusterId, title: id, url: 'https://example.com', outletCount24h: Number(outlets) };
  }),
  latestPublishedAt: '2026-10-08T08:00:00Z',
});

describe('topStories', () => {
  it('ranks national and cross-border stories together by outlets across their countries, then by countries', () => {
    const top = topStories(
      [national('DE', 'd1', 6), national('GB', 'g1', 3)],
      [across('w1', 'GR/gr1 7', 'CY/cy1 3'), across('w2', 'NO/no1 2', 'DK/dk1 1')],
    );
    expect(top.map((b) => [b.key, b.outlets])).toEqual([
      ['w1', 10],
      ['DE/d1', 6],
      ['w2', 3],
      ['GB/g1', 3],
    ]);
  });

  it('ranks by coverage, each country’s share of its own press, when the files have it', () => {
    const nl = { ...national('NL', 'n1', 4), coverage: 0.375 };
    const lt = { ...national('LT', 'l1', 3), coverage: 0.667 };
    const w = across('w1', 'NO/no1 2', 'DK/dk1 2');
    w.countries = w.countries.map((c) => ({ ...c, coverage: 0.25 }));
    const top = topStories([nl, lt], [w]);
    // w1: 0.25 in each of its two countries, plus 0.25 for the second country.
    expect(top.map((b) => [b.key, b.coverage])).toEqual([
      ['w1', 0.75],
      ['LT/l1', 0.667],
      ['NL/n1', 0.375],
    ]);
  });

  it('falls back to outlets when any story lacks coverage', () => {
    const top = topStories([{ ...national('LT', 'l1', 3), coverage: 0.667 }, national('NL', 'n1', 4)], []);
    expect(top.map((b) => b.key)).toEqual(['NL/n1', 'LT/l1']);
  });

  it('folds a national story into the cross-border story it belongs to', () => {
    const fr = { ...national('FR', 'f1', 5), imageUrl: 'https://example.com/f1.jpg', state: 'rising' as const };
    const top = topStories([fr], [across('w1', 'BE/b1 2', 'FR/f1 5')]);
    expect(top).toHaveLength(1);
    expect(top[0]).toMatchObject({ key: 'w1', outlets: 7, imageUrl: fr.imageUrl, state: 'rising' });
    expect(top[0]!.countries.map((c) => c.code)).toEqual(['BE', 'FR']);
  });

  it('leaves out countries the app doesn’t know', () => {
    const top = topStories([], [across('w1', 'ZZ/z1 4', 'FR/f1 1'), across('w2', 'ZZ/z2 9')]);
    expect(top.map((b) => [b.key, b.countries.map((c) => c.code), b.outlets])).toEqual([['w1', ['FR'], 1]]);
  });
});

describe('notIn', () => {
  it('keeps only the stories not already in the briefing', () => {
    const top = topStories([national('DE', 'd1', 6)], [across('w1', 'FR/f1 2', 'BE/b1 1')]);
    const later = [national('DE', 'd1', 6), national('FR', 'f1', 2), national('FR', 'f2', 2)];
    expect(notIn(top, later).map((s) => s.clusterId)).toEqual(['f2']);
  });
});
