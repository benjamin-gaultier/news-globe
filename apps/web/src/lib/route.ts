import { COUNTRIES, REGIONS, type CountryCode, type RegionCode } from '@news-globe/shared';

/**
 * The open country or region, kept in the URL hash so a view can be shared:
 * `#FR` is France, `#FR-BRE` is Brittany (a region code names its country too).
 */
export interface Route {
  country: CountryCode | null;
  region: RegionCode | null;
}

export const EMPTY_ROUTE: Route = { country: null, region: null };

/** Reads a hash like `#FR` or `#fr-bre`. Unknown codes give the empty route. */
export function parseRoute(hash: string): Route {
  let code: string;
  try {
    code = decodeURIComponent(hash.replace(/^#\/?/, '')).trim().toUpperCase();
  } catch {
    return EMPTY_ROUTE; // malformed %-escape
  }
  const region = REGIONS[code];
  if (region) return { country: region.country, region: region.code };
  if (COUNTRIES[code]) return { country: code, region: null };
  return EMPTY_ROUTE;
}

/** The hash for a route: `#FR-BRE`, `#FR`, or `''` for the plain globe. */
export function formatRoute({ country, region }: Route): string {
  if (region) return `#${region}`;
  if (country) return `#${country}`;
  return '';
}
