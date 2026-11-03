import { gunzipSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import type { ArchiveDay, CountryFile, IndexFile, SearchFile, TodayFile, TranslationsFile, TrendsFile } from '@news-globe/shared';
import { encodeBundle } from '@news-globe/shared/bundle';
import { archiveFromKv } from '../src/archive-remote';
import { buildCluster, coverage, round3 } from '../src/rank';
import { outletPools } from '../src/sources.config';
import { article } from './helpers';

const cfg = { accountId: 'acc', namespaceId: 'ns', apiToken: 'tok' };
const quiet = () => {};

function publishedBundle(runAt: string, activeOutlets?: number): Uint8Array {
  const fr: CountryFile = {
    schemaVersion: 1,
    countryCode: 'FR',
    countryName: 'France',
    updatedAt: runAt,
    clusters: [
      buildCluster([article('lemonde', 'Budget adopté', runAt), article('figaro', 'Budget adopté', runAt)], () => 0, Date.parse(runAt), 24),
    ],
  };
  const index: IndexFile = {
    schemaVersion: 1,
    updatedAt: runAt,
    countries: [{ code: 'FR', name: 'France', updatedAt: runAt, clusterCount: 1, ...(activeOutlets !== undefined && { activeOutlets }) }],
    regions: [],
  };
  return encodeBundle({ 'index.json': JSON.stringify(index), 'countries/FR.json': JSON.stringify(fr) });
}

/** A fake Workers KV REST API holding values in memory. */
function fakeKv(values: Map<string, Uint8Array>, failPut = new Set<string>()) {
  const calls: string[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const key = decodeURIComponent(String(input).split('/values/')[1]!);
    calls.push(`${init?.method ?? 'GET'} ${key}`);
    if (init?.method === 'PUT' && failPut.has(key)) {
      return new Response(JSON.stringify({ success: false, errors: [{ message: 'boom' }] }), { status: 500 });
    }
    if (init?.method === 'PUT') {
      values.set(key, new Uint8Array(init.body as Uint8Array));
      return new Response(JSON.stringify({ success: true, errors: [] }), { status: 200 });
    }
    const value = values.get(key);
    return value ? new Response(value) : new Response('not found', { status: 404 });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

const day = (values: Map<string, Uint8Array>, date: string) =>
  JSON.parse(gunzipSync(values.get(`archive/${date}`)!).toString('utf8')) as ArchiveDay;

describe('archiveFromKv', () => {
  it('adds the published run to its day, once', async () => {
    const values = new Map([['bundle', publishedBundle('2026-10-08T09:00:00.000Z')]]);
    const kv = fakeKv(values);

    expect(await archiveFromKv(cfg, { fetchImpl: kv.fetchImpl, log: quiet })).toBe('archived');
    expect(Object.keys(day(values, '2026-10-08').runs)).toEqual(['2026-10-08T09:00:00.000Z']);
    expect(day(values, '2026-10-08').stories[0]).toMatchObject({ unit: 'FR', title: 'Budget adopté' });

    // Trends, search and Today for the same run, gzipped beside it.
    const trends = JSON.parse(gunzipSync(values.get('trends')!).toString('utf8')) as TrendsFile;
    expect(trends.runAt).toBe('2026-10-08T09:00:00.000Z');
    expect(Object.keys(trends.units)).toEqual(['FR']);
    const search = JSON.parse(gunzipSync(values.get('search')!).toString('utf8')) as SearchFile;
    expect(search.items).toEqual([['FR', 'Budget adopté', 2]]);
    const today = JSON.parse(gunzipSync(values.get('today')!).toString('utf8')) as TodayFile;
    expect(today.top.map((s) => s.title)).toEqual(['Budget adopté']);

    // Same run again (the workflow ran before the next ingest): no write.
    kv.calls.length = 0;
    expect(await archiveFromKv(cfg, { fetchImpl: kv.fetchImpl, log: quiet })).toBe('already-archived');
    expect(kv.calls.filter((c) => c.startsWith('PUT'))).toEqual([]);
  });

  it('measures Today against the outlets the index says were active, else the configured ones', async () => {
    const runAt = '2026-10-08T09:00:00.000Z';
    const today = async (activeOutlets?: number) => {
      const values = new Map([['bundle', publishedBundle(runAt, activeOutlets)]]);
      await archiveFromKv(cfg, { fetchImpl: fakeKv(values).fetchImpl, log: quiet });
      return (JSON.parse(gunzipSync(values.get('today')!).toString('utf8')) as TodayFile).top[0]!;
    };
    // France's story is on 2 outlets: of the 2 that published, or of all its configured ones.
    expect((await today(2)).coverage).toBe(round3(coverage(2, 2)));
    expect((await today()).coverage).toBe(round3(coverage(2, outletPools().get('FR'))));
  });

  it('publishes translations with a translator, remembering them for the next run', async () => {
    const values = new Map([['bundle', publishedBundle('2026-10-08T09:00:00.000Z')]]);
    const kv = fakeKv(values);
    const translator = vi.fn(async (texts: string[]) => texts.map((t) => `EN:${t}`));
    await archiveFromKv(cfg, { fetchImpl: kv.fetchImpl, log: quiet, translator });

    const file = JSON.parse(gunzipSync(values.get('translations')!).toString('utf8')) as TranslationsFile;
    expect(file.items).toEqual({ 'Budget adopté': 'EN:Budget adopté' });
    expect(values.has('translate-cache')).toBe(true);

    // The next run's headline is already known: nothing is sent.
    translator.mockClear();
    values.set('bundle', publishedBundle('2026-10-08T10:00:00.000Z'));
    await archiveFromKv(cfg, { fetchImpl: kv.fetchImpl, log: quiet, translator });
    expect(translator).not.toHaveBeenCalled();
  });

  it('archives the day even when a derived upload fails, and a retry rebuilds what is derived', async () => {
    const values = new Map([['bundle', publishedBundle('2026-10-08T09:00:00.000Z')]]);
    const failPut = new Set(['today']);
    await expect(archiveFromKv(cfg, { fetchImpl: fakeKv(values, failPut).fetchImpl, log: quiet })).rejects.toThrow(/today/);
    expect(Object.keys(day(values, '2026-10-08').runs)).toEqual(['2026-10-08T09:00:00.000Z']);

    failPut.clear();
    const kv = fakeKv(values);
    expect(await archiveFromKv(cfg, { fetchImpl: kv.fetchImpl, log: quiet })).toBe('archived');
    expect(values.has('today')).toBe(true);
    // The day already held the run: it isn't uploaded again.
    expect(kv.calls).not.toContain('PUT archive/2026-10-08');
    expect(Object.keys(day(values, '2026-10-08').runs)).toEqual(['2026-10-08T09:00:00.000Z']);
  });

  it('publishes Today even when the translation step fails', async () => {
    const values = new Map([
      ['bundle', publishedBundle('2026-10-08T09:00:00.000Z')],
      ['translate-cache', new Uint8Array([1, 2, 3])], // not gzip
    ]);
    const translator = async (texts: string[]) => texts;
    expect(await archiveFromKv(cfg, { fetchImpl: fakeKv(values).fetchImpl, log: quiet, translator })).toBe('archived');
    expect(values.has('today')).toBe(true);
    expect(values.has('translations')).toBe(false);
  });

  it('records the characters sent before publishing the translations', async () => {
    const values = new Map([['bundle', publishedBundle('2026-10-08T09:00:00.000Z')]]);
    const kv = fakeKv(values);
    await archiveFromKv(cfg, { fetchImpl: kv.fetchImpl, log: quiet, translator: async (texts) => texts });
    const puts = kv.calls.filter((c) => c.startsWith('PUT'));
    expect(puts.indexOf('PUT translate-cache')).toBeLessThan(puts.indexOf('PUT translations'));
  });

  it('publishes no translations without a translator', async () => {
    const values = new Map([['bundle', publishedBundle('2026-10-08T09:00:00.000Z')]]);
    await archiveFromKv(cfg, { fetchImpl: fakeKv(values).fetchImpl, log: quiet });
    expect(values.has('translations')).toBe(false);
  });

  it('appends a later run to the same day', async () => {
    const values = new Map([['bundle', publishedBundle('2026-10-08T09:00:00.000Z')]]);
    const kv = fakeKv(values);
    await archiveFromKv(cfg, { fetchImpl: kv.fetchImpl, log: quiet });
    values.set('bundle', publishedBundle('2026-10-08T10:00:00.000Z'));
    await archiveFromKv(cfg, { fetchImpl: kv.fetchImpl, log: quiet });
    expect(Object.keys(day(values, '2026-10-08').runs)).toEqual(['2026-10-08T09:00:00.000Z', '2026-10-08T10:00:00.000Z']);
  });

  it('does nothing before anything is published', async () => {
    const kv = fakeKv(new Map());
    expect(await archiveFromKv(cfg, { fetchImpl: kv.fetchImpl, log: quiet })).toBe('nothing-published');
  });
});
