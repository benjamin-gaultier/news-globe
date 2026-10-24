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

export type FetchOutcome = 'fetched' | 'not-modified' | 'throttled' | 'offline' | 'error';

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
  /** Serve cached items only and never touch the network (e.g. to test clustering on a dev machine). */
  offline?: boolean;
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

    if (this.opts.offline) {
      return { outcome: 'offline', items: entry?.items ?? [], retrievedAt: entry?.retrievedAt };
    }
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
        // Items cached before first-seen times existed get theirs now, or a feed that keeps
        // answering 304 would date its undated items by every fetch.
        next.items = stampFirstSeen(next.items, next.items, attemptAt);
        return { outcome: 'not-modified', items: next.items, retrievedAt: attemptAt };
      }
      if (!res.ok) {
        await res.body?.cancel();
        throw new Error(`HTTP ${res.status}`);
      }

      const items = stampFirstSeen(
        newest(await parse(decodeBody(new Uint8Array(await res.arrayBuffer()), res.headers.get('content-type'))), MAX_ITEMS_PER_FEED),
        entry?.items ?? [],
        attemptAt,
      );
      next.items = items;
      next.retrievedAt = attemptAt;
      next.etag = res.headers.get('etag') ?? undefined;
      next.lastModified = res.headers.get('last-modified') ?? undefined;
      return { outcome: 'fetched', items, retrievedAt: attemptAt };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // A network error, or a 200 whose body didn't parse: say what went wrong rather than "200".
      if (typeof next.lastStatus !== 'number' || next.lastStatus === 200) next.lastStatus = message;
      // Serve the last good items (if any) rather than dropping the outlet.
      return { outcome: 'error', items: next.items, retrievedAt: next.retrievedAt, error: message };
    }
  }
}

/**
 * Items kept per feed. A few feeds (Eguur) list their whole archive, about
 * 10,000 items and 3 MB, which would otherwise be cached and re-read every run;
 * no outlet posts anywhere near this many within `maxArticleAgeHours`.
 */
export const MAX_ITEMS_PER_FEED = 200;

/**
 * The `max` most recent items, undated ones first (their age is unknown until stamped
 * with `firstSeenAt`, which can date them well before now), feed order otherwise.
 */
export function newest(items: RawItem[], max: number): RawItem[] {
  if (items.length <= max) return items;
  const time = (i: RawItem) => (i.publishedAt ? Date.parse(i.publishedAt) || 0 : Infinity);
  return items
    .map((item, index) => ({ item, index, t: time(item) }))
    .sort((a, b) => b.t - a.t || a.index - b.index)
    .slice(0, max)
    .map((x) => x.item);
}

/**
 * Sets `firstSeenAt` on the items without a usable date (none, or one after `at`): the
 * time an earlier fetch first listed the same URL, or `at` for a new item. An item that
 * had one keeps it once its date passes (a preview dated at kick-off, a feed whose clock
 * runs ahead), so it never jumps forward to that date.
 */
export function stampFirstSeen(items: RawItem[], previous: readonly RawItem[], at: string): RawItem[] {
  const seen = new Map(previous.flatMap((i) => (i.firstSeenAt ? [[i.url, i.firstSeenAt] as const] : [])));
  return items.map((item) => {
    const dated = item.publishedAt !== null && Date.parse(item.publishedAt) <= Date.parse(at);
    const first = seen.get(item.url);
    if (dated) return first ? { ...item, firstSeenAt: first } : item;
    return { ...item, firstSeenAt: first ?? at };
  });
}

/**
 * Decode a feed body using its declared charset: the Content-Type header,
 * else the XML declaration, else UTF-8. Some feeds (Folha de S.Paulo) are
 * ISO-8859-1, which `Response.text()` would mangle into U+FFFD.
 */
export function decodeBody(bytes: Uint8Array, contentType: string | null): string {
  const fromHeader = /charset=["']?([\w-]+)/i.exec(contentType ?? '')?.[1];
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 200));
  const fromXml = /^\s*<\?xml[^>]*encoding=["']([\w-]+)["']/i.exec(head)?.[1];
  for (const label of [fromHeader, fromXml]) {
    if (!label) continue;
    try {
      return new TextDecoder(label).decode(bytes);
    } catch {
      // Unknown label: try the next source.
    }
  }
  return new TextDecoder('utf-8').decode(bytes);
}
