import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  COUNTRIES,
  SCHEMA_VERSION,
  type Article,
  type CountryCode,
  type CountryFile,
  type IndexEntry,
  type IndexFile,
} from '@news-globe/shared';
import { adapterFor } from './adapters';
import { clusterArticles } from './cluster';
import { HttpCache } from './http';
import { dedupeByCanonicalUrl, toArticle } from './normalize/article';
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
}

export interface IngestSummary {
  countries: { code: CountryCode; articles: number; clusters: number; written: boolean }[];
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
  // start 15 minutes apart are exactly 15 minutes apart for the throttle too.
  const runStart = clock();
  const http = await HttpCache.load(join(dataDir, '.cache', 'http.json'), {
    userAgent: settings.userAgent,
    minIntervalMs: settings.minFetchIntervalMs - settings.fetchIntervalSlackMs,
    timeoutMs: settings.fetchTimeoutMs,
    now: () => runStart,
  });

  // Fetch: outlets in parallel, feeds within an outlet sequentially.
  const lines: string[] = [];
  const perSource = await Promise.all(
    sources.map(async (source) => {
      const results = await adapterFor(source).fetch(source, { http, log: (m) => lines.push(m) });
      return { source, results };
    }),
  );
  log(lines.sort().join('\n'));
  await http.save();

  const now = clock();
  const minTime = now - settings.maxArticleAgeHours * 3_600_000;
  const authority = new Map(sources.map((s) => [s.id, s.authority]));
  const authorityOf = (id: string) => authority.get(id) ?? 0;

  const byCountry = new Map<CountryCode, Article[]>();
  for (const { source, results } of perSource) {
    for (const { items, retrievedAt } of results) {
      for (const item of items) {
        const article = toArticle(item, source, retrievedAt, now);
        if (Date.parse(article.publishedAt) < minTime) continue;
        const list = byCountry.get(source.country) ?? [];
        list.push(article);
        byCountry.set(source.country, list);
      }
    }
  }

  const countryCodes = [...new Set(sources.map((s) => s.country))].filter((c) => COUNTRIES[c]);
  const updatedAt = new Date(now).toISOString();
  const summary: IngestSummary = { countries: [] };
  const index: IndexEntry[] = [];

  for (const code of countryCodes) {
    const meta = COUNTRIES[code]!;
    const file = join(dataDir, 'countries', `${code}.json`);
    // Newest first so dedupe keeps the freshest copy and cluster order is stable.
    const articles = dedupeByCanonicalUrl(
      (byCountry.get(code) ?? []).sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)),
    );

    if (articles.length === 0) {
      // Every feed failed and nothing is cached: keep the previous file rather than blanking it.
      const previous = await readJson<CountryFile>(file);
      log(`${code}: no articles — ${previous ? 'keeping previous file' : 'nothing to write'}`);
      if (previous) {
        index.push({ code, name: meta.name, updatedAt: previous.updatedAt, clusterCount: previous.clusters.length });
      }
      summary.countries.push({ code, articles: 0, clusters: previous?.clusters.length ?? 0, written: false });
      continue;
    }

    const groups = clusterArticles(articles, {
      threshold: settings.clusterThreshold,
      minSharedTokens: settings.clusterMinSharedTokens,
    });
    const clusters = rankClusters(
      groups.map((g) => buildCluster(g, authorityOf, now, settings.rankingWindowHours)),
      settings.maxClustersPerCountry,
    );

    const out: CountryFile = {
      schemaVersion: SCHEMA_VERSION,
      countryCode: code,
      countryName: meta.name,
      updatedAt,
      clusters,
    };
    await writeJsonAtomic(file, out);
    index.push({ code, name: meta.name, updatedAt, clusterCount: clusters.length });
    summary.countries.push({ code, articles: articles.length, clusters: clusters.length, written: true });

    const multi = groups.filter((g) => new Set(g.map((a) => a.source.id)).size > 1).length;
    log(`${code}: ${articles.length} articles → ${groups.length} clusters (${multi} multi-outlet), wrote top ${clusters.length}`);
  }

  const indexFile: IndexFile = { schemaVersion: SCHEMA_VERSION, updatedAt, countries: index };
  await writeJsonAtomic(join(dataDir, 'index.json'), indexFile);
  return summary;
}
