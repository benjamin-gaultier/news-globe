import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/**
 * Opt-in self-update for the ingest machine (AUTO_UPDATE=1 in .env): before
 * each run the watcher fast-forwards the checkout to origin/main, so merged
 * feeds and fixes reach the Pi without anyone logging in. It never merges,
 * rebases or discards anything: with local changes or a diverged branch it
 * logs why and keeps running the current code.
 *
 * `main` only moves through pull requests whose CI passed (typecheck, tests,
 * build), so what arrives here has been checked.
 */

const REPO = fileURLToPath(new URL('../../..', import.meta.url));
const BRANCH = 'main';

/** Changed paths that need `pnpm install` before the next run. */
const NEEDS_INSTALL = /(^|\/)(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml)$/;
/** Changed paths that only take effect when the watcher process itself restarts. */
const NEEDS_RESTART = /^packages\/ingest\/src\/(watch|update)\.ts$/;

export interface UpdatePlan {
  install: boolean;
  restart: boolean;
}

/** What an update touching these paths requires. */
export function planUpdate(changedPaths: readonly string[]): UpdatePlan {
  return {
    install: changedPaths.some((p) => NEEDS_INSTALL.test(p)),
    restart: changedPaths.some((p) => NEEDS_RESTART.test(p)),
  };
}

function run(repo: string, cmd: string, args: string[], timeoutMs = 120_000): { ok: boolean; out: string } {
  const res = spawnSync(cmd, args, { cwd: repo, encoding: 'utf8', timeout: timeoutMs });
  return { ok: res.status === 0, out: `${res.stdout ?? ''}${res.stderr ?? ''}`.trim() };
}

export type UpdateResult = 'up-to-date' | 'updated' | 'restart' | 'skipped';

/** Fast-forwards to origin/main if it moved. Returns 'restart' when the watcher must restart to use the new code. */
export function selfUpdate(log: (msg: string) => void = console.log, repo = REPO): UpdateResult {
  const say = (msg: string) => log(`[ingest:update] ${msg}`);
  const git = (...args: string[]) => run(repo, 'git', args);
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
  if (!branch.ok || branch.out !== BRANCH) {
    say(`skipped: checkout is on "${branch.out}", not ${BRANCH}`);
    return 'skipped';
  }
  if (git('status', '--porcelain', '--untracked-files=no').out) {
    say('skipped: the checkout has local changes');
    return 'skipped';
  }
  const fetched = git('fetch', '--quiet', 'origin', BRANCH);
  if (!fetched.ok) {
    say(`skipped: git fetch failed: ${fetched.out}`);
    return 'skipped';
  }
  const head = git('rev-parse', 'HEAD').out;
  const remote = git('rev-parse', `origin/${BRANCH}`).out;
  if (head === remote) return 'up-to-date';

  const changed = git('diff', '--name-only', head, remote).out.split('\n').filter(Boolean);
  const merged = git('merge', '--ff-only', '--quiet', `origin/${BRANCH}`);
  if (!merged.ok) {
    say(`skipped: cannot fast-forward to origin/${BRANCH}: ${merged.out}`);
    return 'skipped';
  }
  say(`updated ${head.slice(0, 7)} → ${remote.slice(0, 7)} (${changed.length} files)`);

  const plan = planUpdate(changed);
  if (plan.install) {
    const installed = run(repo, 'pnpm', ['install', '--frozen-lockfile'], 600_000);
    if (!installed.ok) say(`pnpm install failed; the run may fail until the next update: ${installed.out.slice(-500)}`);
    else say('dependencies installed');
  }
  return plan.restart ? 'restart' : 'updated';
}
