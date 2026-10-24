import { createHash } from 'node:crypto';

/** Query params that only carry tracking/attribution and never change the page. */
const TRACKING_PARAMS = new Set([
  'fbclid',
  'gclid',
  'dclid',
  'msclkid',
  'mc_cid',
  'mc_eid',
  'xtor',
  'xts',
  'at_medium',
  'at_campaign',
  'at_platform',
  'at_creation',
  'at_send_date',
  // ici (Radio France) tags each local station's copy of a shared story differently.
  'at_locale',
  'cmpid',
  'smid',
  'smtyp',
  'partner',
  'ref',
  'ref_src',
  'ito',
  'ns_campaign',
  'ns_mchannel',
  'ns_source',
  'ns_linkname',
  'ns_fee',
  'taid',
  'traffic_source',
  'outputtype',
]);

function isTrackingParam(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.startsWith('utm_') || TRACKING_PARAMS.has(lower);
}

/**
 * Canonical form for dedupe: tracking params stripped, fragment dropped,
 * host lower-cased, remaining params sorted. Returns the input unchanged if
 * it isn't an absolute http(s) URL.
 */
export function canonicalizeUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return raw.trim();
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return raw.trim();

  url.hash = '';
  url.hostname = url.hostname.toLowerCase();
  const kept = [...url.searchParams.entries()].filter(([k]) => !isTrackingParam(k));
  kept.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  url.search = '';
  for (const [k, v] of kept) url.searchParams.append(k, v);
  return url.toString();
}

/** Short, stable id derived from a canonical URL. */
export function articleId(canonicalUrl: string): string {
  return createHash('sha256').update(canonicalUrl).digest('base64url').slice(0, 12);
}

/**
 * Publication date embedded in an article URL path (`/2026/10/06/` or
 * `/20261006/`), as midday UTC. A fallback for feeds that omit item dates.
 */
export function dateFromUrl(raw: string): string | null {
  let path: string;
  try {
    path = new URL(raw).pathname;
  } catch {
    return null;
  }
  const m = /\/(20\d\d)\/?(0[1-9]|1[0-2])\/?(0[1-9]|[12]\d|3[01])(?:\/|$|[^\d])/.exec(path);
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}T12:00:00.000Z`;
  // Reject impossible dates like 2026-02-31, which Date would roll over.
  return new Date(iso).toISOString().startsWith(`${m[1]}-${m[2]}-${m[3]}`) ? iso : null;
}

/**
 * Section names that mark a sports page, in the languages of the feeds: `/sport/`,
 * `/deportes/`, `/futbol-xeberleri/`, `/sports/badminton/`.
 */
const SPORT_SECTION =
  /^(?:sports?|sporti?|spor|deportes?|esportes?|desportos?|futbol|fútbol|football|soccer|calcio|fussball|fußball|fotbal|cricket|tennis|basketball|baseball|béisbol|beisbol)(?:-|$)/i;

/**
 * True when one of a feed item's own categories is a sports section ("Sports", "Football",
 * "Deportes"): how whole-site WordPress feeds (Punch, APS, Le Soleil) mark them, with no
 * section in the URL.
 */
export function isSportCategory(categories: readonly string[] | undefined): boolean {
  return !!categories?.some((c) => SPORT_SECTION.test(c.trim().replace(/\s+/g, '-')));
}

/**
 * True when an article URL sits in a sports section: a directory of its path (not the
 * final slug, which can be any headline) is a sports section name. Whole-site feeds,
 * which many outlets' top feeds are, carry sports stories; sport has files of its own.
 */
export function isSportUrl(raw: string): boolean {
  let path: string;
  try {
    path = decodeURIComponent(new URL(raw).pathname);
  } catch {
    return false;
  }
  return path
    .split('/')
    .filter(Boolean)
    .slice(0, -1)
    .some((segment) => SPORT_SECTION.test(segment));
}
