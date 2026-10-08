import {
  ARCHIVE_SCHEMA_VERSION,
  SCHEMA_VERSION,
  type ArchiveDay,
  type CountryCode,
  type CountryFile,
  type IndexFile,
  type RegionCode,
} from '@news-globe/shared';

/** Base URL for the static data files; swap for S3/CloudFront at build time. */
export const DATA_BASE_URL = (import.meta.env.DATA_BASE_URL || '/data').replace(/\/+$/, '');

async function fetchJson<T extends { schemaVersion: number }>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${DATA_BASE_URL}/${path}`, { signal, cache: 'no-cache' });
  if (!res.ok) throw new Error(`Couldn't load ${path} (HTTP ${res.status})`);
  const json = (await res.json()) as T;
  if (json.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`Unsupported data version ${json.schemaVersion} (expected ${SCHEMA_VERSION})`);
  }
  return json;
}

export const fetchIndex = (signal?: AbortSignal) => fetchJson<IndexFile>('index.json', signal);

export const fetchCountry = (code: CountryCode, signal?: AbortSignal) =>
  fetchJson<CountryFile>(`countries/${encodeURIComponent(code)}.json`, signal);

/** One UTC day of history (`YYYY-MM-DD`), or null when nothing was archived that day. */
export async function fetchArchive(date: string, signal?: AbortSignal): Promise<ArchiveDay | null> {
  const res = await fetch(`${DATA_BASE_URL}/archive/${encodeURIComponent(date)}.json`, { signal, cache: 'no-cache' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Couldn't load the history for ${date} (HTTP ${res.status})`);
  const day = (await res.json()) as ArchiveDay;
  if (day.schemaVersion !== ARCHIVE_SCHEMA_VERSION) {
    throw new Error(`Unsupported history version ${day.schemaVersion} (expected ${ARCHIVE_SCHEMA_VERSION})`);
  }
  return day;
}

/** Regional files share the country file's shape, plus `regionCode` / `regionName`. */
export const fetchRegion = (code: RegionCode, signal?: AbortSignal) =>
  fetchJson<CountryFile>(`regions/${encodeURIComponent(code)}.json`, signal);
