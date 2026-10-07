import { SCHEMA_VERSION, type CountryCode, type CountryFile, type IndexFile, type RegionCode } from '@news-globe/shared';

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

/** Regional files share the country file's shape, plus `regionCode` / `regionName`. */
export const fetchRegion = (code: RegionCode, signal?: AbortSignal) =>
  fetchJson<CountryFile>(`regions/${encodeURIComponent(code)}.json`, signal);
