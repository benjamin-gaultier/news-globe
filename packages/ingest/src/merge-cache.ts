import './env';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DEFAULT_DATA_DIR } from './pipeline';
import { writeJsonAtomic } from './write';

/**
 * `pnpm cache:merge <other http.json>`: bring another machine's fetch history
 * into this cache, so feeds probed elsewhere stay within the 15-minute limit
 * here too. Unknown feeds are copied whole; for known ones only the later
 * `lastAttemptAt` is kept. Run between ingest runs.
 */
type Entry = { lastAttemptAt?: string; [key: string]: unknown };
type CacheFile = { version: 1; entries: Record<string, Entry> };

const other = process.argv[2];
if (!other) {
  console.error('usage: pnpm cache:merge <path to other http.json>');
  process.exit(2);
}

const file = join(DEFAULT_DATA_DIR, '.cache', 'http.json');
const read = async (path: string): Promise<CacheFile> => {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8'));
    if (parsed?.version === 1 && parsed.entries) return parsed;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
  return { version: 1, entries: {} };
};

const local = await read(file);
const incoming = await read(other);
let added = 0;
let bumped = 0;
for (const [url, entry] of Object.entries(incoming.entries)) {
  const mine = local.entries[url];
  if (!mine) {
    local.entries[url] = entry;
    added++;
  } else if (entry.lastAttemptAt && (!mine.lastAttemptAt || entry.lastAttemptAt > mine.lastAttemptAt)) {
    mine.lastAttemptAt = entry.lastAttemptAt;
    bumped++;
  }
}
// The same atomic write the cache itself uses (creates data/.cache, retries a busy rename).
await writeJsonAtomic(file, local);
console.log(`[cache:merge] ${added} feeds added, ${bumped} last-attempt times moved forward`);
