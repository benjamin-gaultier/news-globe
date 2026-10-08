import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import type { ArchiveDay, IndexFile } from '@news-globe/shared';
import { BUNDLE_KEY, bundleKeys, readBundleEntry } from '@news-globe/shared/bundle';
import { archiveFile, archiveRun, publishArchiveToKv } from './archive';
import { publishConfigFromEnv, type PublishConfig } from './publish';

/**
 * Builds the history archive from what is already published, so it does not
 * depend on the machine running the ingest: reads the bundle from KV, adds its
 * run to that day's archive (also in KV), and uploads the day again. The
 * hourly health workflow (.github/workflows/health.yml) runs it, so history
 * keeps growing whatever code the Pi runs. A run already in the archive is
 * not uploaded twice.
 */

export type RemoteArchiveOutcome = 'archived' | 'already-archived' | 'nothing-published';

const valueUrl = (cfg: PublishConfig, key: string) =>
  `https://api.cloudflare.com/client/v4/accounts/${cfg.accountId}/storage/kv/namespaces/${cfg.namespaceId}/values/${encodeURIComponent(key)}`;

async function kvGet(cfg: PublishConfig, key: string, doFetch: typeof fetch): Promise<Uint8Array | null> {
  const res = await doFetch(valueUrl(cfg, key), {
    headers: { Authorization: `Bearer ${cfg.apiToken}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`KV read of ${key} failed: HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

export async function archiveFromKv(
  cfg: PublishConfig,
  opts: { fetchImpl?: typeof fetch; log?: (msg: string) => void } = {},
): Promise<RemoteArchiveOutcome> {
  const doFetch = opts.fetchImpl ?? fetch;
  const log = opts.log ?? console.log;
  const bundle = await kvGet(cfg, BUNDLE_KEY, doFetch);
  const indexBytes = bundle && readBundleEntry(bundle, 'index.json');
  if (!bundle || !indexBytes) {
    log('[archive] nothing published yet');
    return 'nothing-published';
  }
  const index = JSON.parse(new TextDecoder().decode(indexBytes)) as IndexFile;
  const date = index.updatedAt.slice(0, 10);

  const dir = await mkdtemp(join(tmpdir(), 'news-globe-archive-'));
  try {
    // The run as published: index.json plus every country and region file.
    for (const key of bundleKeys(bundle)) {
      const bytes = readBundleEntry(bundle, key);
      if (!bytes) continue;
      await mkdir(dirname(join(dir, key)), { recursive: true });
      await writeFile(join(dir, key), bytes);
    }
    // The day so far.
    const existing = await kvGet(cfg, `archive/${date}`, doFetch);
    if (existing) {
      const day = JSON.parse(gunzipSync(existing).toString('utf8')) as ArchiveDay;
      if (day.runs[index.updatedAt]) {
        log(`[archive] run ${index.updatedAt} already archived`);
        return 'already-archived';
      }
      await mkdir(dirname(archiveFile(dir, date)), { recursive: true });
      await writeFile(archiveFile(dir, date), existing);
    }
    await archiveRun(dir);
    await publishArchiveToKv(dir, cfg, { now: Date.parse(index.updatedAt), fetchImpl: doFetch, log });
    const size = (await readFile(archiveFile(dir, date))).length;
    log(`[archive] added run ${index.updatedAt} to ${date} (${Math.round(size / 1024)} KiB)`);
    return 'archived';
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// `pnpm --filter @news-globe/ingest archive:remote`
if (import.meta.url === `file://${process.argv[1]}`) {
  const cfg = publishConfigFromEnv();
  if (!cfg) {
    console.error('[archive] set CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_KV_NAMESPACE_ID and CLOUDFLARE_API_TOKEN');
    process.exitCode = 1;
  } else {
    archiveFromKv(cfg).catch((err) => {
      console.error('[archive] failed:', err instanceof Error ? err.message : err);
      process.exitCode = 1;
    });
  }
}
