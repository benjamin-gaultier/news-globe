import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import cron from 'node-cron';
import { INGEST_SETTINGS } from './sources.config';

// Each run is a fresh `cli.ts` process, so a `git pull` (new feeds, new
// countries, code fixes) takes effect at the next run without restarting the
// service. process.execArgv carries tsx's loader flags over to the child.
const CLI = fileURLToPath(new URL('./cli.ts', import.meta.url));

let running = false;

function tick(): void {
  if (running) {
    console.log('[ingest:watch] previous run still in progress, skipping');
    return;
  }
  running = true;
  console.log(`[ingest:watch] run at ${new Date().toISOString()}`);
  const child = spawn(process.execPath, [...process.execArgv, CLI], { stdio: 'inherit' });
  child.on('error', (err) => {
    console.error('[ingest:watch] could not start run:', err);
    running = false;
  });
  child.on('exit', (code, signal) => {
    if (code !== 0) console.error(`[ingest:watch] run failed (${signal ?? `exit ${code}`})`);
    running = false;
  });
}

console.log(`[ingest:watch] schedule "${INGEST_SETTINGS.cronSchedule}" — running once now`);
cron.schedule(INGEST_SETTINGS.cronSchedule, tick);
tick();
