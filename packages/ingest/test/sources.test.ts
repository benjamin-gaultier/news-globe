import { describe, expect, it } from 'vitest';
import { SOURCES } from '../src/sources.config';

const duplicates = (values: string[]) => [...new Set(values.filter((v, i) => values.indexOf(v) !== i))];

describe('SOURCES', () => {
  it('has unique ids', () => {
    expect(duplicates(SOURCES.map((s) => s.id))).toEqual([]);
  });

  it('polls each feed once', () => {
    // A feed shared by two sources gets one cache entry: the second poll is throttled
    // and its stories count for both units.
    expect(duplicates(SOURCES.flatMap((s) => s.feedUrls))).toEqual([]);
  });

  it('puts each region inside its country', () => {
    expect(SOURCES.filter((s) => s.region && !s.region.startsWith(`${s.country}-`)).map((s) => s.id)).toEqual([]);
  });
});
