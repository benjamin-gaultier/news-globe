import { describe, expect, it } from 'vitest';
import type { StoryCluster } from '@news-globe/shared';
import { buildCluster } from '../src/rank';
import { priorSweep, rankingReport, spearman } from '../src/ranking-report';
import { article } from './helpers';

const T = '2026-10-08T12:00:00.000Z';
const story = (code: string, title: string, outlets: number): StoryCluster => ({
  ...buildCluster([article(`outlet-${code}-${title}`, title, T)], () => 0, Date.parse(T), 24),
  outletCount24h: outlets,
});

describe('spearman', () => {
  it('is 1 for the same order, −1 for the reverse and 0 for none', () => {
    expect(spearman([1, 2, 3, 4], [10, 20, 30, 40])).toBe(1);
    expect(spearman([1, 2, 3, 4], [4, 3, 2, 1])).toBe(-1);
    expect(spearman([1, 2, 3], [5, 5, 5])).toBe(0);
  });
});

describe('rankingReport', () => {
  it('shows a country with many feeds losing the top spot to one whose whole press carries its story', () => {
    const pools = new Map([
      ['NL', 8],
      ['LT', 3],
    ]);
    const report = rankingReport(
      [
        { code: 'NL', clusters: [story('NL', 'Dutch budget', 4)] },
        { code: 'LT', clusters: [story('LT', 'Lithuanian strike', 3)] },
      ],
      [],
      pools,
      T,
    );
    const before = report.slice(report.indexOf('**Before'), report.indexOf('**After'));
    const after = report.slice(report.indexOf('**After'));
    expect(before.indexOf('Dutch budget')).toBeLessThan(before.indexOf('Lithuanian strike'));
    expect(after.indexOf('Lithuanian strike')).toBeLessThan(after.indexOf('Dutch budget'));
    expect(report).toContain('| 3 | 1 (50%) |');
  });
});

describe('rankingReport and priorSweep with active pools', () => {
  // NL has 8 feeds configured, but only 4 published this run: its story on all 4 is
  // measured against those, while the tables still group NL by its 8 configured feeds.
  const units = [
    { code: 'NL', clusters: [story('NL', 'Dutch budget', 4)] },
    { code: 'LT', clusters: [story('LT', 'Lithuanian strike', 3)] },
  ];
  const pools = new Map([
    ['NL', 8],
    ['LT', 3],
  ]);
  const active = new Map([
    ['NL', 4],
    ['LT', 3],
  ]);

  it('measures coverage against the active outlets and groups countries by the configured ones', () => {
    const report = rankingReport(units, [], pools, T, active);
    const after = report.slice(report.indexOf('**After'));
    expect(after).toContain('| 1 | Dutch budget | NL 4/8 | 4 | 0.86 |');
    expect(after).toContain('| 2 | Lithuanian strike | LT 3/3 | 3 | 0.80 |');
    expect(report).toContain('| 7–8 | 1 (50%) |');
    expect(report).toContain('- by coverage (after): **1.00**');
  });

  it('sweeps priors the same way', () => {
    const sweep = priorSweep(units, [], pools, T, [0.5], active);
    expect(sweep).toContain('all 2 countries (mean feeds 5.5)');
    expect(sweep).toContain('| coverage, prior 0.5 | 1.00 |');
  });
});

describe('rankingReport with nothing to rank', () => {
  it('throws rather than printing an empty report', () => {
    expect(() => rankingReport([], [], new Map(), T)).toThrow('no national stories');
    expect(() => priorSweep([], [], new Map(), T, [1])).toThrow('no national stories');
  });
});

describe('priorSweep', () => {
  it('gives the raw ranking and one row per prior', () => {
    const sweep = priorSweep([{ code: 'LT', clusters: [story('LT', 'strike', 3)] }], [], new Map([['LT', 3]]), T, [0.5, 2]);
    expect(sweep).toContain('| raw outlets (before) |');
    expect(sweep).toContain('| coverage, prior 0.5 |');
    expect(sweep).toContain('| coverage, prior 2 |');
  });
});
