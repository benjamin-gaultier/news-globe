import * as fs from 'node:fs/promises';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { writeJsonAtomic } from '../src/write';

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, rename: vi.fn(actual.rename) };
});

const rename = vi.mocked(fs.rename);
const errno = (code: string) => Object.assign(new Error(code), { code });

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'news-globe-write-'));
});

afterEach(async () => {
  rename.mockReset();
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
  rename.mockImplementation(actual.rename);
  await rm(dir, { recursive: true, force: true });
});

describe('writeJsonAtomic', () => {
  it('creates missing directories and writes pretty JSON with a trailing newline', async () => {
    const file = join(dir, 'a', 'b', 'out.json');
    await writeJsonAtomic(file, { x: 1 });
    expect(await readFile(file, 'utf8')).toBe('{\n  "x": 1\n}\n');
    expect(await readdir(join(dir, 'a', 'b'))).toEqual(['out.json']);
  });

  it('retries a rename that fails transiently (a reader holding the file on Windows)', async () => {
    rename.mockRejectedValueOnce(errno('EBUSY')).mockRejectedValueOnce(errno('EPERM'));
    const file = join(dir, 'out.json');

    await writeJsonAtomic(file, [1, 2]);

    expect(rename).toHaveBeenCalledTimes(3);
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual([1, 2]);
  });

  it('gives up on any other error and removes its temp file', async () => {
    rename.mockRejectedValueOnce(errno('EXDEV'));
    const file = join(dir, 'out.json');

    await expect(writeJsonAtomic(file, {})).rejects.toThrow('EXDEV');

    expect(rename).toHaveBeenCalledTimes(1);
    expect(await readdir(dir)).toEqual([]);
  });
});
