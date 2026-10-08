import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { planUpdate, selfUpdate } from '../src/update';

describe('planUpdate', () => {
  it('installs on dependency changes and restarts on watcher changes', () => {
    expect(planUpdate(['packages/ingest/src/sources.config.ts'])).toEqual({ install: false, restart: false });
    expect(planUpdate(['pnpm-lock.yaml'])).toEqual({ install: true, restart: false });
    expect(planUpdate(['apps/web/package.json'])).toEqual({ install: true, restart: false });
    expect(planUpdate(['packages/ingest/src/watch.ts'])).toEqual({ install: false, restart: true });
    expect(planUpdate(['packages/ingest/src/update.ts', 'package.json'])).toEqual({ install: true, restart: true });
  });
});

describe('selfUpdate', () => {
  let root: string;
  let origin: string;
  let pi: string;
  let author: string;
  const quiet = () => {};
  const git = (cwd: string, ...args: string[]) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const commit = async (cwd: string, path: string, content: string) => {
    await mkdir(dirname(join(cwd, path)), { recursive: true });
    await writeFile(join(cwd, path), content);
    git(cwd, 'add', path);
    git(cwd, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', `edit ${path}`);
  };

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'news-globe-update-'));
    origin = join(root, 'origin.git');
    author = join(root, 'author');
    pi = join(root, 'pi');
    git(root, 'init', '-q', '--bare', '-b', 'main', origin);
    git(root, 'clone', '-q', origin, author);
    await commit(author, 'README.md', 'v1');
    git(author, 'push', '-q', 'origin', 'main');
    git(root, 'clone', '-q', origin, pi);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('fast-forwards to origin/main', async () => {
    expect(selfUpdate(quiet, pi)).toBe('up-to-date');
    await commit(author, 'packages/ingest/src/sources.config.ts', 'feeds');
    git(author, 'push', '-q', 'origin', 'main');
    expect(selfUpdate(quiet, pi)).toBe('updated');
    expect(git(pi, 'rev-parse', 'HEAD')).toBe(git(author, 'rev-parse', 'HEAD'));
  });

  it('asks for a restart when the watcher changed', async () => {
    await commit(author, 'packages/ingest/src/watch.ts', 'new watcher');
    git(author, 'push', '-q', 'origin', 'main');
    expect(selfUpdate(quiet, pi)).toBe('restart');
  });

  it('leaves local changes and a diverged branch alone', async () => {
    await commit(author, 'README.md', 'v2');
    git(author, 'push', '-q', 'origin', 'main');

    await writeFile(join(pi, 'README.md'), 'edited on the Pi');
    expect(selfUpdate(quiet, pi)).toBe('skipped');

    git(pi, 'checkout', '-q', '--', 'README.md');
    await commit(pi, 'local.txt', 'a commit only the Pi has');
    const before = git(pi, 'rev-parse', 'HEAD');
    expect(selfUpdate(quiet, pi)).toBe('skipped');
    expect(git(pi, 'rev-parse', 'HEAD')).toBe(before);
  });

  it('stays off other branches', async () => {
    git(pi, 'checkout', '-q', '-b', 'experiment');
    expect(selfUpdate(quiet, pi)).toBe('skipped');
  });
});
