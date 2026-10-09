/**
 * Workers KV through the Cloudflare REST API, so the machine running the
 * ingest (e.g. a Raspberry Pi) needs no wrangler install — just an API token
 * scoped to "Workers KV Storage: Edit". The Worker in apps/web reads the same
 * namespace. Writes count against the free tier's 1,000 a day.
 */

export interface KvConfig {
  accountId: string;
  namespaceId: string;
  apiToken: string;
}

/** The namespace from the CLOUDFLARE_* env vars: null when none is set, an error when only some are. */
export function kvConfigFromEnv(env: NodeJS.ProcessEnv = process.env): KvConfig | null {
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

export interface Kv {
  /** The value's bytes, or null when the key doesn't exist. */
  get(key: string): Promise<Uint8Array | null>;
  /** Throws unless Cloudflare confirms the write. */
  put(key: string, body: Uint8Array): Promise<void>;
}

const TIMEOUT_MS = 30_000;

export function kvClient(cfg: KvConfig, fetchImpl: typeof fetch = fetch): Kv {
  const url = (key: string) =>
    `https://api.cloudflare.com/client/v4/accounts/${cfg.accountId}/storage/kv/namespaces/${cfg.namespaceId}/values/${encodeURIComponent(key)}`;
  return {
    async get(key) {
      const res = await fetchImpl(url(key), {
        headers: { Authorization: `Bearer ${cfg.apiToken}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`KV read of ${key} failed: HTTP ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    },
    async put(key, body) {
      const res = await fetchImpl(url(key), {
        method: 'PUT',
        headers: { Authorization: `Bearer ${cfg.apiToken}`, 'Content-Type': 'application/octet-stream' },
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const json = (await res.json().catch(() => null)) as { success?: boolean; errors?: { message: string }[] } | null;
      if (!res.ok || !json?.success) {
        throw new Error(`KV write of ${key} failed: ${json?.errors?.map((e) => e.message).join('; ') || `HTTP ${res.status}`}`);
      }
    },
  };
}
