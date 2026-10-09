import type { CountryCode, RegionCode } from '@news-globe/shared';
import type { Route } from './route';

/**
 * The open panel. Only one is ever open, so it is one value rather than a flag
 * per panel. History (the day and run shown) is separate: a place can be open
 * live or in History.
 */
export type View =
  | { kind: 'globe' }
  | {
      kind: 'place';
      country: CountryCode;
      region: RegionCode | null;
      /** A story's page in the panel (its cluster id); live only. */
      story: string | null;
      /** The headline a search result opened: scrolled to and highlighted. */
      focusTitle: string | null;
    }
  | { kind: 'world' }
  | { kind: 'today' }
  | { kind: 'search' };

export const GLOBE: View = { kind: 'globe' };

/** A country or region panel on its list, or on one of its stories. */
export const place = (
  country: CountryCode,
  opts: { region?: RegionCode | null; story?: string | null; focusTitle?: string | null } = {},
): View => ({ kind: 'place', country, region: opts.region ?? null, story: opts.story ?? null, focusTitle: opts.focusTitle ?? null });

/** The view a URL hash names (search is never in the URL). */
export function viewFromRoute(route: Route): View {
  if (route.country) return place(route.country, { region: route.region, story: route.story });
  if (route.world) return { kind: 'world' };
  if (route.today) return { kind: 'today' };
  return GLOBE;
}

/** The URL hash's route for a view, at a History time (`at`) or live (null). */
export function routeOf(view: View, at: string | null): Route {
  const isPlace = view.kind === 'place';
  return {
    country: isPlace ? view.country : null,
    region: isPlace ? view.region : null,
    world: view.kind === 'world',
    at,
    story: (!at && isPlace && view.story) || undefined,
    today: (!at && view.kind === 'today') || undefined,
  };
}
