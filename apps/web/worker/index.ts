/**
 * Cloudflare Worker for news-globe.
 *
 * Static files (the Vite build in ../dist) are served by Workers Static Assets
 * without invoking this code. Only /data/* reaches the Worker (see
 * `run_worker_first` in wrangler.jsonc): those files are sliced out of the
 * bundle the ingest worker writes to the NEWS_DATA KV namespace after each run
 * (one KV value for all files; see @news-globe/shared/bundle).
 */

import { BUNDLE_KEY, readBundleEntry } from '@news-globe/shared/bundle';

interface Env {
  NEWS_DATA: KVNamespace;
  ASSETS: Fetcher;
}

// Same public contract as the Vite dev plugin: nothing else in KV is reachable.
const PUBLIC_KEY = /^(index\.json|status\.json|countries\/[A-Z]{2}\.json|regions\/[A-Z]{2}-[A-Z0-9]{1,3}\.json)$/;

/** Browsers/CDN may reuse a response for a minute; the ingest only runs every 15. */
const MAX_AGE_S = 60;

/** History: `/data/archive/YYYY-MM-DD.json`, stored gzipped in KV as `archive/YYYY-MM-DD`. */
const ARCHIVE_KEY = /^archive\/(\d{4}-\d{2}-\d{2})\.json$/;
/** A finished day never changes; today's file grows every run. */
const PAST_DAY_MAX_AGE_S = 86_400;

/** Files the hourly workflow derives (packages/ingest/src/derived.ts), stored gzipped under their own KV key. */
const DERIVED: Record<string, string> = {
  'trends.json': 'trends',
  'search.json': 'search',
  'today.json': 'today',
  'translations.json': 'translations',
};

/** A gzipped KV value, sent as stored: the browser inflates it, the Worker never does. */
async function serveGzipped(env: Env, kvKey: string, maxAge: number, head: boolean): Promise<Response> {
  const gzipped = await env.NEWS_DATA.get(kvKey, { type: 'arrayBuffer', cacheTtl: maxAge });
  if (gzipped === null) return new Response('Not found', { status: 404 });
  return new Response(head ? null : gzipped, {
    encodeBody: 'manual',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Encoding': 'gzip',
      'Cache-Control': `public, max-age=${maxAge}`,
      'Access-Control-Allow-Origin': '*',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/data/')) return env.ASSETS.fetch(request);
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
    }

    const key = url.pathname.slice('/data/'.length);
    const head = request.method === 'HEAD';
    const archive = ARCHIVE_KEY.exec(key);
    if (archive) {
      const date = archive[1]!;
      const today = new Date().toISOString().slice(0, 10);
      return serveGzipped(env, `archive/${date}`, date < today ? PAST_DAY_MAX_AGE_S : MAX_AGE_S, head);
    }
    if (Object.hasOwn(DERIVED, key)) return serveGzipped(env, DERIVED[key]!, MAX_AGE_S, head);
    if (!PUBLIC_KEY.test(key)) return new Response('Not found', { status: 404 });

    // cacheTtl keeps the bundle in the colo's cache, saving KV reads.
    const bundle = await env.NEWS_DATA.get(BUNDLE_KEY, { type: 'arrayBuffer', cacheTtl: MAX_AGE_S });
    // Before the first bundle was written, files were stored one key each; fall back to those.
    const value = bundle
      ? readBundleEntry(new Uint8Array(bundle), key)
      : await env.NEWS_DATA.get(key, { type: 'stream', cacheTtl: MAX_AGE_S });
    if (value === null) return new Response('Not found', { status: 404 });

    return new Response(request.method === 'HEAD' ? null : value, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': `public, max-age=${MAX_AGE_S}`,
        'Access-Control-Allow-Origin': '*',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  },
} satisfies ExportedHandler<Env>;
