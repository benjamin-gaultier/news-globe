import { join } from 'node:path';
import { parseFeed } from './adapters/rss';
import { HttpCache } from './http';
import { DEFAULT_DATA_DIR } from './pipeline';
import { INGEST_SETTINGS } from './sources.config';

/**
 * `pnpm probe <feedUrl...>`: try candidate feeds before adding them. Each URL is
 * fetched through the same HttpCache as the ingest, so the request is recorded
 * (and the 15-minute limit holds), and the parsed items are kept for
 * `pnpm ingest --offline`.
 */
const urls = process.argv.slice(2).filter((a) => /^https?:\/\//.test(a));
if (!urls.length) {
  console.error('usage: pnpm probe <feedUrl> [feedUrl...]');
  process.exit(2);
}

const now = Date.now();
const http = await HttpCache.load(join(DEFAULT_DATA_DIR, '.cache', 'http.json'), {
  userAgent: INGEST_SETTINGS.userAgent,
  minIntervalMs: INGEST_SETTINGS.minFetchIntervalMs - INGEST_SETTINGS.fetchIntervalSlackMs,
  timeoutMs: INGEST_SETTINGS.fetchTimeoutMs,
  now: () => now,
});

const hours = (iso: string) => `${((now - Date.parse(iso)) / 3_600_000).toFixed(1)}h`;
// Print each result as it arrives, so a feed that stalls is easy to spot.
await Promise.all(
  urls.map(async (url) => {
    const r = await http.getItems(url, (body) => parseFeed(body, url));
    const dates = r.items.flatMap((i) => (i.publishedAt ? [i.publishedAt] : [])).sort();
    const age = dates.length ? `newest ${hours(dates.at(-1)!)} oldest ${hours(dates[0]!)}` : 'no dates';
    const undated = r.items.length - dates.length;
    console.log(`${r.outcome.padEnd(12)} ${String(r.items.length).padStart(3)} items  ${age}${undated ? ` (${undated} undated)` : ''}${r.error ? `  ${r.error}` : ''}  ${url}`);
  }),
);
await http.save();
