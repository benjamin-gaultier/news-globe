import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

// On Windows, renaming over a file another process has open (the dev server
// streaming it, an antivirus scan) fails transiently with one of these.
const TRANSIENT_RENAME_ERRORS = new Set(['EPERM', 'EACCES', 'EBUSY']);

async function renameWithRetry(from: string, to: string, attempts = 8): Promise<void> {
  for (let i = 1; ; i++) {
    try {
      await rename(from, to);
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code ?? '';
      if (i >= attempts || !TRANSIENT_RENAME_ERRORS.has(code)) throw err;
      await sleep(25 * 2 ** i);
    }
  }
}

/** Write JSON via tmp file + rename so readers never see a half-written file. */
export async function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await renameWithRetry(tmp, file);
  } catch (err) {
    await rm(tmp, { force: true });
    throw err;
  }
}
