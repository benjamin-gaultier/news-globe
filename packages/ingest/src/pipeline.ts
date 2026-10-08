import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  COUNTRIES,
  REGIONS,
  SCHEMA_VERSION,
  type Article,
  type CountryCode,
  type CountryFile,
  type IndexEntry,
  type IndexFile,
  type RegionCode,
  type StoryCluster,
  type RegionMeta,
} from '@news-globe/shared';
import { adapterFor } from './adapters';
import { clusterArticles } from './cluster';
import { HttpCache } from './http';
import { mapLimit } from './limit';
import { dedupeByCanonicalUrl, dropRepublished, isMisdecoded, isNotNews, isUnrenderedTemplate, toArticle } from './normalize/article';
import { buildCluster, rankClusters } from './rank';
import { INGEST_SETTINGS, SOURCES, type SourceConfig } from './sources.config';
import { writeJsonAtomic } from './write';

/** Repo-root `data/` unless DATA_DIR is set. */
export const DEFAULT_DATA_DIR = process.env.DATA_DIR ?? fileURLToPath(new URL('../../../data', import.meta.url));

export interface IngestOptions {
  dataDir?: string;
  sources?: SourceConfig[];
  settings?: typeof INGEST_SETTINGS;
  now?: () => number;
  log?: (msg: string) => void;
  /** Build from the HTTP cache only, without any request. */
  offline?: boolean;
}

interface UnitSummary {
  code: CountryCode | RegionCode;
  articles: number;
  clusters: number;
  written: boolean;
}

export interface IngestSummary {
  countries: UnitSummary[];
  regions: UnitSummary[];
}

/** A country or region: one output file, clustered on its own. */
type Unit = { code: string; name: string; file: string } & (
  | { kind: 'country' }
  | { kind: 'region'; region: RegionMeta }
);

/** The index line for one file, with its top story so the globe can show it without opening the file. */
export function indexEntry(code: string, name: string, updatedAt: string, clusters: StoryCluster[]): IndexEntry {
  const top = clusters[0];
  return {
    code,
    name,
    updatedAt,
    clusterCount: clusters.length,
    ...(top && { topTitle: top.representative.title, topOutlets: top.outletCount24h }),
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
  const sources = opts.sources ?? SOURCES;
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
    const results = await adapterFor(source).fetch(source, { http, log: (m) => lines.push(m) });
    return { source, results };
  });
  log(lines.sort().join('\n'));
  await http.save();

  const now = clock();
  const minTime = now - settings.maxArticleAgeHours * 3_600_000;
  const authority = new Map(sources.map((s) => [s.id, s.authority]));
  const authorityOf = (id: string) => authority.get(id) ?? 0;

  // Regional outlets feed their region's file, national ones their country's.
  const byUnit = new Map<string, Article[]>();
  for (const { source, results } of perSource) {
    for (const { items, retrievedAt } of results) {
      for (const item of items) {
        const article = toArticle(item, source, retrievedAt, now);
        if (Date.parse(article.publishedAt) < minTime) continue;
        if (isMisdecoded(article.title) || isUnrenderedTemplate(article.title) || isNotNews(article.title)) continue;
        const key = source.region ?? source.country;
        const list = byUnit.get(key) ?? [];
        list.push(article);
        byUnit.set(key, list);
      }
    }
  }

  const units: Unit[] = [];
  for (const code of new Set(sources.filter((s) => !s.region).map((s) => s.country))) {
    const meta = COUNTRIES[code];
    if (meta) units.push({ kind: 'country', code, name: meta.name, file: join(dataDir, 'countries', `${code}.json`) });
  }
  for (const code of new Set(sources.flatMap((s) => (s.region ? [s.region] : [])))) {
    const meta = REGIONS[code];
    if (meta) units.push({ kind: 'region', code, name: meta.name, file: join(dataDir, 'regions', `${code}.json`), region: meta });
  }

  const updatedAt = new Date(now).toISOString();
  const summary: IngestSummary = { countries: [], regions: [] };
  const index: Pick<IndexFile, 'countries' | 'regions'> = { countries: [], regions: [] };

  for (const unit of units) {
    const { code, name, file } = unit;
    const indexList = unit.kind === 'country' ? index.countries : index.regions!;
    const summaryList = unit.kind === 'country' ? summary.countries : summary.regions;
    // Newest first so dedupe keeps the freshest copy and cluster order is stable.
    const unique = dedupeByCanonicalUrl(
      (byUnit.get(code) ?? []).sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)),
    );
    // Regional partners rerun each other's stories under the same headline.
    const articles = unit.kind === 'region' ? dropRepublished(unique) : unique;

    if (articles.length === 0) {
      // Every feed failed and nothing is cached: keep the previous file rather than blanking it.
      const previous = await readJson<CountryFile>(file);
      log(`${code}: no articles — ${previous ? 'keeping previous file' : 'nothing to write'}`);
      if (previous) {
        indexList.push(indexEntry(code, name, previous.updatedAt, previous.clusters));
      }
      summaryList.push({ code, articles: 0, clusters: previous?.clusters.length ?? 0, written: false });
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

    const out: CountryFile =
      unit.kind === 'country'
        ? { schemaVersion: SCHEMA_VERSION, countryCode: code, countryName: name, updatedAt, clusters }
        : {
            schemaVersion: SCHEMA_VERSION,
            countryCode: unit.region.country,
            countryName: COUNTRIES[unit.region.country]?.name ?? unit.region.country,
            regionCode: code,
            regionName: name,
            updatedAt,
            clusters,
          };
    await writeJsonAtomic(file, out);
    indexList.push(indexEntry(code, name, updatedAt, clusters));
    summaryList.push({ code, articles: articles.length, clusters: clusters.length, written: true });

    const multi = groups.filter((g) => new Set(g.map((a) => a.source.id)).size > 1).length;
    log(`${code}: ${articles.length} articles → ${groups.length} clusters (${multi} multi-outlet), wrote top ${clusters.length}`);
  }

  const indexFile: IndexFile = { schemaVersion: SCHEMA_VERSION, updatedAt, ...index };
  await writeJsonAtomic(join(dataDir, 'index.json'), indexFile);
  return summary;
}
