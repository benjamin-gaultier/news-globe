import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BUNDLE_KEY, encodeBundle } from '@news-globe/shared/bundle';
import worker from '../worker/index';

type Stored = Record<string, string | Uint8Array>;

/** A KV namespace holding `values`, recording every read. */
function kv(values: Stored) {
  const get = vi.fn(async (key: string, opts: { type: 'arrayBuffer' | 'stream'; cacheTtl?: number }) => {
    const value = values[key];
    if (value === undefined) return null;
    const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
    if (opts.type === 'stream') return new Response(bytes).body;
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  });
  return { get };
}

function env(values: Stored = {}) {
  const NEWS_DATA = kv(values);
  const ASSETS = { fetch: vi.fn(async () => new Response('<html>app</html>')) };
  return { NEWS_DATA, ASSETS };
}

const call = (path: string, e: ReturnType<typeof env>, method = 'GET') =>
  worker.fetch(new Request(`https://globe.example${path}`, { method }), e as unknown as Parameters<typeof worker.fetch>[1]);

const bundled = (files: Record<string, string>) => env({ [BUNDLE_KEY]: encodeBundle(files) });

describe('worker', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-08T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('hands everything outside /data/ to the static assets', async () => {
    const e = env();
    const res = await call('/countries/FR', e);
    expect(await res.text()).toBe('<html>app</html>');
    expect(e.ASSETS.fetch).toHaveBeenCalledOnce();
    expect(e.NEWS_DATA.get).not.toHaveBeenCalled();
  });

  it('serves a public file sliced out of the bundle', async () => {
    const e = bundled({ 'index.json': '{"i":1}', 'countries/FR.json': '{"fr":1}', 'regions/FR-BRE.json': '{"bre":1}' });

    const res = await call('/data/countries/FR.json', e);

    expect(res.status).toBe(200);
    expect(await res.text()).toBe('{"fr":1}');
    expect(res.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=60');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(e.NEWS_DATA.get).toHaveBeenCalledWith(BUNDLE_KEY, { type: 'arrayBuffer', cacheTtl: 60 });

    expect(await (await call('/data/regions/FR-BRE.json', e)).text()).toBe('{"bre":1}');
    expect(await (await call('/data/index.json', e)).text()).toBe('{"i":1}');
  });

  it('404s a public path the bundle does not hold', async () => {
    const res = await call('/data/countries/DE.json', bundled({ 'index.json': '{}' }));
    expect(res.status).toBe(404);
  });

  it.each([
    '/data/.cache/http.json',
    '/data/bundle',
    '/data/countries/fr.json',
    '/data/countries/FR.json.bak',
    '/data/countries%2F..%2F.cache%2Fhttp.json',
    '/data/regions/FR-TOOLONG.json',
    '/data/archive/2026-10-08.json.gz',
  ])('never reads KV for a non-public path: %s', async (path) => {
    const e = bundled({ 'index.json': '{}' });
    const res = await call(path, e);
    expect(res.status).toBe(404);
    expect(e.NEWS_DATA.get).not.toHaveBeenCalled();
  });

  it('rejects methods other than GET and HEAD', async () => {
    const e = bundled({ 'index.json': '{}' });
    const res = await call('/data/index.json', e, 'POST');
    expect(res.status).toBe(405);
    expect(res.headers.get('Allow')).toBe('GET, HEAD');
    expect(e.NEWS_DATA.get).not.toHaveBeenCalled();
  });

  it('answers HEAD with headers only', async () => {
    const res = await call('/data/index.json', bundled({ 'index.json': '{"i":1}' }), 'HEAD');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
    expect(res.body).toBeNull();
  });

  it('404s everything public before the first bundle is written', async () => {
    expect((await call('/data/index.json', env())).status).toBe(404);
  });

  describe('revalidation', () => {
    const get = (path: string, e: ReturnType<typeof env>, etag: string) =>
      worker.fetch(
        new Request(`https://globe.example${path}`, { headers: { 'If-None-Match': etag } }),
        e as unknown as Parameters<typeof worker.fetch>[1],
      );

    it('answers 304 when the file is unchanged, and the new file when it changed', async () => {
      const e = bundled({ 'index.json': '{"i":1}' });
      const etag = (await call('/data/index.json', e)).headers.get('ETag')!;
      expect(etag).toMatch(/^W\/"[0-9a-f]{24}"$/);

      const same = await get('/data/index.json', e, etag);
      expect(same.status).toBe(304);
      expect(same.body).toBeNull();
      expect(same.headers.get('ETag')).toBe(etag);
      expect(same.headers.get('Cache-Control')).toBe('public, max-age=60');

      const changed = await get('/data/index.json', bundled({ 'index.json': '{"i":2}' }), etag);
      expect(changed.status).toBe(200);
      expect(await changed.text()).toBe('{"i":2}');
    });

    it('gives each file of the bundle its own validator', async () => {
      const e = bundled({ 'index.json': '{"i":1}', 'countries/FR.json': '{"fr":1}' });
      const index = (await call('/data/index.json', e)).headers.get('ETag');
      const fr = (await call('/data/countries/FR.json', e)).headers.get('ETag');
      expect(index).not.toBe(fr);
    });

    it('revalidates gzipped files too', async () => {
      const e = env({ today: new Uint8Array([0x1f, 0x8b, 8, 0]) });
      const etag = (await call('/data/today.json', e)).headers.get('ETag')!;
      const res = await get('/data/today.json', e, `W/"other", ${etag}`);
      expect(res.status).toBe(304);
      expect(res.headers.get('Content-Encoding')).toBe('gzip');
    });

    it('gives a finished day a validator from its date, and answers 304 without reading KV', async () => {
      const e = env({ 'archive/2026-10-06': new Uint8Array([0x1f, 0x8b]) });
      const etag = (await call('/data/archive/2026-10-06.json', e)).headers.get('ETag')!;
      expect(etag).toBe('W/"archive-v1-2026-10-06"');

      e.NEWS_DATA.get.mockClear();
      const res = await get('/data/archive/2026-10-06.json', e, etag);
      expect(res.status).toBe(304);
      expect(res.headers.get('Cache-Control')).toBe('public, max-age=86400');
      expect(e.NEWS_DATA.get).not.toHaveBeenCalled();
    });

    it('answers If-None-Match: * for a past day only once the day is known to exist', async () => {
      expect((await get('/data/archive/1990-01-01.json', env(), '*')).status).toBe(404);
      const e = env({ 'archive/2026-10-06': new Uint8Array([0x1f, 0x8b]) });
      expect((await get('/data/archive/2026-10-06.json', e, '*')).status).toBe(304);
    });

    it('gives today and yesterday no validator, as they still grow', async () => {
      for (const date of ['2026-10-07', '2026-10-08']) {
        const res = await call(`/data/archive/${date}.json`, env({ [`archive/${date}`]: new Uint8Array([0x1f, 0x8b]) }));
        expect(res.status).toBe(200);
        expect(res.headers.get('ETag')).toBeNull();
      }
    });
  });

  describe('derived files', () => {
    const gz = new Uint8Array([0x1f, 0x8b, 8, 0, 0, 0, 0, 0, 0, 3, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

    it('serves trends.json and search.json gzipped from their own keys', async () => {
      for (const [path, key] of [
        ['/data/trends.json', 'trends'],
        ['/data/search.json', 'search'],
      ] as const) {
        const e = env({ [key]: gz });
        const res = await call(path, e);
        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Encoding')).toBe('gzip');
        expect(res.headers.get('Cache-Control')).toBe('public, max-age=60');
        expect(new Uint8Array(await res.arrayBuffer())).toEqual(gz);
        expect(e.NEWS_DATA.get).toHaveBeenCalledWith(key, expect.objectContaining({ type: 'arrayBuffer' }));
      }
    });

    it('404s before the workflow has written them', async () => {
      expect((await call('/data/trends.json', env())).status).toBe(404);
    });

    it('never exposes other KV keys', async () => {
      expect((await call('/data/trends', env({ trends: gz }))).status).toBe(404);
      expect((await call('/data/bundle', env({ bundle: gz }))).status).toBe(404);
    });
  });

  describe('archive', () => {
    const gz = new Uint8Array([0x1f, 0x8b, 8, 0, 1, 2, 3]);

    it('sends a past day gzipped as stored, cached for a day', async () => {
      const e = env({ 'archive/2026-10-06': gz });

      const res = await call('/data/archive/2026-10-06.json', e);

      expect(res.status).toBe(200);
      expect(new Uint8Array(await res.arrayBuffer())).toEqual(gz);
      expect(res.headers.get('Content-Encoding')).toBe('gzip');
      expect(res.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
      expect(res.headers.get('Cache-Control')).toBe('public, max-age=86400');
      expect(e.NEWS_DATA.get).toHaveBeenCalledWith('archive/2026-10-06', { type: 'arrayBuffer', cacheTtl: 86_400 });
    });

    it('caches yesterday for a minute only, since its last run can be archived after midnight', async () => {
      const e = env({ 'archive/2026-10-07': gz });
      const res = await call('/data/archive/2026-10-07.json', e);
      expect(res.headers.get('Cache-Control')).toBe('public, max-age=60');
      expect(e.NEWS_DATA.get).toHaveBeenCalledWith('archive/2026-10-07', { type: 'arrayBuffer', cacheTtl: 60 });
    });

    it('caches today for a minute only, since it still grows', async () => {
      const e = env({ 'archive/2026-10-08': gz });
      const res = await call('/data/archive/2026-10-08.json', e);
      expect(res.headers.get('Cache-Control')).toBe('public, max-age=60');
      expect(e.NEWS_DATA.get).toHaveBeenCalledWith('archive/2026-10-08', { type: 'arrayBuffer', cacheTtl: 60 });
    });

    it('404s a day with no archive', async () => {
      expect((await call('/data/archive/2026-01-01.json', env())).status).toBe(404);
    });

    it('answers HEAD with headers only', async () => {
      const res = await call('/data/archive/2026-10-07.json', env({ 'archive/2026-10-07': gz }), 'HEAD');
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Encoding')).toBe('gzip');
      expect(res.body).toBeNull();
    });
  });
});
