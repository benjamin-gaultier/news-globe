import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StatusFile } from '@news-globe/shared';
import { buildStatus, writeStatus } from '../src/health';
import { SOURCES, type SourceConfig } from '../src/sources.config';

const source = (id: string, country: string, feedUrls: string[], region?: string): SourceConfig => ({
  id,
  name: id,
  type: 'rss',
  country,
  language: 'fr',
  feedUrls,
  authority: 1,
  region,
});

const T0 = '2026-10-08T06:00:00.000Z';
const T1 = '2026-10-08T07:00:00.000Z';
const T2 = '2026-10-08T08:00:00.000Z';
const ok = (at: string) => ({ lastAttemptAt: at, retrievedAt: at, lastStatus: 200 });
const failed = (at: string, lastOk: string | undefined, status: number | string) => ({
  lastAttemptAt: at,
  retrievedAt: lastOk,
  lastStatus: status,
});

describe('buildStatus', () => {
  const sources = [
    source('lemonde', 'FR', ['https://lemonde/a', 'https://lemonde/b']),
    source('ouestfrance', 'FR', ['https://of/bre'], 'FR-BRE'),
    source('telegramme', 'FR', ['https://tlg/bre'], 'FR-BRE'),
    source('lesoir', 'BE', ['https://lesoir/a']),
    source('newone', 'CH', ['https://new/a']),
  ];

  it('lists failing feeds, never-worked and longest failing first', () => {
    const status = buildStatus(
      {
        'https://lemonde/a': ok(T2),
        'https://lemonde/b': failed(T2, T1, 503),
        'https://of/bre': failed(T2, T0, 'The operation was aborted due to timeout'),
        'https://tlg/bre': failed(T2, undefined, 403),
        'https://lesoir/a': ok(T2),
      },
      sources,
      T2,
    );
    expect(status.feeds.total).toBe(6);
    expect(status.feeds.failing.map((f) => [f.source, f.unit, f.lastStatus, f.lastOkAt])).toEqual([
      ['telegramme', 'FR-BRE', 403, null],
      ['ouestfrance', 'FR-BRE', 'The operation was aborted due to timeout', T0],
      ['lemonde', 'FR', 503, T1],
    ]);
  });

  it('marks a unit dark only when every requested feed fails', () => {
    const status = buildStatus(
      {
        'https://lemonde/a': ok(T2),
        'https://lemonde/b': failed(T2, T1, 503),
        'https://of/bre': failed(T2, T0, 500),
        'https://tlg/bre': failed(T2, undefined, 403),
      },
      sources,
      T2,
    );
    // FR still has a working feed; BE and CH were never requested (new or not yet polled).
    expect(status.darkUnits).toEqual([{ code: 'FR-BRE', since: T0 }]);
  });

  it('counts a 200 whose body failed to parse as failing', () => {
    const status = buildStatus({ 'https://lesoir/a': failed(T2, T1, 200) }, sources, T2);
    expect(status.feeds.failing).toEqual([{ source: 'lesoir', unit: 'BE', url: 'https://lesoir/a', lastStatus: 200, lastOkAt: T1 }]);
    expect(status.darkUnits).toEqual([{ code: 'BE', since: T1 }]);
  });
});

describe('writeStatus', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'news-globe-health-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('writes status.json from the HTTP cache the run left behind', async () => {
    const [first] = SOURCES.filter((s) => s.type === 'rss');
    const url = first!.feedUrls[0]!;
    await mkdir(join(dir, '.cache'));
    await writeFile(join(dir, '.cache', 'http.json'), JSON.stringify({ version: 1, entries: { [url]: failed(T2, T0, 503) } }));
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await writeStatus(dir, T2);

    const status = JSON.parse(await readFile(join(dir, 'status.json'), 'utf8')) as StatusFile;
    expect(status.updatedAt).toBe(T2);
    expect(status.feeds.failing).toEqual([
      { source: first!.id, unit: first!.region ?? first!.country, url, lastStatus: 503, lastOkAt: T0 },
    ]);
    expect(status.feeds.total).toBe(SOURCES.filter((s) => s.type === 'rss').reduce((n, s) => n + s.feedUrls.length, 0));
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/^\[status\] 1\/\d+ feeds failing/));
  });

  it('logs instead of throwing when there is no cache yet', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(writeStatus(dir, T2)).resolves.toBeUndefined();

    expect(error).toHaveBeenCalledWith('[status] failed:', expect.stringContaining('ENOENT'));
    await expect(readFile(join(dir, 'status.json'))).rejects.toThrow();
  });
});
