import { clock } from '../lib/time';

/** A story's rank at each of today's runs, #1 at the top; null where it wasn't ranked. */
type Ranks = (number | null)[];

interface Box {
  width: number;
  height: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * Scales the ranks into the box, the worst rank shown being at least `minWorst`,
 * and splits them into unbroken stretches of ranked runs. Null with fewer than two ranks.
 */
function plot(ranks: Ranks, box: Box, minWorst: number) {
  const known = ranks.filter((r): r is number => r !== null);
  if (known.length < 2) return null;
  const worst = Math.max(...known, minWorst);
  const x = (i: number) => box.left + (i / (ranks.length - 1)) * (box.width - box.left - box.right);
  const y = (rank: number) => box.top + ((rank - 1) / (worst - 1)) * (box.height - box.top - box.bottom);
  const segments: { x: number; y: number }[][] = [[]];
  ranks.forEach((r, i) => {
    if (r === null) segments.push([]);
    else segments.at(-1)!.push({ x: x(i), y: y(r) });
  });
  const last = ranks.at(-1);
  return { worst, x, y, segments: segments.filter((s) => s.length > 0), now: last != null ? { x: x(ranks.length - 1), y: y(last) } : null };
}

/** Each stretch as a line, a lone ranked run as a dot, and the latest rank highlighted. */
function Lines({ p, dot, now }: { p: NonNullable<ReturnType<typeof plot>>; dot: number; now: number }) {
  return (
    <>
      {p.segments.map((points, i) =>
        points.length > 1 ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: segments never reorder; they are redrawn whole.
          <polyline key={i} className="rank-line" points={points.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' ')} />
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: as above.
          <circle key={i} className="rank-dot" cx={points[0]!.x} cy={points[0]!.y} r={dot} />
        ),
      )}
      {p.now && <circle className="rank-now" cx={p.now.x} cy={p.now.y} r={now} />}
    </>
  );
}

const SPARKLINE: Box = { width: 56, height: 20, left: 2, right: 2, top: 2, bottom: 2 };

/** The rank over today's runs, small, beside a story in a list. */
export function RankSparkline({ ranks }: { ranks: Ranks }) {
  const p = plot(ranks, SPARKLINE, 2);
  if (!p) return null;
  const { width, height } = SPARKLINE;
  const label = `Rank over today's runs: ${ranks.map((r) => (r === null ? 'unranked' : `#${r}`)).join(', ')}`;
  return (
    <svg className="rank-sparkline" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
      <title>{label}</title>
      <Lines p={p} dot={1.5} now={2.2} />
    </svg>
  );
}

const CHART: Box = { width: 320, height: 96, left: 30, right: 10, top: 10, bottom: 22 };

/** The rank at each of today's runs on a story's page, with rank gridlines and the first and last run's times. */
export function RankChart({ ranks, runs }: { ranks: Ranks; runs: string[] }) {
  const p = runs.length === ranks.length ? plot(ranks, CHART, 5) : null;
  if (!p) return null;
  const { width, height, left, right } = CHART;
  const label = `Rank at each run today: ${ranks.map((r, i) => `${clock(runs[i]!)} ${r === null ? 'not ranked' : `#${r}`}`).join(', ')}`;
  const ticks = [...new Set([1, Math.ceil(p.worst / 2), p.worst])];
  return (
    <svg className="rank-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
      <title>{label}</title>
      {ticks.map((t) => (
        <g key={t}>
          <line className="rank-grid" x1={left} x2={width - right} y1={p.y(t)} y2={p.y(t)} />
          <text className="rank-label" x={left - 6} y={p.y(t)} textAnchor="end" dominantBaseline="middle">
            #{t}
          </text>
        </g>
      ))}
      <text className="rank-label" x={left} y={height - 4} textAnchor="start">
        {clock(runs[0]!)}
      </text>
      <text className="rank-label" x={width - right} y={height - 4} textAnchor="end">
        {clock(runs.at(-1)!)}
      </text>
      <Lines p={p} dot={2.5} now={4} />
    </svg>
  );
}
