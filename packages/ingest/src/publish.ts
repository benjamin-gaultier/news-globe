import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BUNDLE_KEY, encodeBundle } from '@news-globe/shared/bundle';
import { writeJsonAtomic } from './write';

/**
 * Publishes the public data files to a Cloudflare Workers KV namespace, which
 * the Worker in apps/web serves at /data/*. Uses the Cloudflare REST API
 * directly so the machine running the ingest (e.g. a Raspberry Pi) needs no
 * wrangler install — just an API token scoped to "Workers KV Storage: Edit".
 */

export interface PublishConfig {
  accountId: string;
  namespaceId: string;
  apiToken: string;
}

export function publishConfigFromEnv(env: NodeJS.ProcessEnv = process.env): PublishConfig | null {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  const namespaceId = env.CLOUDFLARE_KV_NAMESPACE_ID;
  const apiToken = env.CLOUDFLARE_API_TOKEN;
  if (!accountId && !namespaceId && !apiToken) return null;
  const missing = [
    !accountId && 'CLOUDFLARE_ACCOUNT_ID',
    !namespaceId && 'CLOUDFLARE_KV_NAMESPACE_ID',
    !apiToken && 'CLOUDFLARE_API_TOKEN',
  ].filter(Boolean);
  if (missing.length) throw new Error(`KV publishing is half-configured; missing ${missing.join(', ')}`);
  return { accountId: accountId!, namespaceId: namespaceId!, apiToken: apiToken! };
}

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
  return ['index.json', ...countries.sort(), ...regions.sort()];
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
  cfg: PublishConfig,
  opts: { fetchImpl?: typeof fetch; log?: (msg: string) => void } = {},
): Promise<PublishResult> {
  const log = opts.log ?? console.log;
  const doFetch = opts.fetchImpl ?? fetch;
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

  const url = `https://api.cloudflare.com/client/v4/accounts/${cfg.accountId}/storage/kv/namespaces/${cfg.namespaceId}/values/${BUNDLE_KEY}`;
  const res = await doFetch(url, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${cfg.apiToken}`, 'Content-Type': 'application/octet-stream' },
    body: bundle,
    signal: AbortSignal.timeout(30_000),
  });
  const body = (await res.json().catch(() => null)) as { success?: boolean; errors?: { message: string }[] } | null;
  if (!res.ok || !body?.success) {
    const detail = body?.errors?.map((e) => e.message).join('; ') || `HTTP ${res.status}`;
    throw new Error(`KV write failed: ${detail}`);
  }

  // Only remember the hash once Cloudflare confirmed the write, so failures retry next run.
  await writeJsonAtomic(stateFile, { [BUNDLE_KEY]: hash });
  log(`[publish] uploaded ${keys.length} files to KV as one bundle (${Math.round(bundle.length / 1024)} KiB)`);
  return { uploaded: true, keys };
}

/** Publishes to KV when the Cloudflare env vars are set; never throws. */
export async function publishIfConfigured(dataDir: string): Promise<void> {
  try {
    const cfg = publishConfigFromEnv();
    if (cfg) await publishToKv(dataDir, cfg);
  } catch (err) {
    // The local files are written either way; the next run retries the upload.
    console.error('[publish] failed:', err instanceof Error ? err.message : err);
  }
}
