import { CATEGORIES, COUNTRIES, REGIONS, type Category, type CountryCode, type RegionCode } from '@news-globe/shared';

/**
 * The open view, kept in the URL hash so it can be shared: no hash is the
 * world briefing, `#FR` is France, `#FR-BRE` is Brittany (a region code names
 * its country too). The old `#world` (Across borders) and `#today` (Today)
 * links name the world briefing too, and give way to the plain URL. A `@`
 * suffix opens History: `#FR@2026-10-08T14:05` is France at the run of 14:05
 * UTC that day, `#@2026-10-08` the globe on that day's latest run. A story id
 * after a slash opens that story's page: `#FR/EAskgXdmb1-3` (live only). A
 * section after a dot opens the place's sport or business headlines:
 * `#FR.sport`, `#FR-BRE.business/EAskgXdmb1-3` (live only).
 */
export interface Route {
  country: CountryCode | null;
  region: RegionCode | null;
  /** History: a UTC day `YYYY-MM-DD`, or a run `YYYY-MM-DDTHH:MM`; null is live. */
  at: string | null;
  /** A story's page in the country or region panel: its cluster id. Live only. */
  story?: string;
  /** The place's section (`sport`, `business`) instead of its top headlines. Live only; absent for `top`. */
  category?: Category;
}

export const EMPTY_ROUTE: Route = { country: null, region: null, at: null };

/** The old Across borders and Today pages, merged into the world briefing. */
const OLD_WORLD_VIEWS = new Set(['WORLD', 'TODAY']);
const AT = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/;
/** Cluster ids are article ids: short URL-safe hashes, case-sensitive. */
const STORY = /^[A-Za-z0-9_-]{4,64}$/;
/** The categories a link can name: every one but `top`, which is the place's plain link. */
const SECTIONS: readonly string[] = CATEGORIES.filter((c) => c !== 'top');

/** Reads a hash like `#FR`, `#fr-bre`, `#FR.sport` or `#FR@2026-10-08T14:05`. Unknown parts are dropped. */
export function parseRoute(hash: string): Route {
  let raw: string;
  try {
    raw = decodeURIComponent(hash.replace(/^#\/?/, '')).trim();
  } catch {
    return EMPTY_ROUTE; // malformed %-escape
  }
  const [path = '', time = ''] = raw.split('@', 2);
  const at = AT.test(time.toUpperCase()) ? time.toUpperCase() : null;
  const [view = '', storyId = ''] = path.split('/', 2);
  const [unit = '', section = ''] = view.split('.', 2);
  const code = unit.trim().toUpperCase();
  const category = section.trim().toLowerCase();
  // Live only, like story pages: History replays the top headlines.
  const live = {
    ...(!at && STORY.test(storyId.trim()) && { story: storyId.trim() }),
    ...(!at && SECTIONS.includes(category) && { category: category as Category }),
  };
  if (OLD_WORLD_VIEWS.has(code)) return { ...EMPTY_ROUTE, at };
  const region = REGIONS[code];
  if (region) return { country: region.country, region: region.code, at, ...live };
  if (COUNTRIES[code]) return { country: code, region: null, at, ...live };
  return { ...EMPTY_ROUTE, at };
}

/**
 * The hash for a route: `#FR-BRE`, `#FR.sport`, `#FR/EAskgXdmb1-3`, `#FR@2026-10-08T14:05`, `#@2026-10-08`,
 * or `''` live with no place open (the world briefing).
 */
export function formatRoute({ country, region, at, story, category }: Route): string {
  const place = region ?? country ?? '';
  if (at) return `#${place}@${at}`;
  if (!place) return '';
  const section = category && category !== 'top' ? `${place}.${category}` : place;
  return story ? `#${section}/${story}` : `#${section}`;
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
