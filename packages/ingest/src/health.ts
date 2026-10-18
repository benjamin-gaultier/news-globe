import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileStem, SCHEMA_VERSION, type Category, type FailingFeed, type StatusFile } from '@news-globe/shared';
import { FETCHED_CATEGORIES, feedUrlsOf, SOURCES, type SourceConfig } from './sources.config';
import { writeJsonAtomic } from './write';

/**
 * Feed health, from the HTTP cache the run just updated. A feed is failing
 * when its last attempt was not also its last success: an HTTP error, a
 * timeout, or a body that would not parse. A file (a country's or region's
 * top headlines, or one of its sections) is dark when all its feeds are
 * failing, so it is no longer refreshed.
 *
 * Written to `data/status.json` and published with the other public files;
 * the hourly health check (.github/workflows/health.yml) reads it and fails,
 * which makes GitHub send an email, when a unit stays dark for too long.
 */

/** The part of an HttpCache entry this reads (see http.ts). */
interface CacheEntry {
  lastAttemptAt: string;
  retrievedAt?: string;
  lastStatus?: number | string;
}

export function buildStatus(
  entries: Record<string, CacheEntry>,
  sources: readonly SourceConfig[],
  updatedAt: string,
  categories: readonly Category[] = FETCHED_CATEGORIES,
): StatusFile {
  const failing: FailingFeed[] = [];
  // File (`FR`, `DE.sport`) → whether any of its feeds was requested yet, whether one works, and its
  // latest success. Each file on its own: a working sport feed must not hide a frozen top file.
  const units = new Map<string, { requested: boolean; working: boolean; lastOkAt: string | null }>();
  let total = 0;

  for (const source of sources) {
    for (const category of categories) {
      const urls = feedUrlsOf(source, [category]);
      if (!urls.length) continue;
      const unit = fileStem(source.region ?? source.country, category);
      const state = units.get(unit) ?? { requested: false, working: false, lastOkAt: null };
      units.set(unit, state);
      for (const url of urls) {
        total++;
        const entry = entries[url];
        // A feed never requested yet (just added) is neither working nor failing.
        if (!entry) continue;
        state.requested = true;
        const lastOkAt = entry.retrievedAt ?? null;
        if (lastOkAt && (!state.lastOkAt || lastOkAt > state.lastOkAt)) state.lastOkAt = lastOkAt;
        if (entry.retrievedAt === entry.lastAttemptAt) {
          state.working = true;
          continue;
        }
        failing.push({ source: source.id, unit, url, lastStatus: entry.lastStatus ?? null, lastOkAt });
      }
    }
  }

  // Never worked first, then the oldest last success.
  const age = (at: string | null) => (at ? Date.parse(at) : -Infinity);
  failing.sort((a, b) => age(a.lastOkAt) - age(b.lastOkAt) || a.source.localeCompare(b.source));
  const darkUnits = [...units]
    .filter(([, s]) => s.requested && !s.working)
    .map(([code, s]) => ({ code, since: s.lastOkAt }))
    .sort((a, b) => age(a.since) - age(b.since) || a.code.localeCompare(b.code));

  return { schemaVersion: SCHEMA_VERSION, updatedAt, feeds: { total, failing }, darkUnits };
}

/** Writes data/status.json from the HTTP cache; never throws. */
export async function writeStatus(dataDir: string, updatedAt = new Date().toISOString()): Promise<void> {
  try {
    const cache = JSON.parse(await readFile(join(dataDir, '.cache', 'http.json'), 'utf8')) as {
      entries?: Record<string, CacheEntry>;
    };
    const status = buildStatus(cache.entries ?? {}, SOURCES, updatedAt);
    await writeJsonAtomic(join(dataDir, 'status.json'), status);
    console.log(
      `[status] ${status.feeds.failing.length}/${status.feeds.total} feeds failing, ${status.darkUnits.length} dark: ${status.darkUnits.map((u) => u.code).join(' ') || 'none'}`,
    );
  } catch (err) {
    console.error('[status] failed:', err instanceof Error ? err.message : err);
  }
}
