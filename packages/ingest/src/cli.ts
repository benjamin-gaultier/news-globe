import './env';
import { DEFAULT_DATA_DIR, runIngest } from './pipeline';
import { publishIfConfigured } from './publish';

const started = Date.now();
console.log(`[ingest] writing to ${DEFAULT_DATA_DIR}`);
runIngest()
  .then(() => publishIfConfigured(DEFAULT_DATA_DIR))
  .then(() => console.log(`[ingest] done in ${((Date.now() - started) / 1000).toFixed(1)}s`))
  .catch((err) => {
    console.error('[ingest] failed:', err);
    process.exitCode = 1;
  });
