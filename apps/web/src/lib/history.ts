import { COUNTRIES, REGIONS, type ArchiveDay, type ArchiveStory, type IndexEntry } from '@news-globe/shared';

/**
 * Reading the history archive (see packages/ingest/src/archive.ts): one file
 * per UTC day, with each hourly run's ranked stories per country and region.
 */

/** The day's run times, oldest first. */
export function runTimes(day: ArchiveDay): string[] {
  return Object.keys(day.runs).sort();
}

/**
 * Index lines as the globe reads them, for one run: each country's and
 * region's top story then. A story's outlet count is its peak over the day,
 * the only count the archive keeps.
 */
export function entriesAt(day: ArchiveDay, runAt: string): Map<string, IndexEntry> {
  const entries = new Map<string, IndexEntry>();
  for (const [code, ranked] of Object.entries(day.runs[runAt] ?? {})) {
    const name = COUNTRIES[code]?.name ?? REGIONS[code]?.name;
    if (!name) continue;
    const top = ranked[0] === undefined ? undefined : day.stories[ranked[0]];
    entries.set(code, {
      code,
      name,
      updatedAt: runAt,
      clusterCount: ranked.length,
      ...(top && { topTitle: top.title, topOutlets: top.peakOutlets }),
    });
  }
  return entries;
}

/** A country's or region's stories at one run, best ranked first. */
export function storiesAt(day: ArchiveDay, runAt: string, unit: string): ArchiveStory[] {
  return (day.runs[runAt]?.[unit] ?? []).map((i) => day.stories[i]).filter((s): s is ArchiveStory => s !== undefined);
}

/** `YYYY-MM-DD` shifted by whole days. */
export function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Today's UTC date, which names the archive file being written now. */
export const todayUtc = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);
