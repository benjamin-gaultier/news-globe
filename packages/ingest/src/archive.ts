import {
  ARCHIVE_SCHEMA_VERSION,
  type ArchiveDay,
  type ArchiveStory,
  type CountryFile,
  type IndexFile,
  type StoryCluster,
} from '@news-globe/shared';
import { readBundleEntry } from '@news-globe/shared/bundle';

/**
 * History. Each run's ranked stories of every country and region are folded
 * into one gzipped value per UTC day, KV's `archive/YYYY-MM-DD`, from the
 * published bundle (see archive-remote.ts). A story keeps one record for the
 * day while consecutive runs' clusters share an article with it; each run
 * also records its ranked list per unit, for a time slider.
 *
 * Only metadata the public files already carry is kept: headline, link,
 * outlet ids and times — never article text.
 */

/** The files of one run: its time and, per unit, the clusters it ranked. */
export interface RunSnapshot {
  runAt: string;
  units: { code: string; clusters: StoryCluster[] }[];
}

const articleIdsOf = (c: StoryCluster) => [c.representative.id, ...c.related.map((a) => a.id)];
const sourcesOf = (c: StoryCluster) => [c.representative.source.id, ...c.related.map((a) => a.source.id)];

/** `into` followed by the items of `more` it lacks, each once. */
function union(into: string[], more: string[]): string[] {
  const out = [...into];
  const seen = new Set(into);
  for (const x of more) {
    if (seen.has(x)) continue;
    seen.add(x);
    out.push(x);
  }
  return out;
}

/**
 * Folds one run into its day. Pure: returns a new day and leaves `day` alone.
 * A run already in the day (same `runAt`) is not added twice.
 */
export function addRun(day: ArchiveDay | null, run: RunSnapshot): ArchiveDay {
  const date = run.runAt.slice(0, 10);
  const base: ArchiveDay =
    day && day.date === date ? day : { schemaVersion: ARCHIVE_SCHEMA_VERSION, date, stories: [], runs: {} };
  if (base.runs[run.runAt]) return base;

  const stories = base.stories.map((s) => ({ ...s }));
  const ranked: Record<string, number[]> = {};

  for (const { code, clusters } of run.units) {
    // Article id → story, for this unit's stories so far today.
    const byArticle = new Map<string, number>();
    stories.forEach((s, i) => {
      if (s.unit === code) for (const id of s.articleIds) byArticle.set(id, i);
    });
    const claimed = new Set<number>();
    ranked[code] = clusters.map((c, rank) => {
      const ids = articleIdsOf(c);
      // A story matched by an earlier cluster this run stays with it: a split starts a new record.
      const match = ids.map((id) => byArticle.get(id)).find((i) => i !== undefined && !claimed.has(i));
      if (match === undefined) {
        stories.push({
          unit: code,
          title: c.representative.title,
          url: c.representative.url,
          sources: union([], sourcesOf(c)),
          articleIds: ids,
          firstSeen: run.runAt,
          lastSeen: run.runAt,
          bestRank: rank + 1,
          peakOutlets: c.outletCount24h,
        });
        claimed.add(stories.length - 1);
        return stories.length - 1;
      }
      const s = stories[match]!;
      s.title = c.representative.title;
      s.url = c.representative.url;
      s.sources = union(s.sources, sourcesOf(c));
      s.articleIds = union(s.articleIds, ids);
      s.lastSeen = run.runAt;
      s.bestRank = Math.min(s.bestRank, rank + 1);
      s.peakOutlets = Math.max(s.peakOutlets, c.outletCount24h);
      claimed.add(match);
      return match;
    });
  }

  return { ...base, stories, runs: { ...base.runs, [run.runAt]: ranked } };
}

/** The run in a published bundle, from index.json and the files it lists, with the index. */
export function runFromBundle(bundle: Uint8Array): (RunSnapshot & { index: IndexFile }) | null {
  const read = <T>(key: string): T | null => {
    const bytes = readBundleEntry(bundle, key);
    return bytes ? (JSON.parse(new TextDecoder().decode(bytes)) as T) : null;
  };
  const index = read<IndexFile>('index.json');
  if (!index) return null;
  const units: RunSnapshot['units'] = [];
  for (const [dir, entries] of [
    ['countries', index.countries],
    ['regions', index.regions ?? []],
  ] as const) {
    for (const { code } of entries) {
      const file = read<CountryFile>(`${dir}/${code}.json`);
      if (file) units.push({ code, clusters: file.clusters });
    }
  }
  return { runAt: index.updatedAt, units, index };
}
