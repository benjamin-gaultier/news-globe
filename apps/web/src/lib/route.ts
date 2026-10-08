import { COUNTRIES, REGIONS, type CountryCode, type RegionCode } from '@news-globe/shared';

/**
 * The open view, kept in the URL hash so it can be shared: `#FR` is France,
 * `#FR-BRE` is Brittany (a region code names its country too), `#world` the
 * cross-border stories.
 */
export interface Route {
  country: CountryCode | null;
  region: RegionCode | null;
  world: boolean;
}

export const EMPTY_ROUTE: Route = { country: null, region: null, world: false };

const WORLD = 'WORLD';

/** Reads a hash like `#FR`, `#fr-bre` or `#world`. Unknown codes give the empty route. */
export function parseRoute(hash: string): Route {
  let code: string;
  try {
    code = decodeURIComponent(hash.replace(/^#\/?/, '')).trim().toUpperCase();
  } catch {
    return EMPTY_ROUTE; // malformed %-escape
  }
  if (code === WORLD) return { ...EMPTY_ROUTE, world: true };
  const region = REGIONS[code];
  if (region) return { country: region.country, region: region.code, world: false };
  if (COUNTRIES[code]) return { country: code, region: null, world: false };
  return EMPTY_ROUTE;
}

/** The hash for a route: `#FR-BRE`, `#FR`, `#world`, or `''` for the plain globe. */
export function formatRoute({ country, region, world }: Route): string {
  if (region) return `#${region}`;
  if (country) return `#${country}`;
  if (world) return '#world';
  return '';
}
