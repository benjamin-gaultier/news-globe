import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
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
  let countries: string[] = [];
  try {
    countries = (await readdir(join(dataDir, 'countries')))
      .filter((f) => /^[A-Z]{2}\.json$/.test(f))
      .map((f) => `countries/${f}`);
  } catch {
    // No countries written yet.
  }
  // Countries first: the bulk write isn't atomic, so index.json should never point at data that isn't there yet.
  return [...countries.sort(), 'index.json'];
}

export interface PublishResult {
  uploaded: string[];
  unchanged: string[];
}

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

  const changed: { key: string; value: string; hash: string }[] = [];
  const unchanged: string[] = [];
  for (const key of await publicKeys(dataDir)) {
    let value: string;
    try {
      value = await readFile(join(dataDir, key), 'utf8');
    } catch {
      continue;
    }
    const hash = createHash('sha256').update(value).digest('hex');
    if (published[key] === hash) unchanged.push(key);
    else changed.push({ key, value, hash });
  }

  if (changed.length === 0) {
    log('[publish] KV already up to date');
    return { uploaded: [], unchanged };
  }

  // One request for all keys (KV bulk write); each key still counts as one write.
  const url = `https://api.cloudflare.com/client/v4/accounts/${cfg.accountId}/storage/kv/namespaces/${cfg.namespaceId}/bulk`;
  const res = await doFetch(url, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${cfg.apiToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(changed.map(({ key, value }) => ({ key, value }))),
    signal: AbortSignal.timeout(30_000),
  });
  const body = (await res.json().catch(() => null)) as { success?: boolean; errors?: { message: string }[] } | null;
  if (!res.ok || !body?.success) {
    const detail = body?.errors?.map((e) => e.message).join('; ') || `HTTP ${res.status}`;
    throw new Error(`KV bulk write failed: ${detail}`);
  }

  // Only remember hashes once Cloudflare confirmed the write, so failures retry next run.
  for (const { key, hash } of changed) published[key] = hash;
  await writeJsonAtomic(stateFile, published);
  const uploaded = changed.map((c) => c.key);
  log(`[publish] uploaded ${uploaded.join(', ')} to KV`);
  return { uploaded, unchanged };
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
