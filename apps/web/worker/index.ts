/**
 * Cloudflare Worker for news-globe.
 *
 * Static files (the Vite build in ../dist) are served by Workers Static Assets
 * without invoking this code. Only /data/* reaches the Worker (see
 * `run_worker_first` in wrangler.jsonc): those files are sliced out of the
 * bundle the ingest worker writes to the NEWS_DATA KV namespace after each run
 * (one KV value for all files; see @news-globe/shared/bundle).
 */

import { ARCHIVE_SCHEMA_VERSION } from '@news-globe/shared';
import { archiveKey, BUNDLE_KEY, PUBLIC_DERIVED, PUBLIC_FILE, readBundleEntry } from '@news-globe/shared/bundle';

interface Env {
  NEWS_DATA: KVNamespace;
  ASSETS: Fetcher;
}

/** Browsers/CDN may reuse a response for a minute; the ingest only runs hourly. */
const MAX_AGE_S = 60;

/** History: `/data/archive/YYYY-MM-DD.json`, stored gzipped in KV as `archive/YYYY-MM-DD`. */
const ARCHIVE_KEY = /^archive\/(\d{4}-\d{2}-\d{2})\.json$/;
/**
 * A finished day never changes; today's file grows every run. Yesterday counts
 * as still growing: its last run can be archived after midnight UTC (a late
 * archive step, or the health workflow's retry).
 */
const PAST_DAY_MAX_AGE_S = 86_400;

/** Files the archive step derives (packages/ingest/src/derived.ts), stored gzipped under their own KV key. */
const DERIVED: Record<string, string> = Object.fromEntries(PUBLIC_DERIVED.map((k) => [`${k}.json`, k]));

/** A weak validator from the body's hash: a browser revalidating gets a 304 when nothing changed. */
async function etagOf(body: ArrayBuffer | Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', body));
  return `W/"${[...digest.subarray(0, 12)].map((b) => b.toString(16).padStart(2, '0')).join('')}"`;
}

/**
 * A finished day's validator, from its date alone: the day never changes, and hashing 1–2 MB
 * on every request would use much of a free-plan invocation's 10 ms of CPU.
 */
const pastDayEtag = (date: string) => `W/"archive-v${ARCHIVE_SCHEMA_VERSION}-${date}"`;

/** Whether the request names this validator; `*` ("any version") only counts once the file is known to exist. */
const matches = (request: Request, etag: string, exists: boolean) =>
  request.headers
    .get('If-None-Match')
    ?.split(',')
    .some((tag) => tag.trim() === etag || (exists && tag.trim() === '*')) ?? false;

function jsonHeaders(maxAge: number, gzipped: boolean, etag: string | null): Record<string, string> {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': `public, max-age=${maxAge}`,
    'Access-Control-Allow-Origin': '*',
    'X-Content-Type-Options': 'nosniff',
    ...(gzipped && { 'Content-Encoding': 'gzip' }),
    ...(etag && { ETag: etag }),
  };
}

/**
 * A JSON file, gzipped when stored that way (sent as stored: the browser inflates it, the Worker
 * never does). `etag`: a known validator, 'hash' to derive one from the body, or null for none.
 */
async function respond(
  request: Request,
  body: ArrayBuffer | Uint8Array,
  opts: { maxAge: number; gzipped: boolean; etag: string | 'hash' | null },
): Promise<Response> {
  const etag = opts.etag === 'hash' ? await etagOf(body) : opts.etag;
  const headers = jsonHeaders(opts.maxAge, opts.gzipped, etag);
  if (etag && matches(request, etag, true)) return new Response(null, { status: 304, headers });
  return new Response(request.method === 'HEAD' ? null : body, { headers, ...(opts.gzipped && { encodeBody: 'manual' as const }) });
}

/** A gzipped KV value under its own key. */
async function serveGzipped(request: Request, env: Env, kvKey: string, maxAge: number, etag: string | 'hash' | null): Promise<Response> {
  const gzipped = await env.NEWS_DATA.get(kvKey, { type: 'arrayBuffer', cacheTtl: maxAge });
  if (gzipped === null) return new Response('Not found', { status: 404 });
  return respond(request, gzipped, { maxAge, gzipped: true, etag });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/data/')) return env.ASSETS.fetch(request);
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
    }

    const key = url.pathname.slice('/data/'.length);
    const archive = ARCHIVE_KEY.exec(key);
    if (archive) {
      const date = archive[1]!;
      const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
      // Today and yesterday still grow; hashing them on every request would cost too much CPU, so no validator.
      if (date >= yesterday) return serveGzipped(request, env, archiveKey(date), MAX_AGE_S, null);
      const etag = pastDayEtag(date);
      // The browser already has this finished day: no need to read KV at all.
      if (matches(request, etag, false)) return new Response(null, { status: 304, headers: jsonHeaders(PAST_DAY_MAX_AGE_S, true, etag) });
      return serveGzipped(request, env, archiveKey(date), PAST_DAY_MAX_AGE_S, etag);
    }
    if (Object.hasOwn(DERIVED, key)) return serveGzipped(request, env, DERIVED[key]!, MAX_AGE_S, 'hash');
    // Nothing else in KV is reachable (the same contract as the Vite dev plugin).
    if (!PUBLIC_FILE.test(key)) return new Response('Not found', { status: 404 });

    // cacheTtl keeps the bundle in the colo's cache, saving KV reads.
    const bundle = await env.NEWS_DATA.get(BUNDLE_KEY, { type: 'arrayBuffer', cacheTtl: MAX_AGE_S });
    const value = bundle && readBundleEntry(new Uint8Array(bundle), key);
    if (!value) return new Response('Not found', { status: 404 });
    return respond(request, value, { maxAge: MAX_AGE_S, gzipped: false, etag: 'hash' });
  },
} satisfies ExportedHandler<Env>;
