import { COUNTRIES, REGIONS, type CountryCode, type RegionCode } from '@news-globe/shared';

/**
 * The open view, kept in the URL hash so it can be shared: `#FR` is France,
 * `#FR-BRE` is Brittany (a region code names its country too), `#world` the
 * cross-border stories. A `@` suffix opens History: `#FR@2026-10-08T14:05`
 * is France at the run of 14:05 UTC that day, `#@2026-10-08` the globe on
 * that day's latest run.
 */
export interface Route {
  country: CountryCode | null;
  region: RegionCode | null;
  world: boolean;
  /** History: a UTC day `YYYY-MM-DD`, or a run `YYYY-MM-DDTHH:MM`; null is live. */
  at: string | null;
}

export const EMPTY_ROUTE: Route = { country: null, region: null, world: false, at: null };

const WORLD = 'WORLD';
const AT = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/;

/** Reads a hash like `#FR`, `#fr-bre`, `#world` or `#FR@2026-10-08T14:05`. Unknown parts are dropped. */
export function parseRoute(hash: string): Route {
  let raw: string;
  try {
    raw = decodeURIComponent(hash.replace(/^#\/?/, '')).trim();
  } catch {
    return EMPTY_ROUTE; // malformed %-escape
  }
  const [view = '', time = ''] = raw.split('@', 2);
  const at = AT.test(time.toUpperCase()) ? time.toUpperCase() : null;
  const code = view.trim().toUpperCase();
  // History has no world view.
  if (code === WORLD) return { ...EMPTY_ROUTE, world: !at, at };
  const region = REGIONS[code];
  if (region) return { country: region.country, region: region.code, world: false, at };
  if (COUNTRIES[code]) return { country: code, region: null, world: false, at };
  return { ...EMPTY_ROUTE, at };
}

/** The hash for a route: `#FR-BRE`, `#FR@2026-10-08T14:05`, `#world`, `#@2026-10-08`, or `''` for the plain live globe. */
export function formatRoute({ country, region, world, at }: Route): string {
  const view = region ?? country ?? (world && !at ? 'world' : '');
  if (at) return `#${view}@${at}`;
  return view ? `#${view}` : '';
}

/** The `at` for a run time: its UTC minute (`2026-10-08T14:05`). */
export const runToAt = (runAt: string) => runAt.slice(0, 16);

/**
 * The run an `at` names: the one in its minute, else the closest in time
 * (a link to a run that is no longer in the file), else null.
 */
export function runForAt(runs: readonly string[], at: string): string | null {
  if (!runs.length) return null;
  if (at.length === 10) return runs.at(-1)!;
  const exact = runs.find((r) => runToAt(r) === at);
  if (exact) return exact;
  const target = Date.parse(`${at}:00Z`);
  return runs.reduce((best, r) => (Math.abs(Date.parse(r) - target) < Math.abs(Date.parse(best) - target) ? r : best));
}
