import { readFile } from 'node:fs/promises';
import type { RawItem } from './adapters/types';
import { writeJsonAtomic } from './write';

interface CacheEntry {
  etag?: string;
  lastModified?: string;
  /** Last time we sent a request (success or failure) — drives the poll throttle. */
  lastAttemptAt: string;
  /** Last time we got a 200 or 304. */
  retrievedAt?: string;
  lastStatus?: number | string;
  /** Parsed items from the last 200, reused on 304 and while throttled. */
  items: RawItem[];
}

interface CacheFile {
  version: 1;
  entries: Record<string, CacheEntry>;
}

export type FetchOutcome = 'fetched' | 'not-modified' | 'throttled' | 'error';

export interface CachedFetchResult {
  outcome: FetchOutcome;
  items: RawItem[];
  /** Undefined only if the feed has never been retrieved successfully. */
  retrievedAt?: string;
  error?: string;
}

export interface HttpCacheOptions {
  userAgent: string;
  minIntervalMs: number;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

/**
 * Polite HTTP layer: conditional GET (ETag / Last-Modified), at most one
 * request per URL per `minIntervalMs` across runs, and a parsed-item cache
 * persisted to disk so a 304 or a throttled feed still yields its items.
 */
export class HttpCache {
  private dirty = false;

  private constructor(
    private readonly file: string,
    private readonly data: CacheFile,
    private readonly opts: HttpCacheOptions,
  ) {}

  static async load(file: string, opts: HttpCacheOptions): Promise<HttpCache> {
    let data: CacheFile = { version: 1, entries: {} };
    try {
      const parsed = JSON.parse(await readFile(file, 'utf8')) as CacheFile;
      if (parsed?.version === 1 && parsed.entries) data = parsed;
    } catch {
      // Missing or corrupt cache: start fresh.
    }
    return new HttpCache(file, data, opts);
  }

  async save(): Promise<void> {
    if (!this.dirty) return;
    await writeJsonAtomic(this.file, this.data);
    this.dirty = false;
  }

  async getItems(url: string, parse: (body: string) => Promise<RawItem[]>): Promise<CachedFetchResult> {
    const now = this.opts.now?.() ?? Date.now();
    const entry = this.data.entries[url];

    if (entry && now - Date.parse(entry.lastAttemptAt) < this.opts.minIntervalMs) {
      return { outcome: 'throttled', items: entry.items, retrievedAt: entry.retrievedAt };
    }

    const headers: Record<string, string> = {
      'User-Agent': this.opts.userAgent,
      Accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5',
    };
    if (entry?.etag) headers['If-None-Match'] = entry.etag;
    if (entry?.lastModified) headers['If-Modified-Since'] = entry.lastModified;

    const attemptAt = new Date(now).toISOString();
    const next: CacheEntry = { ...(entry ?? { items: [] }), lastAttemptAt: attemptAt, lastStatus: undefined };
    this.data.entries[url] = next;
    this.dirty = true;

    const doFetch = this.opts.fetchImpl ?? fetch;
    try {
      const res = await doFetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(this.opts.timeoutMs) });
      next.lastStatus = res.status;

      if (res.status === 304) {
        await res.body?.cancel();
        next.retrievedAt = attemptAt;
        return { outcome: 'not-modified', items: next.items, retrievedAt: attemptAt };
      }
      if (!res.ok) {
        await res.body?.cancel();
        throw new Error(`HTTP ${res.status}`);
      }

      const items = await parse(await res.text());
      next.items = items;
      next.retrievedAt = attemptAt;
      next.etag = res.headers.get('etag') ?? undefined;
      next.lastModified = res.headers.get('last-modified') ?? undefined;
      return { outcome: 'fetched', items, retrievedAt: attemptAt };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (typeof next.lastStatus !== 'number') next.lastStatus = message;
      // Serve the last good items (if any) rather than dropping the outlet.
      return { outcome: 'error', items: next.items, retrievedAt: next.retrievedAt, error: message };
    }
  }
}
