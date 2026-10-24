import { describe, expect, it } from 'vitest';
import { CATEGORIES, feedUrlsOf, outletPools, SOURCES, type SourceConfig } from '../src/sources.config';

const duplicates = (values: string[]) => [...new Set(values.filter((v, i) => values.indexOf(v) !== i))];

describe('SOURCES', () => {
  it('has unique ids', () => {
    expect(duplicates(SOURCES.map((s) => s.id))).toEqual([]);
  });

  it('polls each feed once', () => {
    // A feed shared by two sources gets one cache entry: the second poll is throttled
    // and its stories count for both units.
    expect(duplicates(SOURCES.flatMap((s) => feedUrlsOf(s, CATEGORIES)))).toEqual([]);
  });

  it('gives each source a feed', () => {
    expect(SOURCES.filter((s) => feedUrlsOf(s, CATEGORIES).length === 0).map((s) => s.id)).toEqual([]);
  });

  it('puts each region inside its country', () => {
    expect(SOURCES.filter((s) => s.region && !s.region.startsWith(`${s.country}-`)).map((s) => s.id)).toEqual([]);
  });
});

describe('outletPools', () => {
  const source = (id: string, country: string, feeds: SourceConfig['feeds'], region?: string): SourceConfig => ({
    id,
    name: id,
    type: 'rss',
    country,
    language: 'fr',
    feeds,
    authority: 1,
    region,
  });

  it('counts each country’s national outlets with top feeds', () => {
    const pools = outletPools([
      source('a', 'FR', { top: ['https://a.example/rss'] }),
      source('b', 'FR', { top: ['https://b.example/rss'], sport: ['https://b.example/sport'] }),
      source('sportsdaily', 'FR', { sport: ['https://s.example/rss'] }),
      source('regional', 'FR', { top: ['https://r.example/rss'] }, 'FR-BRE'),
      source('c', 'DE', { top: ['https://c.example/rss'] }),
    ]);
    expect([...pools]).toEqual([
      ['FR', 2],
      ['DE', 1],
    ]);
  });

  it('gives every country with a top file a pool', () => {
    const pools = outletPools();
    const countries = new Set(SOURCES.filter((s) => !s.region && s.feeds.top?.length).map((s) => s.country));
    expect([...countries].filter((c) => !pools.get(c))).toEqual([]);
  });
});
