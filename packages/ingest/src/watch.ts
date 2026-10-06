import cron from 'node-cron';
import { runIngest } from './pipeline';
import { INGEST_SETTINGS } from './sources.config';

let running = false;

async function tick(): Promise<void> {
  if (running) {
    console.log('[ingest:watch] previous run still in progress, skipping');
    return;
  }
  running = true;
  const started = new Date();
  console.log(`[ingest:watch] run at ${started.toISOString()}`);
  try {
    await runIngest();
  } catch (err) {
    console.error('[ingest:watch] run failed:', err);
  } finally {
    running = false;
  }
}

console.log(`[ingest:watch] schedule "${INGEST_SETTINGS.cronSchedule}" — running once now`);
cron.schedule(INGEST_SETTINGS.cronSchedule, () => void tick());
void tick();
