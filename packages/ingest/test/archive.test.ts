import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Article, ArchiveDay, CountryFile, IndexFile } from '@news-globe/shared';
import { addRun, archiveFile, archiveRun, publishArchiveToKv } from '../src/archive';
import { buildCluster } from '../src/rank';
import { article } from './helpers';

const T1 = '2026-10-08T08:00:00.000Z';
const T2 = '2026-10-08T09:00:00.000Z';
const NOW = Date.parse(T2);
const cluster = (...arts: Article[]) => buildCluster(arts, (id) => (id === 'lemonde' ? 1 : 0), NOW, 24);

describe('addRun', () => {
  const budget = article('lemonde', 'Budget adopté', T1);
  const budgetFigaro = article('lefigaro', 'Le budget adopté', T1);
  const strike = article('liberation', 'Grève', T1);

  it('starts the day with one story per cluster, in rank order', () => {
    const day = addRun(null, { runAt: T1, units: [{ code: 'FR', clusters: [cluster(budget, budgetFigaro), cluster(strike)] }] });
    expect(day.date).toBe('2026-10-08');
    expect(day.stories).toHaveLength(2);
    expect(day.stories[0]).toMatchObject({
      unit: 'FR',
      title: 'Budget adopté',
      sources: ['lemonde', 'lefigaro'],
      firstSeen: T1,
      lastSeen: T1,
      bestRank: 1,
    });
    expect(day.runs).toEqual({ [T1]: { FR: [0, 1] } });
  });

  it('follows a story across runs through any shared article', () => {
    const first = addRun(null, { runAt: T1, units: [{ code: 'FR', clusters: [cluster(strike), cluster(budget)] }] });
    // Next hour: the budget story gains Le Figaro and moves to the top; the strike drops out.
    const second = addRun(first, { runAt: T2, units: [{ code: 'FR', clusters: [cluster(budgetFigaro, budget)] }] });
    expect(second.stories).toHaveLength(2);
    expect(second.stories[1]).toMatchObject({
      sources: ['lemonde', 'lefigaro'],
      firstSeen: T1,
      lastSeen: T2,
      bestRank: 1,
      peakOutlets: 2,
    });
    expect(second.stories[0]!.lastSeen).toBe(T1);
    expect(second.runs[T2]).toEqual({ FR: [1] });
    // The earlier day is left as it was.
    expect(first.stories[1]!.lastSeen).toBe(T1);
  });

  it('keeps the same story in two units apart', () => {
    const day = addRun(null, {
      runAt: T1,
      units: [
        { code: 'FR', clusters: [cluster(budget)] },
        { code: 'FR-IDF', clusters: [cluster(budget)] },
      ],
    });
    expect(day.stories.map((s) => s.unit)).toEqual(['FR', 'FR-IDF']);
  });

  it('starts a new record when one story splits into two clusters', () => {
    const first = addRun(null, { runAt: T1, units: [{ code: 'FR', clusters: [cluster(budget, budgetFigaro)] }] });
    const second = addRun(first, { runAt: T2, units: [{ code: 'FR', clusters: [cluster(budget), cluster(budgetFigaro)] }] });
    expect(second.runs[T2]).toEqual({ FR: [0, 1] });
    expect(second.stories).toHaveLength(2);
  });

  it('adds a run only once', () => {
    const run = { runAt: T1, units: [{ code: 'FR', clusters: [cluster(budget)] }] };
    const day = addRun(null, run);
    expect(addRun(day, run)).toBe(day);
  });

  it('starts a fresh day at midnight UTC', () => {
    const day = addRun(null, { runAt: T1, units: [{ code: 'FR', clusters: [cluster(budget)] }] });
    const next = addRun(day, { runAt: '2026-10-09T00:00:00.000Z', units: [{ code: 'FR', clusters: [cluster(budget)] }] });
    expect(next.date).toBe('2026-10-09');
    expect(next.stories).toHaveLength(1);
    expect(Object.keys(next.runs)).toEqual(['2026-10-09T00:00:00.000Z']);
  });
});

describe('archiveRun and publishArchiveToKv', () => {
  let dir: string;
  const cfg = { accountId: 'acc', namespaceId: 'ns', apiToken: 'tok' };
  const quiet = () => {};

  async function writeRun(runAt: string) {
    const fr: CountryFile = {
      schemaVersion: 1,
      countryCode: 'FR',
      countryName: 'France',
      updatedAt: runAt,
      clusters: [cluster(article('lemonde', 'Budget adopté', runAt))],
    };
    const index: IndexFile = {
      schemaVersion: 1,
      updatedAt: runAt,
      countries: [{ code: 'FR', name: 'France', updatedAt: runAt, clusterCount: 1 }],
      regions: [],
    };
    await mkdir(join(dir, 'countries'), { recursive: true });
    await writeFile(join(dir, 'countries', 'FR.json'), JSON.stringify(fr));
    await writeFile(join(dir, 'index.json'), JSON.stringify(index));
  }

  const readDay = async (date: string) =>
    JSON.parse(gunzipSync(await readFile(archiveFile(dir, date))).toString('utf8')) as ArchiveDay;

  const okFetch = () =>
    vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      new Response(JSON.stringify({ success: true, errors: [] }), { status: 200 }),
    );

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'news-globe-archive-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('appends each run to the day file', async () => {
    await writeRun(T1);
    expect(await archiveRun(dir)).toBe('2026-10-08');
    await writeRun(T2);
    await archiveRun(dir);
    const day = await readDay('2026-10-08');
    expect(Object.keys(day.runs)).toEqual([T1, T2]);
  });

  it('does nothing without an index', async () => {
    expect(await archiveRun(dir)).toBeNull();
  });

  it('uploads a changed day once, and retries yesterday after a failed upload', async () => {
    await writeRun('2026-10-07T23:00:00.000Z');
    await archiveRun(dir);

    const failing = vi.fn(async () => new Response(JSON.stringify({ success: false, errors: [{ message: 'nope' }] }), { status: 500 }));
    await expect(publishArchiveToKv(dir, cfg, { now: Date.parse('2026-10-07T23:00:00Z'), fetchImpl: failing, log: quiet })).rejects.toThrow(
      'KV write of archive/2026-10-07 failed: nope',
    );

    // After midnight: yesterday's file is retried and today's is uploaded.
    await writeRun('2026-10-08T00:00:00.000Z');
    await archiveRun(dir);
    const fetchImpl = okFetch();
    const opts = { now: Date.parse('2026-10-08T00:00:00Z'), fetchImpl, log: quiet };
    expect(await publishArchiveToKv(dir, cfg, opts)).toEqual(['2026-10-07', '2026-10-08']);
    expect(fetchImpl.mock.calls[1]![0]).toBe(
      'https://api.cloudflare.com/client/v4/accounts/acc/storage/kv/namespaces/ns/values/archive%2F2026-10-08',
    );

    // Nothing changed since: no writes.
    expect(await publishArchiveToKv(dir, cfg, opts)).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
