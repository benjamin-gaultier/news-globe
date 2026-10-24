import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  COUNTRIES,
  lineCoverage,
  SCHEMA_VERSION,
  type CountryFile,
  type IndexFile,
  type TodayStory,
  type WorldStory,
} from '@news-globe/shared';
import { nationalStories, pickTop, type PublishedUnit } from './derived';
import { coverage, round3 } from './rank';
import { outletPools } from './sources.config';

/**
 * `pnpm --filter @news-globe/ingest ranking:report [--site URL | --dir DIR] [--prior 0.5,1,2]`: how
 * much the rankings that compare countries follow how many feeds a country has.
 * It reads a published run (the live site by default, or a local `data/`
 * directory) and prints, in Markdown, the world briefing's top stories two ways:
 * by raw outlets (how they were ranked before `coverage`) and as the code ranks
 * them now. For each it gives the share of the list going to countries with
 * few or many feeds next to their share of all countries, and Spearman's ρ
 * between a country's feeds and its best story's score. With `--prior`, it prints a
 * sweep of COVERAGE_PRIOR values instead (see priorSweep).
 */

/** Lines of the briefing compared: what fits on a screen. */
export const REPORT_TOP = 12;

/** One line of the briefing: its countries with their outlets and coverage. */
interface Line {
  title: string;
  countries: { code: string; outlets: number; coverage: number }[];
}

const sum = (xs: number[]) => xs.reduce((n, x) => n + x, 0);
const outletsOf = (l: Line) => sum(l.countries.map((c) => c.outlets));
const coverageOf = (l: Line) => lineCoverage(l.countries.map((c) => c.coverage));

/** Raw outlets first: how stories from different countries were ranked before coverage. */
const byOutlets = (a: TodayStory, b: TodayStory) => b.outlets - a.outlets || a.rank - b.rank || a.unit.localeCompare(b.unit);

/** The briefing's top lines, as apps/web/src/lib/briefing.ts builds them: cross-border stories absorb their national ones. */
function briefing(top: TodayStory[], world: WorldStory[], by: 'outlets' | 'coverage'): Line[] {
  const lines: Line[] = [];
  const shared = new Set<string>();
  for (const w of world) {
    const countries = w.countries.map((c) => ({ code: c.code, outlets: c.outletCount24h, coverage: c.coverage ?? 0 }));
    lines.push({ title: w.countries[0]?.title ?? w.id, countries });
    for (const c of w.countries) shared.add(`${c.code}/${c.clusterId}`);
  }
  for (const s of top) {
    if (shared.has(`${s.unit}/${s.clusterId}`)) continue;
    lines.push({ title: s.title, countries: [{ code: s.unit, outlets: s.outlets, coverage: s.coverage ?? 0 }] });
  }
  const score = by === 'outlets' ? outletsOf : coverageOf;
  return (
    lines
      // As in the app: by coverage, equal lines keep Today's order (stable sort) rather than falling back to outlets.
      .sort((a, b) => score(b) - score(a) || b.countries.length - a.countries.length)
      .slice(0, REPORT_TOP)
  );
}

/** Spearman's rank correlation, ties given their average rank. */
export function spearman(xs: number[], ys: number[]): number {
  const ranks = (v: number[]) => {
    const order = v.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]);
    const r = new Array<number>(v.length);
    for (let i = 0; i < order.length; ) {
      let j = i;
      while (j + 1 < order.length && order[j + 1]![0] === order[i]![0]) j++;
      for (let k = i; k <= j; k++) r[order[k]![1]] = (i + j) / 2 + 1;
      i = j + 1;
    }
    return r;
  };
  const rx = ranks(xs);
  const ry = ranks(ys);
  const mx = sum(rx) / rx.length;
  const my = sum(ry) / ry.length;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < rx.length; i++) {
    num += (rx[i]! - mx) * (ry[i]! - my);
    dx += (rx[i]! - mx) ** 2;
    dy += (ry[i]! - my) ** 2;
  }
  return dx && dy ? num / Math.sqrt(dx * dy) : 0;
}

/** Feed-count buckets for the distribution tables. */
const BUCKETS: [label: string, min: number, max: number][] = [
  ['1–2', 1, 2],
  ['3', 3, 3],
  ['4', 4, 4],
  ['5', 5, 5],
  ['6', 6, 6],
  ['7–8', 7, Infinity],
];

const pct = (n: number, of: number) => (of ? `${Math.round((100 * n) / of)}%` : '–');
const fixed = (x: number, d = 2) => x.toFixed(d);

/** Share of the countries named in `slots` that fall in each feed bucket, next to the share of all countries. */
function distribution(rows: [label: string, slots: string[]][], pools: ReadonlyMap<string, number>, countries: string[]): string[] {
  const bucketOf = (code: string) => BUCKETS.findIndex(([, min, max]) => (pools.get(code) ?? 0) >= min && (pools.get(code) ?? 0) <= max);
  const out = [
    `| Feeds per country | Countries | ${rows.map(([label]) => label).join(' | ')} |`,
    `|---|---|${rows.map(() => '---|').join('')}`,
  ];
  BUCKETS.forEach(([label], b) => {
    const inBucket = countries.filter((c) => bucketOf(c) === b).length;
    const cells = rows.map(([, slots]) => {
      const n = slots.filter((c) => bucketOf(c) === b).length;
      return `${n} (${pct(n, slots.length)})`;
    });
    out.push(`| ${label} | ${inBucket} (${pct(inBucket, countries.length)}) | ${cells.join(' | ')} |`);
  });
  const meanPool = (codes: string[]) => (codes.length ? fixed(sum(codes.map((c) => pools.get(c) ?? 0)) / codes.length, 1) : '–');
  out.push(`| **Mean feeds** | ${meanPool(countries)} | ${rows.map(([, slots]) => meanPool(slots)).join(' | ')} |`);
  return out;
}

const cut = (title: string, n = 70) => (title.length > n ? `${title.slice(0, n - 1)}…` : title).replace(/\|/g, '/');

function lineList(label: string, lines: Line[], pools: ReadonlyMap<string, number>): string[] {
  return [
    `**${label}**`,
    '',
    '| # | Story | Countries (outlets / feeds) | Outlets | Coverage |',
    '|---|---|---|---|---|',
    ...lines.map(
      (l, i) =>
        `| ${i + 1} | ${cut(l.title)} | ${l.countries.map((c) => `${c.code} ${c.outlets}/${pools.get(c.code) ?? '?'}`).join(', ')} | ${outletsOf(l)} | ${fixed(coverageOf(l))} |`,
    ),
    '',
  ];
}

/**
 * The report for one run's national files and cross-border stories, in Markdown: the world briefing's
 * top stories ranked by raw outlets (before) and by coverage (after).
 */
export function rankingReport(units: PublishedUnit[], world: WorldStory[], pools: ReadonlyMap<string, number>, runAt: string): string {
  const all = nationalStories({ schemaVersion: SCHEMA_VERSION, runAt, runs: [runAt], units: {}, change: {} }, units, pools);
  // An index from before coverage: give its cross-border stories theirs.
  const worldNow = world.map((w) => ({
    ...w,
    countries: w.countries.map((c) => ({ ...c, coverage: c.coverage ?? coverage(c.outletCount24h, pools.get(c.code) ?? 0) })),
  }));
  const before = { today: pickTop(all, byOutlets), lines: [] as Line[] };
  before.lines = briefing(before.today, worldNow, 'outlets');
  const after = { today: pickTop(all), lines: [] as Line[] };
  after.lines = briefing(after.today, worldNow, 'coverage');

  const countries = [...new Set(all.map((s) => s.unit))];
  if (!countries.length) throw new Error('no national stories in the run');
  const best = (code: string, key: 'outlets' | 'coverage') => Math.max(0, ...all.filter((s) => s.unit === code).map((s) => s[key] ?? 0));
  const feeds = countries.map((c) => pools.get(c) ?? 0);
  const rhoOutlets = spearman(
    feeds,
    countries.map((c) => best(c, 'outlets')),
  );
  const rhoCoverage = spearman(
    feeds,
    countries.map((c) => best(c, 'coverage')),
  );
  const slots = (lines: Line[]) => lines.flatMap((l) => l.countries.map((c) => c.code));

  return [
    `## Ranking vs feeds per country — run ${runAt}`,
    '',
    `${countries.length} countries, ${sum(feeds)} national outlets (${Math.min(...feeds)}–${Math.max(...feeds)} per country). ` +
      '"Before" ranks stories from different countries by raw outlets, "after" by coverage: the share of the ' +
      "country's other outlets on the story (see `coverage` in packages/ingest/src/rank.ts), added up over a " +
      "cross-border story's countries with a bonus for each extra country (`lineCoverage` in packages/shared).",
    '',
    `### Who gets the top ${REPORT_TOP}`,
    '',
    'Each country named in a top line counts once per line. With no bias, each row would match the Countries column.',
    '',
    ...distribution(
      [
        ['Today top, before', before.today.map((s) => s.unit)],
        ['Today top, after', after.today.map((s) => s.unit)],
        ['Briefing, before', slots(before.lines)],
        ['Briefing, after', slots(after.lines)],
      ],
      pools,
      countries,
    ),
    '',
    "### How a country's best story tracks its feeds",
    '',
    `Spearman's ρ across ${countries.length} countries between feeds and the score of the country's best story ` +
      '(0 means no relation; 1 means more feeds always score higher):',
    '',
    `- by outlets (before): **${fixed(rhoOutlets)}**`,
    `- by coverage (after): **${fixed(rhoCoverage)}**`,
    '',
    `### The briefing's top ${REPORT_TOP}`,
    '',
    ...lineList('Before (raw outlets)', before.lines, pools),
    ...lineList('After (coverage)', after.lines, pools),
  ].join('\n');
}

/** Half the summed gap between the slots' split by feed bucket and all countries' split: 0 is no bias, 1 the most. */
function bucketGap(slots: string[], pools: ReadonlyMap<string, number>, countries: string[]): number {
  const share = (codes: string[], b: number) => {
    const [, min, max] = BUCKETS[b]!;
    return codes.length ? codes.filter((c) => (pools.get(c) ?? 0) >= min && (pools.get(c) ?? 0) <= max).length / codes.length : 0;
  };
  return sum(BUCKETS.map((_, b) => Math.abs(share(slots, b) - share(countries, b)))) / 2;
}

/**
 * The same run ranked with other values of COVERAGE_PRIOR, one row each: how the top lists split by
 * feeds (as bucketGap and mean feeds) and Spearman's ρ between feeds and a country's best coverage.
 * One run's top 12 is a small sample, so read several runs before changing the constant.
 */
export function priorSweep(
  units: PublishedUnit[],
  world: WorldStory[],
  pools: ReadonlyMap<string, number>,
  runAt: string,
  priors: number[],
): string {
  const base = nationalStories({ schemaVersion: SCHEMA_VERSION, runAt, runs: [runAt], units: {}, change: {} }, units, pools);
  const countries = [...new Set(base.map((s) => s.unit))];
  if (!countries.length) throw new Error('no national stories in the run');
  const feeds = countries.map((c) => pools.get(c) ?? 0);
  const meanFeeds = (codes: string[]) => fixed(sum(codes.map((c) => pools.get(c) ?? 0)) / codes.length, 1);
  const row = (label: string, today: TodayStory[], lines: Line[], best: (code: string) => number) => {
    const slots = lines.flatMap((l) => l.countries.map((c) => c.code));
    const units = today.map((s) => s.unit);
    return `| ${label} | ${fixed(spearman(feeds, countries.map(best)))} | ${fixed(bucketGap(units, pools, countries))} | ${meanFeeds(units)} | ${fixed(bucketGap(slots, pools, countries))} | ${meanFeeds(slots)} |`;
  };
  const bestOf = (all: TodayStory[], key: 'outlets' | 'coverage') => (code: string) =>
    Math.max(0, ...all.filter((s) => s.unit === code).map((s) => s[key] ?? 0));

  const rows = [
    `### COVERAGE_PRIOR sweep — run ${runAt}`,
    '',
    `Gap: half the summed difference between how the top ${REPORT_TOP} and all ${countries.length} countries (mean feeds ${meanFeeds(countries)}) split by feeds; 0 is no bias.`,
    '',
    '| Ranking | ρ(feeds, best story) | Today gap | Today mean feeds | Briefing gap | Briefing mean feeds |',
    '|---|---|---|---|---|---|',
  ];
  const today = pickTop(base, byOutlets);
  rows.push(row('raw outlets (before)', today, briefing(today, world, 'outlets'), bestOf(base, 'outlets')));
  for (const prior of priors) {
    const all = base.map((s) => ({ ...s, coverage: round3(coverage(s.outlets, pools.get(s.unit) ?? 0, prior)) }));
    const worldAt = world.map((w) => ({
      ...w,
      countries: w.countries.map((c) => ({ ...c, coverage: round3(coverage(c.outletCount24h, pools.get(c.code) ?? 0, prior)) })),
    }));
    const top = pickTop(all);
    rows.push(row(`coverage, prior ${prior}`, top, briefing(top, worldAt, 'coverage'), bestOf(all, 'coverage')));
  }
  return rows.join('\n');
}

/** A published run: the live site's /data/ or a local data directory. */
async function loadRun(from: { site?: string; dir?: string }): Promise<{ units: PublishedUnit[]; world: WorldStory[]; runAt: string }> {
  // Only a missing file is skipped: an unreadable or malformed one stops the report rather than quietly leaving a country out.
  const get = async <T>(path: string): Promise<T | null> => {
    if (from.dir) {
      const text = await readFile(join(from.dir, path), 'utf8').catch((err: NodeJS.ErrnoException) => {
        if (err.code === 'ENOENT') return null;
        throw err;
      });
      if (text === null) return null;
      try {
        return JSON.parse(text) as T;
      } catch (err) {
        throw new Error(`${path}: ${err instanceof Error ? err.message : err}`);
      }
    }
    const res = await fetch(`${from.site}/data/${path}`, { headers: { 'Cache-Control': 'no-cache' } });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
    return (await res.json()) as T;
  };
  const index = await get<IndexFile>('index.json');
  if (!index) throw new Error('no index.json');
  const units: PublishedUnit[] = [];
  const missing: string[] = [];
  for (const entry of index.countries) {
    if (!COUNTRIES[entry.code]) continue;
    const file = await get<CountryFile>(`countries/${entry.code}.json`);
    if (file) units.push({ code: entry.code, clusters: file.clusters });
    else missing.push(entry.code);
  }
  if (missing.length)
    console.error(`[ranking:report] no file for ${missing.length} countries in the index, left out: ${missing.join(' ')}`);
  return { units, world: index.world ?? [], runAt: index.updatedAt };
}

// `pnpm --filter @news-globe/ingest ranking:report [--site URL | --dir DIR] [--prior 0.5,1,2]`
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (name: string) => {
    const i = process.argv.indexOf(name);
    return i > 0 ? process.argv[i + 1] : undefined;
  };
  const dir = arg('--dir');
  const site = (arg('--site') ?? process.env.SITE_URL ?? 'https://news-globe.maze-td.workers.dev').replace(/\/+$/, '');
  loadRun(dir ? { dir } : { site })
    .then(({ units, world, runAt }) => {
      const pools = outletPools();
      const priors = arg('--prior')?.split(',').map(Number);
      console.log(priors ? priorSweep(units, world, pools, runAt, priors) : rankingReport(units, world, pools, runAt));
    })
    .catch((err) => {
      console.error('[ranking:report] failed:', err instanceof Error ? err.message : err);
      process.exitCode = 1;
    });
}
