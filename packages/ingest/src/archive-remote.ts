import './env';
import { pathToFileURL } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';
import type { ArchiveDay, TodayFile } from '@news-globe/shared';
import { archiveKey, BUNDLE_KEY, KV_KEYS } from '@news-globe/shared/bundle';
import { addRun, runFromBundle } from './archive';
import { buildSearch, buildToday, buildTrends } from './derived';
import { kvClient, kvConfigFromEnv, type KvConfig } from './kv';
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

const unzipJson = <T>(bytes: Uint8Array): T => JSON.parse(gunzipSync(bytes).toString('utf8')) as T;
const zipJson = (value: unknown) => gzipSync(JSON.stringify(value));

export async function archiveFromKv(
  cfg: KvConfig,
  opts: { fetchImpl?: typeof fetch; log?: (msg: string) => void; translator?: Translator } = {},
): Promise<RemoteArchiveOutcome> {
  const kv = kvClient(cfg, opts.fetchImpl);
  const log = opts.log ?? console.log;
  const bundle = await kv.get(BUNDLE_KEY);
  const run = bundle && runFromBundle(bundle);
  if (!run) {
    log('[archive] nothing published yet');
    return 'nothing-published';
  }
  const { runAt, units, index } = run;
  const date = runAt.slice(0, 10);
  const upload = async (key: string, body: Uint8Array) => {
    await kv.put(key, body);
    log(`[archive] uploaded ${key} (${Math.round(body.length / 1024)} KiB)`);
  };

  // The day first: history can't be rebuilt later, unlike the files derived from it.
  // `today` goes up last and marks the run as complete, so a retry after a failed
  // derived upload rebuilds them instead of stopping at "already archived".
  const existing = await kv.get(archiveKey(date));
  const known = existing ? unzipJson<ArchiveDay>(existing) : null;
  let day: ArchiveDay;
  if (known?.runs[runAt]) {
    const today = await kv.get(KV_KEYS.today);
    if (today && unzipJson<TodayFile>(today).runAt === runAt) {
      log(`[archive] run ${runAt} already archived`);
      return 'already-archived';
    }
    log(`[archive] run ${runAt} already in ${date}; rebuilding what is derived from it`);
    day = known;
  } else {
    day = addRun(known, run);
    await upload(archiveKey(date), zipJson(day));
  }

  // Trends, search and `today` for this run, from the day and the published files.
  const trends = buildTrends(day, runAt, units);
  const today = buildToday(trends, units);
  await upload(KV_KEYS.trends, zipJson(trends));
  await upload(KV_KEYS.search, zipJson(buildSearch(runAt, units)));

  // English for the most-seen headlines: new ones translated, the rest remembered.
  // A failure here only leaves the previous translations up: it never blocks the run.
  if (opts.translator) {
    try {
      const cached = await kv.get(KV_KEYS.translateCache);
      const previous = cached ? unzipJson<TranslateCache>(cached) : null;
      const result = await translateHeadlines(headlinesToTranslate(today, index, units), previous, opts.translator, { runAt, log });
      // The cache first: it records the characters just sent, which count against the month's budget.
      if (result.changed) await kv.put(KV_KEYS.translateCache, zipJson(result.cache));
      await kv.put(KV_KEYS.translations, zipJson(result.file));
      log(
        `[translate] ${Object.keys(result.file.items).length} headlines in English; ${result.sent} characters sent ` +
          `(${result.cache.usage.chars} this month)`,
      );
    } catch (err) {
      log(`[translate] failed, keeping the previous translations: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  await upload(KV_KEYS.today, zipJson(today));
  return 'archived';
}

// `pnpm --filter @news-globe/ingest archive:remote`
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const cfg = kvConfigFromEnv();
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
