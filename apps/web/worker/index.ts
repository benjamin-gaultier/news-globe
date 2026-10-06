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
const PUBLIC_KEY = /^(index\.json|countries\/[A-Z]{2}\.json)$/;

/** Browsers/CDN may reuse a response for a minute; the ingest only runs every 15. */
const MAX_AGE_S = 60;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/data/')) return env.ASSETS.fetch(request);
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
    }

    const key = url.pathname.slice('/data/'.length);
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
