import './env';
import { writeStatus } from './health';
import { DEFAULT_DATA_DIR, runIngest } from './pipeline';
import { publishIfConfigured } from './publish';

// --offline: rebuild from data/.cache only, no requests and no publishing. Lets a dev
// machine test clustering while the Pi is the only machine polling the feeds.
const offline = process.argv.includes('--offline');

const started = Date.now();
console.log(`[ingest] writing to ${DEFAULT_DATA_DIR}${offline ? ' (offline: cache only, no publish)' : ''}`);
runIngest({ offline })
  .then(() => (offline ? undefined : writeStatus(DEFAULT_DATA_DIR)))
  .then(() => (offline ? undefined : publishIfConfigured(DEFAULT_DATA_DIR)))
  .then(() => console.log(`[ingest] done in ${((Date.now() - started) / 1000).toFixed(1)}s`))
  .catch((err) => {
    console.error('[ingest] failed:', err);
    process.exitCode = 1;
  });
