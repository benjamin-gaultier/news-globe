/**
 * All public data files packed into one KV value, so each ingest run costs a
 * single KV write (the free tier allows 1,000 a day; one key per country would
 * need ~100 per run).
 *
 * Layout: one line of JSON mapping each key to [byteOffset, byteLength] in the
 * body, a "\n", then the files' UTF-8 bytes back to back. A reader slices one
 * file out without parsing the others, which keeps the Worker well inside its
 * CPU budget.
 */

export const BUNDLE_KEY = 'bundle';

/**
 * The other KV values, written by the archive step (packages/ingest/src/archive-remote.ts),
 * each gzipped JSON. All but `translateCache` are public, as /data/<key>.json.
 */
export const KV_KEYS = {
  trends: 'trends',
  search: 'search',
  today: 'today',
  translations: 'translations',
  translateCache: 'translate-cache',
} as const;

/** The derived files served gzipped from their own KV key, as /data/<key>.json. */
export const PUBLIC_DERIVED = [KV_KEYS.trends, KV_KEYS.search, KV_KEYS.today, KV_KEYS.translations] as const;

/**
 * The files the ingest publishes in the bundle, and the only bundle keys the Worker (and the
 * dev server) will serve under /data/: the index, the health report, and country and region
 * files with their sections (`countries/FR.json`, `countries/FR.sport.json`, `regions/FR-BRE.json`).
 * The section suffixes are CATEGORIES but `top` (see fileStem), spelled out here: the Vite config
 * loads this module as is, so it imports nothing.
 */
export const PUBLIC_FILE =
  /^(index\.json|status\.json|countries\/[A-Z]{2}(\.(sport|business))?\.json|regions\/[A-Z]{2}-[A-Z0-9]{1,3}(\.(sport|business))?\.json)$/;

/** A UTC day's history, served as /data/archive/YYYY-MM-DD.json. */
export const archiveKey = (date: string) => `archive/${date}`;

export type BundleIndex = Record<string, [offset: number, length: number]>;

export function encodeBundle(files: Record<string, string>): Uint8Array {
  const encoder = new TextEncoder();
  const index: BundleIndex = {};
  const parts: Uint8Array[] = [];
  let offset = 0;
  for (const [key, value] of Object.entries(files)) {
    const bytes = encoder.encode(value);
    index[key] = [offset, bytes.length];
    parts.push(bytes);
    offset += bytes.length;
  }
  const header = encoder.encode(`${JSON.stringify(index)}\n`);
  const out = new Uint8Array(header.length + offset);
  out.set(header, 0);
  let at = header.length;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** The bytes of one file in the bundle, or null if the bundle doesn't hold it. */
export function readBundleEntry(bundle: Uint8Array, key: string): Uint8Array | null {
  const newline = bundle.indexOf(0x0a);
  if (newline < 0) return null;
  const index = JSON.parse(new TextDecoder().decode(bundle.subarray(0, newline))) as BundleIndex;
  const entry = Object.hasOwn(index, key) ? index[key] : undefined;
  if (!entry) return null;
  const start = newline + 1 + entry[0];
  return bundle.subarray(start, start + entry[1]);
}

/** The keys of every file in the bundle. */
export function bundleKeys(bundle: Uint8Array): string[] {
  const newline = bundle.indexOf(0x0a);
  if (newline < 0) return [];
  return Object.keys(JSON.parse(new TextDecoder().decode(bundle.subarray(0, newline))) as BundleIndex);
}
