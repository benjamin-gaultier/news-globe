import { describe, expect, it } from 'vitest';
import { buildStatus } from '../src/health';
import type { SourceConfig } from '../src/sources.config';

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
