import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION, type ClusterTrend, type IndexEntry, type TrendsFile } from '@news-globe/shared';
import { COUNTRY_HEAT, HEAT_STEPS, heatStep, PULSE_MAX, pulsesFrom, REGION_HEAT } from '../src/lib/heat';

describe('heatStep', () => {
  it('maps outlet counts to the five steps, 5+ in the top one', () => {
    expect([0, 1, 2, 3, 4, 5, 9].map(heatStep)).toEqual([0, 0, 1, 2, 3, 4, 4]);
  });

  it('puts an index without counts in the first step', () => {
    expect(heatStep(undefined)).toBe(0);
  });

  it('has a colour for every step', () => {
    expect(COUNTRY_HEAT).toHaveLength(HEAT_STEPS.length);
    expect(REGION_HEAT).toHaveLength(HEAT_STEPS.length);
  });
});

describe('pulsesFrom', () => {
  const trend = (ranks: (number | null)[], state: ClusterTrend['state']): ClusterTrend => ({ ranks, firstSeen: '2026-10-09T08:00:00Z', state });
  const entry = (code: string, topOutlets: number): [string, IndexEntry] => [
    code,
    { code, name: code, updatedAt: '2026-10-09T10:00:00Z', clusterCount: 3, topOutlets },
  ];
  const trends = (units: TrendsFile['units']): TrendsFile => ({ schemaVersion: SCHEMA_VERSION, runAt: '2026-10-09T10:00:00Z', runs: [], units, change: {} });

  it('pulses countries whose #1 is new or rising and covered by 2+ outlets, best-covered first', () => {
    const units = {
      FR: { a: trend([4, 1], 'rising'), b: trend([1, 2], null) },
      DE: { c: trend([null, 1], 'new') },
      IT: { d: trend([1, 1], null), e: trend([null, 2], 'new') }, // the new story isn't #1
      ES: { f: trend([null, 1], 'new') }, // a single outlet
      'FR-IDF': { g: trend([null, 1], 'new') }, // regions don't pulse
    };
    const entries = new Map([entry('FR', 3), entry('DE', 6), entry('IT', 9), entry('ES', 1), entry('FR-IDF', 4)]);
    expect(pulsesFrom(trends(units), entries)).toEqual([
      { code: 'DE', lat: 51.2, lng: 10.4, state: 'new', outlets: 6 },
      { code: 'FR', lat: 46.6, lng: 2.4, state: 'rising', outlets: 3 },
    ]);
  });

  it('keeps the globe calm: at most PULSE_MAX pulses', () => {
    const codes = ['FR', 'DE', 'IT', 'ES', 'GB', 'US', 'CA', 'BR', 'JP', 'IN', 'AU', 'MX'];
    const units = Object.fromEntries(codes.map((c) => [c, { x: trend([null, 1], 'new') }]));
    const entries = new Map(codes.map((c, i) => entry(c, 2 + i)));
    const pulses = pulsesFrom(trends(units), entries);
    expect(pulses).toHaveLength(PULSE_MAX);
    expect(pulses[0]!.code).toBe('MX');
  });
});
