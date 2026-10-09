import { describe, expect, it } from 'vitest';
import type { Article, CountryFile, IndexFile } from '@news-globe/shared';
import { encodeBundle } from '@news-globe/shared/bundle';
import { addRun, runFromBundle } from '../src/archive';
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

describe('runFromBundle', () => {
  it('reads the run and its units from a published bundle', () => {
    const fr: CountryFile = {
      schemaVersion: 1,
      countryCode: 'FR',
      countryName: 'France',
      updatedAt: T1,
      clusters: [cluster(article('lemonde', 'Budget adopté', T1))],
    };
    const index: IndexFile = {
      schemaVersion: 1,
      updatedAt: T1,
      countries: [
        { code: 'FR', name: 'France', updatedAt: T1, clusterCount: 1 },
        { code: 'DE', name: 'Germany', updatedAt: T1, clusterCount: 0 },
      ],
      regions: [],
    };
    const run = runFromBundle(encodeBundle({ 'index.json': JSON.stringify(index), 'countries/FR.json': JSON.stringify(fr) }));
    expect(run?.runAt).toBe(T1);
    // A unit listed in the index without a file is skipped.
    expect(run?.units.map((u) => u.code)).toEqual(['FR']);
    expect(run!.units[0]!.clusters[0]!.representative.title).toBe('Budget adopté');
  });

  it('is null without an index', () => {
    expect(runFromBundle(encodeBundle({}))).toBeNull();
  });
});
