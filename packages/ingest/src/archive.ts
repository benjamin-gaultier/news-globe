import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import {
  ARCHIVE_SCHEMA_VERSION,
  type ArchiveDay,
  type ArchiveStory,
  type CountryFile,
  type IndexFile,
  type StoryCluster,
} from '@news-globe/shared';
import { publishConfigFromEnv, type PublishConfig } from './publish';
import { writeJsonAtomic } from './write';

/**
 * History. After each run, the ranked stories of every country and region are
 * folded into one gzipped file per UTC day, `data/archive/YYYY-MM-DD.json.gz`,
 * which is then uploaded to KV as `archive/YYYY-MM-DD`. A story keeps one
 * record for the day while consecutive runs' clusters share an article with
 * it; each run also records its ranked list per unit, for a time slider.
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

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

/** The run currently in dataDir, from index.json and the files it lists. */
export async function readRun(dataDir: string): Promise<RunSnapshot | null> {
  const index = await readJson<IndexFile>(join(dataDir, 'index.json'));
  if (!index) return null;
  const units: RunSnapshot['units'] = [];
  for (const [dir, entries] of [
    ['countries', index.countries],
    ['regions', index.regions ?? []],
  ] as const) {
    for (const { code } of entries) {
      const file = await readJson<CountryFile>(join(dataDir, dir, `${code}.json`));
      if (file) units.push({ code, clusters: file.clusters });
    }
  }
  return { runAt: index.updatedAt, units };
}

export const archiveFile = (dataDir: string, date: string) => join(dataDir, 'archive', `${date}.json.gz`);

async function readDay(dataDir: string, date: string): Promise<ArchiveDay | null> {
  try {
    return JSON.parse(gunzipSync(await readFile(archiveFile(dataDir, date))).toString('utf8')) as ArchiveDay;
  } catch {
    return null;
  }
}

/** Adds the run in dataDir to its day's archive file. Returns the day's date, or null if there was no run. */
export async function archiveRun(dataDir: string): Promise<string | null> {
  const run = await readRun(dataDir);
  if (!run) return null;
  const date = run.runAt.slice(0, 10);
  const day = addRun(await readDay(dataDir, date), run);
  const file = archiveFile(dataDir, date);
  await mkdir(join(dataDir, 'archive'), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, gzipSync(JSON.stringify(day)));
  await rename(tmp, file).catch(async (err) => {
    await rm(tmp, { force: true });
    throw err;
  });
  return date;
}

const DAY_MS = 86_400_000;
/** Days whose upload state is remembered; older entries are dropped. */
const KEEP_STATE_DAYS = 7;

/**
 * Uploads today's and yesterday's archive files to KV when they changed since
 * their last upload: yesterday too, so a failed upload of the day's last run
 * is retried after midnight.
 */
export async function publishArchiveToKv(
  dataDir: string,
  cfg: PublishConfig,
  opts: { now?: number; fetchImpl?: typeof fetch; log?: (msg: string) => void } = {},
): Promise<string[]> {
  const log = opts.log ?? console.log;
  const doFetch = opts.fetchImpl ?? fetch;
  const now = opts.now ?? Date.now();
  const stateFile = join(dataDir, '.cache', 'archive-publish.json');
  const state = (await readJson<Record<string, string>>(stateFile)) ?? {};

  const uploaded: string[] = [];
  for (const date of [new Date(now - DAY_MS), new Date(now)].map((d) => d.toISOString().slice(0, 10))) {
    let body: Buffer;
    try {
      body = await readFile(archiveFile(dataDir, date));
    } catch {
      continue; // No runs that day.
    }
    const hash = createHash('sha256').update(body).digest('hex');
    if (state[date] === hash) continue;

    const key = encodeURIComponent(`archive/${date}`);
    const url = `https://api.cloudflare.com/client/v4/accounts/${cfg.accountId}/storage/kv/namespaces/${cfg.namespaceId}/values/${key}`;
    const res = await doFetch(url, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${cfg.apiToken}`, 'Content-Type': 'application/octet-stream' },
      body,
      signal: AbortSignal.timeout(30_000),
    });
    const json = (await res.json().catch(() => null)) as { success?: boolean; errors?: { message: string }[] } | null;
    if (!res.ok || !json?.success) {
      const detail = json?.errors?.map((e) => e.message).join('; ') || `HTTP ${res.status}`;
      throw new Error(`KV write of archive/${date} failed: ${detail}`);
    }
    state[date] = hash;
    uploaded.push(date);
    log(`[archive] uploaded archive/${date} (${Math.round(body.length / 1024)} KiB)`);
  }

  const kept = Object.fromEntries(Object.entries(state).sort(([a], [b]) => b.localeCompare(a)).slice(0, KEEP_STATE_DAYS));
  if (uploaded.length) await writeJsonAtomic(stateFile, kept);
  return uploaded;
}

/** Archives the run in dataDir and uploads it when KV publishing is configured; never throws. */
export async function archiveIfPossible(dataDir: string): Promise<void> {
  try {
    if (!(await archiveRun(dataDir))) return;
    const cfg = publishConfigFromEnv();
    if (cfg) await publishArchiveToKv(dataDir, cfg);
  } catch (err) {
    // History is a bonus: the run's public files are written and published either way.
    console.error('[archive] failed:', err instanceof Error ? err.message : err);
  }
}
