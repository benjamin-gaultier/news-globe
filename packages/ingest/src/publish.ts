import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BUNDLE_KEY, encodeBundle } from '@news-globe/shared/bundle';
import { kvClient, kvConfigFromEnv, type KvConfig } from './kv';
import { writeJsonAtomic } from './write';

/**
 * Publishes the public data files to Workers KV (see kv.ts), which the Worker
 * in apps/web serves at /data/*.
 */

/** KV keys that make up the public data contract, as found in dataDir. */
async function publicKeys(dataDir: string): Promise<string[]> {
  const list = async (dir: string, name: RegExp) => {
    try {
      return (await readdir(join(dataDir, dir))).filter((f) => name.test(f)).map((f) => `${dir}/${f}`);
    } catch {
      return []; // Nothing written there yet.
    }
  };
  const countries = await list('countries', /^[A-Z]{2}\.json$/);
  const regions = await list('regions', /^[A-Z]{2}-[A-Z0-9]{1,3}\.json$/);
  const status = existsSync(join(dataDir, 'status.json')) ? ['status.json'] : [];
  return ['index.json', ...status, ...countries.sort(), ...regions.sort()];
}

export interface PublishResult {
  /** Whether the bundle was written (false when nothing changed since the last write). */
  uploaded: boolean;
  /** The files in the bundle. */
  keys: string[];
}

/**
 * Packs every public file into one bundle (see @news-globe/shared/bundle) and
 * writes it as a single KV value: one write per run whatever the number of
 * countries, where one key per file ran past the free tier's 1,000 writes a
 * day once there were ~100 countries.
 */
export async function publishToKv(
  dataDir: string,
  cfg: KvConfig,
  opts: { fetchImpl?: typeof fetch; log?: (msg: string) => void } = {},
): Promise<PublishResult> {
  const log = opts.log ?? console.log;
  const stateFile = join(dataDir, '.cache', 'publish.json');

  let published: Record<string, string> = {};
  try {
    published = JSON.parse(await readFile(stateFile, 'utf8')) as Record<string, string>;
  } catch {
    // First publish.
  }

  const files: Record<string, string> = {};
  for (const key of await publicKeys(dataDir)) {
    try {
      files[key] = await readFile(join(dataDir, key), 'utf8');
    } catch {
      // Listed but gone: leave it out.
    }
  }
  const keys = Object.keys(files);
  const bundle = encodeBundle(files);
  const hash = createHash('sha256').update(bundle).digest('hex');
  if (published[BUNDLE_KEY] === hash) {
    log('[publish] KV already up to date');
    return { uploaded: false, keys };
  }

  await kvClient(cfg, opts.fetchImpl).put(BUNDLE_KEY, bundle);

  // Only remember the hash once Cloudflare confirmed the write, so failures retry next run.
  await writeJsonAtomic(stateFile, { [BUNDLE_KEY]: hash });
  log(`[publish] uploaded ${keys.length} files to KV as one bundle (${Math.round(bundle.length / 1024)} KiB)`);
  return { uploaded: true, keys };
}

/**
 * Publishes to KV when the Cloudflare env vars are set. A failed upload throws,
 * so the run exits non-zero and shows as failed (the local files are written
 * either way, and the next run retries the upload).
 */
export async function publishIfConfigured(dataDir: string): Promise<void> {
  const cfg = kvConfigFromEnv();
  if (cfg) await publishToKv(dataDir, cfg);
}
