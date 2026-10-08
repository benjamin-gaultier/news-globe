import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import type { ArchiveDay, CountryFile, IndexFile } from '@news-globe/shared';
import { encodeBundle } from '@news-globe/shared/bundle';
import { archiveFromKv } from '../src/archive-remote';
import { buildCluster } from '../src/rank';
import { article } from './helpers';

const cfg = { accountId: 'acc', namespaceId: 'ns', apiToken: 'tok' };
const quiet = () => {};

function publishedBundle(runAt: string): Uint8Array {
  const fr: CountryFile = {
    schemaVersion: 1,
    countryCode: 'FR',
    countryName: 'France',
    updatedAt: runAt,
    clusters: [buildCluster([article('lemonde', 'Budget adopté', runAt)], () => 0, Date.parse(runAt), 24)],
  };
  const index: IndexFile = {
    schemaVersion: 1,
    updatedAt: runAt,
    countries: [{ code: 'FR', name: 'France', updatedAt: runAt, clusterCount: 1 }],
    regions: [],
  };
  return encodeBundle({ 'index.json': JSON.stringify(index), 'countries/FR.json': JSON.stringify(fr) });
}

/** A fake Workers KV REST API holding values in memory. */
function fakeKv(values: Map<string, Uint8Array>) {
  const calls: string[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const key = decodeURIComponent(String(input).split('/values/')[1]!);
    calls.push(`${init?.method ?? 'GET'} ${key}`);
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

    // Same run again (the workflow ran before the next ingest): no write.
    kv.calls.length = 0;
    expect(await archiveFromKv(cfg, { fetchImpl: kv.fetchImpl, log: quiet })).toBe('already-archived');
    expect(kv.calls.filter((c) => c.startsWith('PUT'))).toEqual([]);
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
