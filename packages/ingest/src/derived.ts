import {
  SCHEMA_VERSION,
  type ArchiveDay,
  type ClusterTrend,
  type SearchFile,
  type StoryCluster,
  type TrendsFile,
} from '@news-globe/shared';

/**
 * Small files derived each hour from the published run and the history
 * archive, next to them in KV (see archive-remote.ts): `trends` for the
 * New / Rising badges, rank sparklines and the globe's "change" shading, and
 * `search` for searching every headline.
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
  const runs = Object.keys(day.runs).sort().filter((r) => r <= runAt).slice(-TREND_RUNS);
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
