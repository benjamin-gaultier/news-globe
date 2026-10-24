import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CATEGORIES,
  COUNTRIES,
  fileStem,
  REGIONS,
  SCHEMA_VERSION,
  type Article,
  type Category,
  type CountryCode,
  type CountryFile,
  type IndexEntry,
  type IndexFile,
  type RegionCode,
  type StoryCluster,
  type RegionMeta,
} from '@news-globe/shared';
import { adapterFor, type RawItem } from './adapters';
import { clusterArticles } from './cluster';
import { HttpCache } from './http';
import { mapLimit } from './limit';
import {
  dedupeByCanonicalUrl,
  dropOwnRepeats,
  dropRepublished,
  isMisdecoded,
  isNotNews,
  isUnrenderedTemplate,
  toArticle,
} from './normalize/article';
import { canonicalizeUrl, isSportCategory, isSportUrl } from './normalize/url';
import { buildCluster, rankClusters } from './rank';
import { activePools, FETCHED_CATEGORIES, feedUrlsOf, INGEST_SETTINGS, outletPools, SOURCES, type SourceConfig } from './sources.config';
import { buildWorld } from './world';
import { writeJsonAtomic } from './write';

/** Repo-root `data/` unless DATA_DIR is set. */
export const DEFAULT_DATA_DIR = process.env.DATA_DIR ?? fileURLToPath(new URL('../../../data', import.meta.url));

export interface IngestOptions {
  dataDir?: string;
  sources?: SourceConfig[];
  settings?: typeof INGEST_SETTINGS;
  /** Categories to fetch and write files for; FETCHED_CATEGORIES by default. */
  categories?: readonly Category[];
  now?: () => number;
  log?: (msg: string) => void;
  /** Build from the HTTP cache only, without any request. */
  offline?: boolean;
}

interface UnitSummary {
  code: CountryCode | RegionCode;
  category: Category;
  articles: number;
  clusters: number;
  written: boolean;
}

export interface IngestSummary {
  countries: UnitSummary[];
  regions: UnitSummary[];
}

/** A country's or region's file in one category: clustered and ranked on its own. */
type Unit = { code: string; name: string; category: Category; file: string } & (
  | { kind: 'country' }
  | { kind: 'region'; region: RegionMeta }
);

/** The index line for one file, with its top story so the globe can show it without opening the file. */
export function indexEntry(code: string, name: string, updatedAt: string, clusters: StoryCluster[], activeOutlets?: number): IndexEntry {
  const top = clusters[0];
  return {
    code,
    name,
    updatedAt,
    clusterCount: clusters.length,
    ...(top && { topTitle: top.representative.title, topOutlets: top.outletCount24h }),
    ...(activeOutlets !== undefined && { activeOutlets }),
  };
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

export async function runIngest(opts: IngestOptions = {}): Promise<IngestSummary> {
  const dataDir = opts.dataDir ?? DEFAULT_DATA_DIR;
  const categories = opts.categories ?? FETCHED_CATEGORIES;
  // Outlets with no feed in a fetched category stay out until their category is fetched.
  const sources = (opts.sources ?? SOURCES).filter((s) => feedUrlsOf(s, categories).length > 0);
  const settings = opts.settings ?? INGEST_SETTINGS;
  const clock = opts.now ?? Date.now;
  const log = opts.log ?? console.log;

  // Every request in a run is stamped with the run's start time, so runs that
  // start one interval apart are exactly that far apart for the throttle too.
  const runStart = clock();
  const http = await HttpCache.load(join(dataDir, '.cache', 'http.json'), {
    userAgent: settings.userAgent,
    minIntervalMs: settings.minFetchIntervalMs - settings.fetchIntervalSlackMs,
    timeoutMs: settings.fetchTimeoutMs,
    now: () => runStart,
    offline: opts.offline,
  });

  // Fetch: a few outlets at a time, feeds within an outlet sequentially.
  const lines: string[] = [];
  const perSource = await mapLimit(sources, settings.fetchConcurrency, async (source) => {
    const results = await adapterFor(source).fetch(source, { http, categories, log: (m) => lines.push(m) });
    return { source, results };
  });
  log(lines.sort().join('\n'));
  await http.save();

  const now = clock();
  const minTime = now - settings.maxArticleAgeHours * 3_600_000;
  const authority = new Map(sources.map((s) => [s.id, s.authority]));
  const authorityOf = (id: string) => authority.get(id) ?? 0;

  // Sports stories stay out of top files: many top feeds are whole-site feeds, and a match would
  // otherwise rank as national news (and link countries in the world briefing). A story is sport
  // when its URL is in a sports section, the feed files it under a sports category, or the outlet's
  // own sport feed lists it.
  const inSportFeed = new Set(
    perSource.flatMap(({ source, results }) =>
      results.filter((r) => r.category === 'sport').flatMap((r) => r.items.map((i) => `${source.id}\n${canonicalizeUrl(i.url)}`)),
    ),
  );
  const isSport = (item: RawItem, a: Article) =>
    isSportUrl(a.url) || isSportCategory(item.categories) || inSportFeed.has(`${a.source.id}\n${a.canonicalUrl}`);
  let sportDropped = 0;

  // A feed's articles go to its category's file: regional outlets' to their region's, national ones' to their country's.
  const byFile = new Map<string, Article[]>();
  for (const { source, results } of perSource) {
    for (const { category, items, retrievedAt } of results) {
      const key = fileStem(source.region ?? source.country, category);
      const list = byFile.get(key) ?? [];
      for (const item of items) {
        const article = toArticle(item, source, retrievedAt, now);
        if (Date.parse(article.publishedAt) < minTime) continue;
        if (isMisdecoded(article.title) || isUnrenderedTemplate(article.title) || isNotNews(article.title)) continue;
        if (category === 'top' && isSport(item, article)) {
          sportDropped++;
          continue;
        }
        list.push(article);
      }
      byFile.set(key, list);
    }
  }
  if (sportDropped) log(`top files: ${sportDropped} sports stories left to the sport files`);

  // One file per unit and category its outlets have feeds in. A source counts toward a category only
  // through its feeds in it: a sports daily makes (or keeps) no top file, and a unit with no business
  // feed gets no business file.
  const units: Unit[] = [];
  for (const category of categories) {
    const inCategory = sources.filter((s) => feedUrlsOf(s, [category]).length > 0);
    const file = (dir: string, code: string) => join(dataDir, dir, `${fileStem(code, category)}.json`);
    for (const code of new Set(inCategory.filter((s) => !s.region).map((s) => s.country))) {
      const meta = COUNTRIES[code];
      if (meta) units.push({ kind: 'country', code, name: meta.name, category, file: file('countries', code) });
    }
    for (const code of new Set(inCategory.flatMap((s) => (s.region ? [s.region] : [])))) {
      const meta = REGIONS[code];
      if (meta) units.push({ kind: 'region', code, name: meta.name, category, file: file('regions', code), region: meta });
    }
  }

  const updatedAt = new Date(now).toISOString();
  const windowStart = now - settings.rankingWindowHours * 3_600_000;
  const summary: IngestSummary = { countries: [], regions: [] };
  const index: Pick<IndexFile, 'countries' | 'regions'> = { countries: [], regions: [] };
  // National top files wait for cross-border linking, which adds `alsoIn` to their clusters.
  const nationalFiles: { file: string; out: CountryFile }[] = [];
  // Unit code → the categories it has a file in after this run.
  const filed = new Map<string, Set<Category>>();
  // The index lists top files; a section file only adds its category to its unit's entry.
  const addToIndex = (unit: Unit, at: string, clusters: StoryCluster[], activeOutlets?: number) => {
    filed.set(unit.code, (filed.get(unit.code) ?? new Set()).add(unit.category));
    if (unit.category !== 'top') return;
    (unit.kind === 'country' ? index.countries : index.regions!).push(indexEntry(unit.code, unit.name, at, clusters, activeOutlets));
  };

  for (const unit of units) {
    const { code, name, category, file } = unit;
    const label = fileStem(code, category);
    const summaryList = unit.kind === 'country' ? summary.countries : summary.regions;
    // Newest first so dedupe keeps the freshest copy and cluster order is stable.
    const unique = dedupeByCanonicalUrl((byFile.get(label) ?? []).sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)));
    // Regional partners rerun each other's stories under the same headline; nationally, only an
    // outlet's own repeats go (the same wire headline from several outlets is real coverage).
    const articles = unit.kind === 'region' ? dropRepublished(unique) : dropOwnRepeats(unique);

    if (articles.length === 0) {
      // Every feed failed and nothing is cached: keep the previous file rather than blanking it.
      const previous = await readJson<CountryFile>(file);
      log(`${label}: no articles — ${previous ? 'keeping previous file' : 'nothing to write'}`);
      if (previous) addToIndex(unit, previous.updatedAt, previous.clusters);
      summaryList.push({ code, category, articles: 0, clusters: previous?.clusters.length ?? 0, written: false });
      continue;
    }

    const groups = clusterArticles(articles, {
      threshold: settings.clusterThreshold,
      minSharedTokens: settings.clusterMinSharedTokens,
      minAverageLink: settings.clusterMinAverageLink,
      ignoreNames: unit.kind === 'region' ? [unit.region.name, ...(unit.region.localNames ?? [])] : undefined,
    });
    const clusters = rankClusters(
      groups.map((g) => buildCluster(g, authorityOf, now, settings.rankingWindowHours)),
      settings.maxClustersPerCountry,
      settings.maxSoloStoriesPerOutlet,
    );

    const section = category === 'top' ? {} : { category };
    const out: CountryFile =
      unit.kind === 'country'
        ? { schemaVersion: SCHEMA_VERSION, countryCode: code, countryName: name, ...section, updatedAt, clusters }
        : {
            schemaVersion: SCHEMA_VERSION,
            countryCode: unit.region.country,
            countryName: COUNTRIES[unit.region.country]?.name ?? unit.region.country,
            regionCode: code,
            regionName: name,
            ...section,
            updatedAt,
            clusters,
          };
    if (unit.kind === 'country' && category === 'top') nationalFiles.push({ file, out });
    else await writeJsonAtomic(file, out);
    addToIndex(
      unit,
      updatedAt,
      clusters,
      new Set(articles.filter((a) => Date.parse(a.publishedAt) >= windowStart).map((a) => a.source.id)).size,
    );
    summaryList.push({ code, category, articles: articles.length, clusters: clusters.length, written: true });

    const multi = groups.filter((g) => new Set(g.map((a) => a.source.id)).size > 1).length;
    log(`${label}: ${articles.length} articles → ${groups.length} clusters (${multi} multi-outlet), wrote top ${clusters.length}`);
  }

  // Each entry names its unit's section files, so the web app offers only those that exist.
  for (const entry of [...index.countries, ...index.regions!]) {
    const has = CATEGORIES.filter((c) => filed.get(entry.code)?.has(c));
    if (has.length > 1) entry.categories = has;
  }

  const world = buildWorld(
    nationalFiles.map(({ out }) => ({ code: out.countryCode, clusters: out.clusters })),
    undefined,
    activePools(index.countries, outletPools(sources)),
  );
  for (const { file, out } of nationalFiles) await writeJsonAtomic(file, out);
  log(`world: ${world.length} cross-border stories${world[0] ? `, top in ${world[0].countries.length} countries` : ''}`);

  const indexFile: IndexFile = { schemaVersion: SCHEMA_VERSION, updatedAt, ...index, world };
  await writeJsonAtomic(join(dataDir, 'index.json'), indexFile);
  return summary;
}
