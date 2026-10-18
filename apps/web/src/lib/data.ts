import {
  ARCHIVE_SCHEMA_VERSION,
  SCHEMA_VERSION,
  fileStem,
  type ArchiveDay,
  type Category,
  type CountryCode,
  type CountryFile,
  type IndexFile,
  type RegionCode,
  type SearchFile,
  type TodayFile,
  type TranslationsFile,
  type TrendsFile,
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

/** A country's top headlines, or one of its sections (`countries/FR.sport.json`). */
export const fetchCountry = (code: CountryCode, category: Category = 'top', signal?: AbortSignal) =>
  fetchJson<CountryFile>(`countries/${encodeURIComponent(fileStem(code, category))}.json`, signal);

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

/** A file the hourly workflow derives; null until it has written one. */
async function fetchDerived<T extends { schemaVersion: number }>(path: string, signal?: AbortSignal): Promise<T | null> {
  const res = await fetch(`${DATA_BASE_URL}/${path}`, { signal, cache: 'no-cache' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Couldn't load ${path} (HTTP ${res.status})`);
  const json = (await res.json()) as T;
  return json.schemaVersion === SCHEMA_VERSION ? json : null;
}

/** New / Rising badges and rank histories for the latest run. */
export const fetchTrends = (signal?: AbortSignal) => fetchDerived<TrendsFile>('trends.json', signal);

/** The Today page: the run's biggest, rising and lasting stories. */
export const fetchToday = (signal?: AbortSignal) => fetchDerived<TodayFile>('today.json', signal);

/** English for the most-seen headlines (404 → null: no translator configured). */
export const fetchTranslations = (signal?: AbortSignal) => fetchDerived<TranslationsFile>('translations.json', signal);

/** Every headline of the latest run, for search. */
export const fetchSearch = (signal?: AbortSignal) => fetchDerived<SearchFile>('search.json', signal);

/** Regional files share the country file's shape, plus `regionCode` / `regionName`; so do their sections (`regions/FR-BRE.sport.json`). */
export const fetchRegion = (code: RegionCode, category: Category = 'top', signal?: AbortSignal) =>
  fetchJson<CountryFile>(`regions/${encodeURIComponent(fileStem(code, category))}.json`, signal);
