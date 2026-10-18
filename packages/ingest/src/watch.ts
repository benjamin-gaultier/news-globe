import './env';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import cron from 'node-cron';
import { selfUpdate } from './update';

// Each run is a fresh `cli.ts` process, so a `git pull` (new feeds, new
// countries, code fixes) takes effect at the next run without restarting the
// service. process.execArgv carries tsx's loader flags over to the child.
const CLI = fileURLToPath(new URL('./cli.ts', import.meta.url));
const ARCHIVE = fileURLToPath(new URL('./archive-remote.ts', import.meta.url));

/**
 * node-cron schedule: hourly, which is plenty for a front page and keeps the
 * load on publishers (and the Pi) low. INGEST_SETTINGS.minFetchIntervalMs stays
 * the hard floor for manual runs and probes. It lives here, not in
 * sources.config.ts, so changing it restarts the watcher (see update.ts) while
 * adding feeds does not.
 */
const CRON_SCHEDULE = '0 * * * *';
/**
 * A run or archive step still going after this is killed, so a hung request
 * can't block every later run. A normal run takes a few minutes.
 */
const RUN_TIMEOUT_MS = 45 * 60_000;
const ARCHIVE_TIMEOUT_MS = 10 * 60_000;

let running = false;

/** AUTO_UPDATE=1: pull merged changes from origin/main before each run (see update.ts). */
const AUTO_UPDATE = process.env.AUTO_UPDATE === '1';
/**
 * ARCHIVE_AFTER_RUN=1: after each successful run, add it to the history archive
 * and rebuild trends, search, `today` and translations (archive-remote.ts), so
 * they follow every run instead of waiting for the hourly GitHub workflow,
 * which GitHub often delays or skips. Uses the same Cloudflare settings, plus
 * AZURE_TRANSLATOR_KEY / AZURE_TRANSLATOR_REGION for translations.
 */
const ARCHIVE_AFTER_RUN = process.env.ARCHIVE_AFTER_RUN === '1';
/**
 * Exit code asking systemd to start the watcher again (Restart=on-failure),
 * when an update changed the watcher itself. The service runs the next tick on start.
 */
const EXIT_FOR_RESTART = 75;

function tick(): void {
  if (running) {
    console.log('[ingest:watch] previous run still in progress, skipping');
    return;
  }
  running = true;
  if (AUTO_UPDATE && selfUpdate() === 'restart') {
    console.log('[ingest:watch] the watcher itself changed: restarting to load it');
    process.exit(EXIT_FOR_RESTART);
  }
  console.log(`[ingest:watch] run at ${new Date().toISOString()}`);
  const child = spawn(process.execPath, [...process.execArgv, CLI], { stdio: 'inherit', timeout: RUN_TIMEOUT_MS });
  child.on('error', (err) => {
    console.error('[ingest:watch] could not start run:', err);
    running = false;
  });
  child.on('exit', (code, signal) => {
    if (code !== 0) {
      console.error(`[ingest:watch] run failed (${signal ?? `exit ${code}`})`);
      running = false;
    } else if (ARCHIVE_AFTER_RUN) archive();
    else running = false;
  });
}

/** The archive step, as a fresh process like the run (so an update applies to it too). */
function archive(): void {
  const child = spawn(process.execPath, [...process.execArgv, ARCHIVE], { stdio: 'inherit', timeout: ARCHIVE_TIMEOUT_MS });
  const done = (failure?: string) => {
    if (failure) console.error(`[ingest:watch] archive failed (${failure}); the health workflow will retry`);
    running = false;
  };
  child.on('error', (err) => done(err.message));
  child.on('exit', (code, signal) => done(code === 0 ? undefined : (signal ?? `exit ${code}`)));
}

console.log(
  `[ingest:watch] schedule "${CRON_SCHEDULE}"${AUTO_UPDATE ? ', auto-update on' : ''}` +
    `${ARCHIVE_AFTER_RUN ? ', archive after each run' : ''} — running once now`,
);
cron.schedule(CRON_SCHEDULE, tick);
tick();
