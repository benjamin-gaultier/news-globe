import type { Category, CountryCode, IndexEntry, RegionCode } from '@news-globe/shared';
import type { Route } from './route';

/**
 * The open panel. Only one is ever open, so it is one value rather than a flag
 * per panel. History (the day and run shown) is separate: a place can be open
 * live or in History.
 */
export type View =
  /** No panel: the globe alone (the world briefing closed, or History with no place open). */
  | { kind: 'globe' }
  | {
      kind: 'place';
      country: CountryCode;
      region: RegionCode | null;
      /** Its top headlines, or a section (live only; History replays the top headlines). */
      category: Category;
      /** A story's page in the panel (its cluster id); live only. */
      story: string | null;
      /** The headline a search result opened: scrolled to and highlighted. */
      focusTitle: string | null;
    }
  /** The world briefing: the landing view (live only). */
  | { kind: 'world' }
  | { kind: 'search' };

export const GLOBE: View = { kind: 'globe' };
export const WORLD: View = { kind: 'world' };

/** Where closing a panel leads: the world briefing, or the globe in History (which has no briefing). */
export const home = (at: string | null): View => (at ? GLOBE : WORLD);

/** A country or region panel on its list, or on one of its stories; on its top headlines unless a category is given. */
export const place = (
  country: CountryCode,
  opts: { region?: RegionCode | null; category?: Category; story?: string | null; focusTitle?: string | null } = {},
): View => ({
  kind: 'place',
  country,
  region: opts.region ?? null,
  category: opts.category ?? 'top',
  story: opts.story ?? null,
  focusTitle: opts.focusTitle ?? null,
});

/** A category's name in the panel's switch and the page title. */
export const CATEGORY_NAMES: Record<Category, string> = { top: 'Top', sport: 'Sport', business: 'Business' };

/** The category to show for a place: the one asked for when the place has that file, else its top headlines. */
export const categoryIn = (entry: IndexEntry | undefined, category: Category): Category =>
  entry?.categories?.includes(category) ? category : 'top';

/** The view a URL hash names: a place, else the world briefing (the globe in History). Search is never in the URL. */
export function viewFromRoute(route: Route): View {
  if (route.country) return place(route.country, { region: route.region, category: route.category, story: route.story });
  return home(route.at);
}

/** The URL hash's route for a view, at a History time (`at`) or live (null). The briefing and the bare globe share the plain URL. */
export function routeOf(view: View, at: string | null): Route {
  const isPlace = view.kind === 'place';
  return {
    country: isPlace ? view.country : null,
    region: isPlace ? view.region : null,
    at,
    story: (!at && isPlace && view.story) || undefined,
    category: (!at && isPlace && view.category !== 'top' && view.category) || undefined,
  };
}
