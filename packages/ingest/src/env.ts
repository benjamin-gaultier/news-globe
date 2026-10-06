import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Loads a repo-root `.env` (if present) into process.env. Imported first by the
 * entry points so settings like DATA_DIR are visible to every other module.
 * Variables already set in the environment win over the file.
 */
const envFile = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);
