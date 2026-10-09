import './env';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import type { ArchiveDay, IndexFile } from '@news-globe/shared';
import { BUNDLE_KEY, bundleKeys, readBundleEntry } from '@news-globe/shared/bundle';
import { archiveFile, archiveRun, publishArchiveToKv, readRun } from './archive';
import { buildSearch, buildToday, buildTrends } from './derived';
import { publishConfigFromEnv, type PublishConfig } from './publish';
import {
  azureConfigFromEnv,
  azureTranslator,
  headlinesToTranslate,
  translateHeadlines,
  type TranslateCache,
  type Translator,
} from './translate';

/**
 * Builds the history archive from what is already published: reads the bundle
 * from KV, adds its run to that day's archive (also in KV), and uploads the day
 * again. The ingest watcher runs it right after each successful run when
 * ARCHIVE_AFTER_RUN=1 (watch.ts), and the health workflow
 * (.github/workflows/health.yml) runs it too, as a fallback. A run already in
 * the archive is not uploaded twice, so running both is safe.
 *
 * It then derives `trends`, `search` and `today` from the same run (see
 * derived.ts) and stores them gzipped in KV; the Worker serves them as
 * /data/trends.json, /data/search.json and /data/today.json. With a
 * translator (Azure, see translate.ts), it also publishes `translations`
 * (/data/translations.json), remembering what it translated in
 * `translate-cache`.
 */

export type RemoteArchiveOutcome = 'archived' | 'already-archived' | 'nothing-published';

const valueUrl = (cfg: PublishConfig, key: string) =>
  `https://api.cloudflare.com/client/v4/accounts/${cfg.accountId}/storage/kv/namespaces/${cfg.namespaceId}/values/${encodeURIComponent(key)}`;

async function kvPut(cfg: PublishConfig, key: string, body: Uint8Array, doFetch: typeof fetch): Promise<void> {
  const res = await doFetch(valueUrl(cfg, key), {
    method: 'PUT',
    headers: { Authorization: `Bearer ${cfg.apiToken}`, 'Content-Type': 'application/octet-stream' },
    body,
    signal: AbortSignal.timeout(30_000),
  });
  const json = (await res.json().catch(() => null)) as { success?: boolean; errors?: { message: string }[] } | null;
  if (!res.ok || !json?.success) {
    throw new Error(`KV write of ${key} failed: ${json?.errors?.map((e) => e.message).join('; ') || `HTTP ${res.status}`}`);
  }
}

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
  opts: { fetchImpl?: typeof fetch; log?: (msg: string) => void; translator?: Translator } = {},
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
    const gzipped = await readFile(archiveFile(dir, date));
    log(`[archive] added run ${index.updatedAt} to ${date} (${Math.round(gzipped.length / 1024)} KiB)`);

    // Trends, search and Today for this run, from the day just written and the published files.
    const day = JSON.parse(gunzipSync(gzipped).toString('utf8')) as ArchiveDay;
    const run = await readRun(dir);
    const units = run?.units ?? [];
    const trends = buildTrends(day, index.updatedAt, units);
    const today = buildToday(trends, units);
    for (const [key, value] of [
      ['trends', trends],
      ['search', buildSearch(index.updatedAt, units)],
      ['today', today],
    ] as const) {
      const body = gzipSync(JSON.stringify(value));
      await kvPut(cfg, key, body, doFetch);
      log(`[archive] uploaded ${key} (${Math.round(body.length / 1024)} KiB)`);
    }

    // English for the most-seen headlines: new ones translated, the rest remembered.
    if (opts.translator) {
      const cached = await kvGet(cfg, 'translate-cache', doFetch);
      const previous = cached ? (JSON.parse(gunzipSync(cached).toString('utf8')) as TranslateCache) : null;
      const result = await translateHeadlines(headlinesToTranslate(today, index, units), previous, opts.translator, {
        runAt: index.updatedAt,
        log,
      });
      await kvPut(cfg, 'translations', gzipSync(JSON.stringify(result.file)), doFetch);
      if (result.changed) await kvPut(cfg, 'translate-cache', gzipSync(JSON.stringify(result.cache)), doFetch);
      log(
        `[translate] ${Object.keys(result.file.items).length} headlines in English; ${result.sent} characters sent ` +
          `(${result.cache.usage.chars} this month)`,
      );
    }
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
    const azure = azureConfigFromEnv();
    if (!azure) console.log('[translate] AZURE_TRANSLATOR_KEY not set: no translations');
    archiveFromKv(cfg, { translator: azure ? azureTranslator(azure) : undefined }).catch((err) => {
      console.error('[archive] failed:', err instanceof Error ? err.message : err);
      process.exitCode = 1;
    });
  }
}
