import { describe, expect, it } from 'vitest';
import { formatRoute, parseRoute } from '../src/lib/route';
import { categoryIn, GLOBE, place, routeOf, viewFromRoute, WORLD } from '../src/lib/view';

describe('view', () => {
  it('reads the view a hash names', () => {
    expect(viewFromRoute(parseRoute('#FR-BRE'))).toEqual(place('FR', { region: 'FR-BRE' }));
    expect(viewFromRoute(parseRoute('#FR/bud1abc'))).toEqual(place('FR', { story: 'bud1abc' }));
    expect(viewFromRoute(parseRoute('#FR-BRE.sport'))).toEqual(place('FR', { region: 'FR-BRE', category: 'sport' }));
    expect(place('FR')).toMatchObject({ category: 'top' });
  });

  it('opens on the world briefing, as do the old Across borders and Today links; History on the globe', () => {
    for (const hash of ['', '#world', '#today', '#XX']) expect(viewFromRoute(parseRoute(hash))).toEqual(WORLD);
    expect(viewFromRoute(parseRoute('#@2026-10-08'))).toEqual(GLOBE);
    expect(viewFromRoute(parseRoute('#today@2026-10-08'))).toEqual(GLOBE);
    // The briefing and the globe it closes to share the plain URL.
    expect(formatRoute(routeOf(WORLD, null))).toBe('');
    expect(formatRoute(routeOf(GLOBE, null))).toBe('');
  });

  it('round-trips through the hash', () => {
    const hashes = ['', '#FR', '#FR-BRE', '#FR/bud1abc', '#FR.sport', '#FR.business/bud1abc'];
    for (const hash of [...hashes, '#FR@2026-10-08T14:05', '#@2026-10-08']) {
      const route = parseRoute(hash);
      expect(formatRoute(routeOf(viewFromRoute(route), route.at))).toBe(hash);
    }
  });

  it('keeps search, highlights and story pages out of the URL where they don’t belong', () => {
    expect(formatRoute(routeOf({ kind: 'search' }, null))).toBe('');
    expect(formatRoute(routeOf(place('FR', { focusTitle: 'Budget' }), null))).toBe('#FR');
    // History has no story pages and no briefing.
    expect(formatRoute(routeOf(place('FR', { story: 'bud1abc' }), '2026-10-08'))).toBe('#FR@2026-10-08');
    expect(formatRoute(routeOf(WORLD, '2026-10-08'))).toBe('#@2026-10-08');
    // History has no sections either.
    expect(formatRoute(routeOf(place('FR', { category: 'sport' }), '2026-10-08'))).toBe('#FR@2026-10-08');
  });

  it('shows a section only where the place has that file', () => {
    const entry = { code: 'FR', name: 'France', updatedAt: '', clusterCount: 1 };
    expect(categoryIn({ ...entry, categories: ['top', 'sport'] }, 'sport')).toBe('sport');
    expect(categoryIn({ ...entry, categories: ['top', 'sport'] }, 'business')).toBe('top');
    expect(categoryIn(entry, 'sport')).toBe('top');
    expect(categoryIn(undefined, 'sport')).toBe('top');
    expect(categoryIn(entry, 'top')).toBe('top');
  });
});
