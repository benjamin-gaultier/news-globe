import { describe, expect, it } from 'vitest';
import { EMPTY_ROUTE, formatRoute, parseRoute, runForAt } from '../src/lib/route';

describe('parseRoute', () => {
  it('reads a country', () => {
    expect(parseRoute('#FR')).toEqual({ country: 'FR', region: null, at: null });
  });

  it('reads a region and its country', () => {
    expect(parseRoute('#FR-BRE')).toEqual({ country: 'FR', region: 'FR-BRE', at: null });
    expect(parseRoute('#IT-82')).toEqual({ country: 'IT', region: 'IT-82', at: null });
  });

  it('ignores case, a leading slash and surrounding spaces', () => {
    expect(parseRoute('#fr-bre')).toEqual({ country: 'FR', region: 'FR-BRE', at: null });
    expect(parseRoute('#/us')).toEqual({ country: 'US', region: null, at: null });
    expect(parseRoute('#%20de%20')).toEqual({ country: 'DE', region: null, at: null });
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
    expect(formatRoute({ country: 'DE', region: 'DE-TH', at: null })).toBe('#DE-TH');
  });
});

describe('world briefing', () => {
  it('is the plain URL, which the old Across borders and Today links now name', () => {
    expect(formatRoute(EMPTY_ROUTE)).toBe('');
    for (const hash of ['#world', '#WORLD', '#today', '#Today', '#world.sport', '#today/EAskgXdmb1-3']) {
      expect(parseRoute(hash)).toEqual(EMPTY_ROUTE);
    }
  });

  it('gives way to the globe in History', () => {
    expect(parseRoute('#world@2026-10-08')).toEqual({ ...EMPTY_ROUTE, at: '2026-10-08' });
    expect(parseRoute('#Today@2026-10-08')).toEqual({ ...EMPTY_ROUTE, at: '2026-10-08' });
    expect(formatRoute({ ...EMPTY_ROUTE, at: '2026-10-08' })).toBe('#@2026-10-08');
  });
});

describe('story routes', () => {
  it('opens a story’s page, keeping the id’s case', () => {
    expect(parseRoute('#FR/EAskgXdmb1-3')).toEqual({ country: 'FR', region: null, at: null, story: 'EAskgXdmb1-3' });
    expect(parseRoute('#fr-bre/aB_9xyz')).toEqual({ country: 'FR', region: 'FR-BRE', at: null, story: 'aB_9xyz' });
    expect(formatRoute({ country: 'FR', region: null, at: null, story: 'EAskgXdmb1-3' })).toBe('#FR/EAskgXdmb1-3');
    expect(formatRoute({ country: 'FR', region: 'FR-BRE', at: null, story: 'aB_9xyz' })).toBe('#FR-BRE/aB_9xyz');
  });

  it('drops a malformed id, a story without a place, and stories in History', () => {
    expect(parseRoute('#FR/not a story!').story).toBeUndefined();
    expect(parseRoute('#XX/EAskgXdmb1-3')).toEqual(EMPTY_ROUTE);
    expect(parseRoute('#FR/EAskgXdmb1-3@2026-10-08').story).toBeUndefined();
    expect(formatRoute({ country: 'FR', region: null, at: '2026-10-08', story: 'EAskgXdmb1-3' })).toBe('#FR@2026-10-08');
  });
});

describe('section routes', () => {
  it('opens a place’s sport or business headlines, in any case', () => {
    expect(parseRoute('#FR.sport')).toEqual({ country: 'FR', region: null, at: null, category: 'sport' });
    expect(parseRoute('#fr-bre.Business')).toEqual({ country: 'FR', region: 'FR-BRE', at: null, category: 'business' });
    expect(formatRoute({ country: 'FR', region: null, at: null, category: 'sport' })).toBe('#FR.sport');
    expect(formatRoute({ country: 'FR', region: 'FR-BRE', at: null, category: 'business' })).toBe('#FR-BRE.business');
  });

  it('opens a story’s page in a section', () => {
    const route = { ...EMPTY_ROUTE, country: 'DE', category: 'sport', story: 'aB_9xyz' } as const;
    expect(parseRoute('#de.sport/aB_9xyz')).toEqual(route);
    expect(formatRoute(route)).toBe('#DE.sport/aB_9xyz');
  });

  it('drops an unknown section, `top`, a section without a place, and sections in History', () => {
    expect(parseRoute('#FR.weather')).toEqual({ country: 'FR', region: null, at: null });
    expect(parseRoute('#FR.top')).toEqual({ country: 'FR', region: null, at: null });
    expect(formatRoute({ country: 'FR', region: null, at: null, category: 'top' })).toBe('#FR');
    expect(parseRoute('#XX.sport')).toEqual(EMPTY_ROUTE);
    expect(formatRoute({ ...EMPTY_ROUTE, category: 'sport' })).toBe('');
    expect(parseRoute('#FR.sport@2026-10-08')).toEqual({ country: 'FR', region: null, at: '2026-10-08' });
    expect(formatRoute({ country: 'FR', region: null, at: '2026-10-08', category: 'sport' })).toBe('#FR@2026-10-08');
  });

  it('round-trips', () => {
    for (const hash of ['#FR.sport', '#US.business', '#FR-BRE.sport', '#GB.sport/EAskgXdmb1-3']) {
      expect(formatRoute(parseRoute(hash))).toBe(hash);
    }
  });
});

describe('history routes', () => {
  it('reads a view with a time', () => {
    expect(parseRoute('#FR@2026-10-08T14:05')).toEqual({ country: 'FR', region: null, at: '2026-10-08T14:05' });
    expect(parseRoute('#fr-bre@2026-10-08')).toEqual({ country: 'FR', region: 'FR-BRE', at: '2026-10-08' });
    expect(parseRoute('#@2026-10-08')).toEqual({ ...EMPTY_ROUTE, at: '2026-10-08' });
  });

  it('drops a malformed time and keeps the view', () => {
    expect(parseRoute('#FR@yesterday')).toEqual({ country: 'FR', region: null, at: null });
    expect(parseRoute('#FR@2026-10-08T14')).toEqual({ country: 'FR', region: null, at: null });
  });

  it('round-trips', () => {
    for (const hash of ['#FR@2026-10-08T14:05', '#FR-BRE@2026-10-08', '#@2026-10-08T00:05']) {
      expect(formatRoute(parseRoute(hash))).toBe(hash);
    }
  });

  it('finds the run an at names, or the closest one', () => {
    const runs = ['2026-10-08T08:05:11.000Z', '2026-10-08T09:05:09.000Z', '2026-10-08T10:05:12.000Z'];
    expect(runForAt(runs, '2026-10-08T09:05')).toBe(runs[1]);
    expect(runForAt(runs, '2026-10-08T09:50')).toBe(runs[2]);
    expect(runForAt(runs, '2026-10-08')).toBe(runs[2]);
    expect(runForAt([], '2026-10-08T09:05')).toBeNull();
  });
});
