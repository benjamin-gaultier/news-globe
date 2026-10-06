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
