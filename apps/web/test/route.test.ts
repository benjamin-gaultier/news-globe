import { describe, expect, it } from 'vitest';
import { EMPTY_ROUTE, formatRoute, parseRoute } from '../src/lib/route';

describe('parseRoute', () => {
  it('reads a country', () => {
    expect(parseRoute('#FR')).toEqual({ country: 'FR', region: null });
  });

  it('reads a region and its country', () => {
    expect(parseRoute('#FR-BRE')).toEqual({ country: 'FR', region: 'FR-BRE' });
    expect(parseRoute('#IT-82')).toEqual({ country: 'IT', region: 'IT-82' });
  });

  it('ignores case, a leading slash and surrounding spaces', () => {
    expect(parseRoute('#fr-bre')).toEqual({ country: 'FR', region: 'FR-BRE' });
    expect(parseRoute('#/us')).toEqual({ country: 'US', region: null });
    expect(parseRoute('#%20de%20')).toEqual({ country: 'DE', region: null });
  });

  it('gives the empty route for no hash or an unknown code', () => {
    expect(parseRoute('')).toEqual(EMPTY_ROUTE);
    expect(parseRoute('#')).toEqual(EMPTY_ROUTE);
    expect(parseRoute('#XX')).toEqual(EMPTY_ROUTE);
    expect(parseRoute('#FR-XXX')).toEqual(EMPTY_ROUTE);
    expect(parseRoute('#__proto__')).toEqual(EMPTY_ROUTE);
  });

  it('does not throw on a malformed escape', () => {
    expect(parseRoute('#%E0%A4%A')).toEqual(EMPTY_ROUTE);
  });
});

describe('formatRoute', () => {
  it('round-trips through parseRoute', () => {
    for (const hash of ['#FR', '#FR-BRE', '#US-NY', '']) {
      expect(formatRoute(parseRoute(hash))).toBe(hash);
    }
  });

  it('prefers the region when both are set', () => {
    expect(formatRoute({ country: 'DE', region: 'DE-TH' })).toBe('#DE-TH');
  });
});
