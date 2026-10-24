import {
  COUNTRIES,
  SCHEMA_VERSION,
  type ArchiveDay,
  type ClusterTrend,
  type SearchFile,
  type StoryCluster,
  type TodayFile,
  type TodayStory,
  type TrendsFile,
} from '@news-globe/shared';
import { coverage, round3 } from './rank';
import { outletPools } from './sources.config';

/**
 * Small files derived each hour from the published run and the history
 * archive, next to them in KV (see archive-remote.ts): `trends` for the
 * New / Rising badges, rank sparklines and the globe's "change" shading, and
 * `search` for searching every headline, `today` for the world briefing.
 */

/** Rank histories cover at most this many of today's latest runs. */
export const TREND_RUNS = 12;
/** Places gained since the previous run that make a story "rising". */
export const RISING_PLACES = 3;
/** The "change" score counts new or rising stories among this many top stories. */
export const CHANGE_TOP = 5;

export interface PublishedUnit {
  code: string;
  clusters: StoryCluster[];
}

/**
 * Trends for the run at `runAt`, which must already be in `day` (added with
 * addRun from the same clusters, so each unit's i-th cluster is its i-th
 * ranked story).
 */
export function buildTrends(day: ArchiveDay, runAt: string, units: PublishedUnit[]): TrendsFile {
  const runs = Object.keys(day.runs)
    .sort()
    .filter((r) => r <= runAt)
    .slice(-TREND_RUNS);
  const current = day.runs[runAt] ?? {};
  const previousRun = runs.at(-2);
  const out: TrendsFile = { schemaVersion: SCHEMA_VERSION, runAt, runs, units: {}, change: {} };

  for (const { code, clusters } of units) {
    const ranked = current[code];
    if (!ranked) continue;
    const trends: Record<string, ClusterTrend> = {};
    let changed = 0;
    clusters.forEach((cluster, i) => {
      const storyIndex = ranked[i];
      const story = storyIndex === undefined ? undefined : day.stories[storyIndex];
      if (storyIndex === undefined || !story) return;
      const ranks = runs.map((r) => {
        const at = day.runs[r]?.[code]?.indexOf(storyIndex) ?? -1;
        return at < 0 ? null : at + 1;
      });
      const previous = previousRun ? ranks[ranks.length - 2] : null;
      // The day's first run has nothing to compare with: no badges then.
      const state: ClusterTrend['state'] = !previousRun
        ? null
        : story.firstSeen === runAt
          ? 'new'
          : previous !== null && previous !== undefined && previous - (i + 1) >= RISING_PLACES
            ? 'rising'
            : null;
      trends[cluster.id] = { ranks, firstSeen: story.firstSeen, state };
      if (state && i < CHANGE_TOP) changed++;
    });
    out.units[code] = trends;
    out.change[code] = changed;
  }
  return out;
}

/** Every ranked headline of the run, for client-side search. */
export function buildSearch(runAt: string, units: PublishedUnit[]): SearchFile {
  return {
    schemaVersion: SCHEMA_VERSION,
    runAt,
    items: units.flatMap(({ code, clusters }) =>
      clusters.map((c) => [code, c.representative.title, c.outletCount24h] as SearchFile['items'][number]),
    ),
  };
}

/** Sizes of the `today` lists. */
export const TODAY_TOP = 12;
export const TODAY_PER_COUNTRY = 2;
export const TODAY_RISING = 8;
export const TODAY_LASTING = 6;
/** A "lasting" story has been ranked this long today, in its country's top 3. */
export const LASTING_HOURS = 6;
const LASTING_TOP = 3;

/**
 * Every national story of the run, with its trend and coverage (the share of
 * its country's press on it; `pools` gives each country's outlets).
 */
export function nationalStories(trends: TrendsFile, units: PublishedUnit[], pools: ReadonlyMap<string, number>): TodayStory[] {
  const all: TodayStory[] = [];
  for (const { code, clusters } of units) {
    if (!COUNTRIES[code]) continue; // national stories only
    clusters.forEach((c, i) => {
      const trend = trends.units[code]?.[c.id];
      const rep = c.representative;
      all.push({
        unit: code,
        clusterId: c.id,
        title: rep.title,
        url: rep.url,
        source: rep.source.name,
        language: rep.language,
        imageUrl: rep.imageUrl,
        outlets: c.outletCount24h,
        coverage: round3(coverage(c.outletCount24h, pools.get(code))),
        rank: i + 1,
        firstSeen: trend?.firstSeen ?? trends.runAt,
        state: trend?.state ?? null,
      });
    });
  }
  return all;
}

/**
 * How stories from different countries are ranked: the largest share of their
 * country's press first. Equal shares go to the higher-ranked story before the
 * one with more outlets, which would favour bigger pools again.
 */
export const byCoverage = (a: TodayStory, b: TodayStory) =>
  (b.coverage ?? 0) - (a.coverage ?? 0) || a.rank - b.rank || b.outlets - a.outlets || a.unit.localeCompare(b.unit);

/** Today's top list: the best stories by `compare`, at most TODAY_PER_COUNTRY per country. */
export function pickTop(all: readonly TodayStory[], compare: (a: TodayStory, b: TodayStory) => number = byCoverage): TodayStory[] {
  const top: TodayStory[] = [];
  const perCountry = new Map<string, number>();
  for (const s of [...all].sort(compare)) {
    if (top.length >= TODAY_TOP) break;
    const n = perCountry.get(s.unit) ?? 0;
    if (n >= TODAY_PER_COUNTRY) continue;
    perCountry.set(s.unit, n + 1);
    top.push(s);
  }
  return top;
}

/**
 * The `today` file for the run at `runAt`, from its national stories and their trends (see buildTrends).
 * Stories from different countries are ranked by the share of their country's press on them (`coverage`),
 * not by outlets, so countries with more feeds don't fill the lists. `pools` gives each country's outlets.
 */
export function buildToday(trends: TrendsFile, units: PublishedUnit[], pools: ReadonlyMap<string, number> = outletPools()): TodayFile {
  const runAt = trends.runAt;
  const all = nationalStories(trends, units, pools);
  const top = pickTop(all);
  const shown = new Set(top.map((s) => `${s.unit}/${s.clusterId}`));
  const rising = all
    .filter((s) => s.state && !shown.has(`${s.unit}/${s.clusterId}`))
    .sort(byCoverage)
    .slice(0, TODAY_RISING);
  const lastingSince = Date.parse(runAt) - LASTING_HOURS * 3_600_000;
  const lasting = all
    .filter((s) => s.rank <= LASTING_TOP && Date.parse(s.firstSeen) <= lastingSince)
    .sort((a, b) => a.firstSeen.localeCompare(b.firstSeen) || byCoverage(a, b))
    .slice(0, TODAY_LASTING);

  return {
    schemaVersion: SCHEMA_VERSION,
    runAt,
    top,
    rising,
    lasting,
    countries: new Set(all.map((s) => s.unit)).size,
    stories: all.length,
  };
}
