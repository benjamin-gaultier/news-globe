/**
 * Cloudflare Worker for news-globe.
 *
 * Static files (the Vite build in ../dist) are served by Workers Static Assets
 * without invoking this code. Only /data/* reaches the Worker (see
 * `run_worker_first` in wrangler.jsonc): those files are sliced out of the
 * bundle the ingest worker writes to the NEWS_DATA KV namespace after each run
 * (one KV value for all files; see @news-globe/shared/bundle).
 */

import { archiveKey, BUNDLE_KEY, KV_KEYS, readBundleEntry } from '@news-globe/shared/bundle';

interface Env {
  NEWS_DATA: KVNamespace;
  ASSETS: Fetcher;
}

// Same public contract as the Vite dev plugin: nothing else in KV is reachable.
const PUBLIC_KEY = /^(index\.json|status\.json|countries\/[A-Z]{2}\.json|regions\/[A-Z]{2}-[A-Z0-9]{1,3}\.json)$/;

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
const DERIVED: Record<string, string> = Object.fromEntries(
  [KV_KEYS.trends, KV_KEYS.search, KV_KEYS.today, KV_KEYS.translations].map((k) => [`${k}.json`, k]),
);

/** A weak validator from the body's hash: a browser revalidating after max-age gets a 304 when nothing changed. */
async function etagOf(body: ArrayBuffer | Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', body));
  return `W/"${[...digest.subarray(0, 12)].map((b) => b.toString(16).padStart(2, '0')).join('')}"`;
}

/** A JSON file, gzipped when stored that way (sent as stored: the browser inflates it, the Worker never does). */
async function respond(
  request: Request,
  body: ArrayBuffer | Uint8Array,
  opts: { maxAge: number; gzipped: boolean },
): Promise<Response> {
  const etag = await etagOf(body);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': `public, max-age=${opts.maxAge}`,
    ETag: etag,
    'Access-Control-Allow-Origin': '*',
    'X-Content-Type-Options': 'nosniff',
  };
  if (opts.gzipped) headers['Content-Encoding'] = 'gzip';
  const known = request.headers.get('If-None-Match');
  if (known && known.split(',').some((tag) => tag.trim() === etag || tag.trim() === '*')) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(request.method === 'HEAD' ? null : body, { headers, ...(opts.gzipped && { encodeBody: 'manual' as const }) });
}

/** A gzipped KV value under its own key. */
async function serveGzipped(request: Request, env: Env, kvKey: string, maxAge: number): Promise<Response> {
  const gzipped = await env.NEWS_DATA.get(kvKey, { type: 'arrayBuffer', cacheTtl: maxAge });
  if (gzipped === null) return new Response('Not found', { status: 404 });
  return respond(request, gzipped, { maxAge, gzipped: true });
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
      return serveGzipped(request, env, archiveKey(date), date < yesterday ? PAST_DAY_MAX_AGE_S : MAX_AGE_S);
    }
    if (Object.hasOwn(DERIVED, key)) return serveGzipped(request, env, DERIVED[key]!, MAX_AGE_S);
    if (!PUBLIC_KEY.test(key)) return new Response('Not found', { status: 404 });

    // cacheTtl keeps the bundle in the colo's cache, saving KV reads.
    const bundle = await env.NEWS_DATA.get(BUNDLE_KEY, { type: 'arrayBuffer', cacheTtl: MAX_AGE_S });
    const value = bundle && readBundleEntry(new Uint8Array(bundle), key);
    if (!value) return new Response('Not found', { status: 404 });
    return respond(request, value, { maxAge: MAX_AGE_S, gzipped: false });
  },
} satisfies ExportedHandler<Env>;
