import { COUNTRIES, type Article, type ClusterTrend, type CountryCode, type StoryCluster, type WorldStory } from '@news-globe/shared';
import { useState } from 'react';
import { useTranslated } from '../hooks/useTranslated';
import { relativeTime } from '../lib/time';
import { TARGET_LANGUAGE, translatedPageUrl } from '../lib/translate';
import { clock } from './HistoryBar';

/** The cluster a story link names: by its id, else by any of its articles (the headline article may have changed). */
export function findStory(clusters: readonly StoryCluster[], id: string): StoryCluster | undefined {
  return (
    clusters.find((c) => c.id === id) ??
    clusters.find((c) => c.representative.id === id || c.related.some((a) => a.id === id))
  );
}

/** The cross-border story this cluster belongs to, if any. */
export function worldStoryOf(world: readonly WorldStory[], code: string, clusterId: string): WorldStory | undefined {
  return world.find((s) => s.countries.some((c) => c.code === code && c.clusterId === clusterId));
}

const CHART = { width: 320, height: 96, left: 30, right: 10, top: 10, bottom: 22 };

/** The story's rank at each of today's runs, #1 at the top, with the first and last run's times. */
export function RankChart({ ranks, runs }: { ranks: (number | null)[]; runs: string[] }) {
  const known = ranks.filter((r): r is number => r !== null);
  if (known.length < 2 || runs.length !== ranks.length) return null;
  const worst = Math.max(...known, 5);
  const { width, height, left, right, top, bottom } = CHART;
  const x = (i: number) => left + (i / (ranks.length - 1)) * (width - left - right);
  const y = (rank: number) => top + ((rank - 1) / (worst - 1)) * (height - top - bottom);
  const segments: { x: number; y: number }[][] = [[]];
  ranks.forEach((r, i) => {
    if (r === null) segments.push([]);
    else segments.at(-1)!.push({ x: x(i), y: y(r) });
  });
  const label = `Rank at each run today: ${ranks.map((r, i) => `${clock(runs[i]!)} ${r === null ? 'not ranked' : `#${r}`}`).join(', ')}`;
  const ticks = [...new Set([1, Math.ceil(worst / 2), worst])];
  return (
    <svg className="rank-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
      <title>{label}</title>
      {ticks.map((t) => (
        <g key={t}>
          <line className="rank-grid" x1={left} x2={width - right} y1={y(t)} y2={y(t)} />
          <text className="rank-label" x={left - 6} y={y(t)} textAnchor="end" dominantBaseline="middle">
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
      {segments.map((points, i) =>
        points.length > 1 ? (
          <polyline key={i} className="rank-line" points={points.map((p) => `${p.x},${p.y}`).join(' ')} />
        ) : points.length === 1 ? (
          <circle key={i} className="rank-dot" cx={points[0]!.x} cy={points[0]!.y} r={2.5} />
        ) : null,
      )}
      {ranks.at(-1) != null && <circle className="rank-now" cx={x(ranks.length - 1)} cy={y(ranks.at(-1)!)} r={4} />}
    </svg>
  );
}

function CoverageItem({ article, now, english, first }: { article: Article; now: number; english: boolean; first: boolean }) {
  const title = useTranslated(article.title, article.language, english);
  return (
    <li>
      <div className="coverage-meta">
        <span className="story-source">{article.source.name}</span>
        <span className="related-time">
          {' · '}
          <time dateTime={article.publishedAt} title={new Date(article.publishedAt).toLocaleString()}>
            {relativeTime(article.publishedAt, now)}
          </time>
        </span>
        {first && <span className="coverage-first">First</span>}
      </div>
      <a
        className="related-title"
        href={article.url}
        target="_blank"
        rel="noopener noreferrer"
        lang={title.translated ? TARGET_LANGUAGE : article.language}
        dir="auto"
        title={title.translated ? article.title : undefined}
      >
        {title.text}
      </a>
    </li>
  );
}

export interface StoryDetailProps {
  cluster: StoryCluster;
  /** The country or region the story is ranked in. */
  unit: { code: string; name: string };
  now: number;
  english: boolean;
  /** Its trend in the latest run, and the run times its ranks belong to. */
  trend?: ClusterTrend;
  runs?: string[];
  /** Today's cross-border stories, for the same story elsewhere. */
  world: readonly WorldStory[];
  /** Opens this story's counterpart in another country. */
  onOpenStoryIn: (code: CountryCode, clusterId: string) => void;
  onToast: (message: string) => void;
}

/** A story's page: what it is, how it ranked today, every outlet covering it, and where else it runs. */
export function StoryDetail({ cluster, unit, now, english, trend, runs, world, onOpenStoryIn, onToast }: StoryDetailProps) {
  const rep = cluster.representative;
  const [imageFailed, setImageFailed] = useState(false);
  const description = useTranslated(rep.description, rep.language, english);
  const coverage = [rep, ...cluster.related].sort((a, b) => Date.parse(a.publishedAt) - Date.parse(b.publishedAt));
  const elsewhere = (worldStoryOf(world, unit.code, cluster.id)?.countries ?? []).filter(
    (c) => c.code !== unit.code && COUNTRIES[c.code],
  );
  // Countries linked by the ingest that the world index doesn't list (older index): names only.
  const namesOnly = (cluster.alsoIn ?? []).filter((a) => COUNTRIES[a.code] && !elsewhere.some((c) => c.code === a.code));
  const rank = trend?.ranks.at(-1);

  const share = async () => {
    const url = location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: rep.title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      onToast('Link copied');
    } catch (e) {
      // Dismissing the share sheet is not an error.
      if ((e as Error)?.name !== 'AbortError') onToast('Couldn’t share this link');
    }
  };

  return (
    <article className="story-detail">
      {rep.imageUrl && !imageFailed && (
        <img
          className="story-detail-image"
          src={rep.imageUrl}
          alt=""
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setImageFailed(true)}
        />
      )}
      <p className="story-detail-facts">
        {cluster.outletCount} outlet{cluster.outletCount === 1 ? '' : 's'}
        {rank != null && <> · #{rank} in {unit.name} now</>}
        {trend && <> · in the top list since {clock(trend.firstSeen)}</>}
        {trend?.state && (
          <span className={`story-badge story-badge-${trend.state}`}>{trend.state === 'new' ? 'New' : '↑ Rising'}</span>
        )}
      </p>
      {description.text && (
        <p className="story-detail-desc" lang={description.translated ? TARGET_LANGUAGE : rep.language} dir="auto">
          {description.text}
        </p>
      )}
      <div className="story-detail-actions">
        <a className="btn" href={rep.url} target="_blank" rel="noopener noreferrer">
          Read at {rep.source.name} ↗
        </a>
        {english && rep.language !== TARGET_LANGUAGE && (
          <a className="btn btn-quiet" href={translatedPageUrl(rep.url, rep.language)} target="_blank" rel="noopener noreferrer">
            Read in English ↗
          </a>
        )}
        <button type="button" className="btn btn-quiet" onClick={() => void share()}>
          Share
        </button>
      </div>

      {trend && runs && trend.ranks.filter((r) => r !== null).length > 1 && (
        <section className="story-section" aria-labelledby="story-rank">
          <h3 id="story-rank">Rank today</h3>
          <RankChart ranks={trend.ranks} runs={runs} />
        </section>
      )}

      <section className="story-section" aria-labelledby="story-coverage">
        <h3 id="story-coverage">
          Coverage · {coverage.length} outlet{coverage.length === 1 ? '' : 's'}
        </h3>
        <ol className="coverage-list">
          {coverage.map((a, i) => (
            <CoverageItem key={a.id} article={a} now={now} english={english} first={i === 0 && coverage.length > 1} />
          ))}
        </ol>
      </section>

      {(elsewhere.length > 0 || namesOnly.length > 0) && (
        <section className="story-section" aria-labelledby="story-elsewhere">
          <h3 id="story-elsewhere">In other countries</h3>
          <ul className="world-countries">
            {elsewhere.map((c) => (
              <li key={c.code}>
                <button type="button" className="chip chip-small" onClick={() => onOpenStoryIn(c.code, c.clusterId)}>
                  {COUNTRIES[c.code]!.name}
                </button>
                <a className="related-title" href={c.url} target="_blank" rel="noopener noreferrer" lang={c.language} dir="auto">
                  {c.title}
                </a>
                {c.outletCount24h > 1 && <span className="related-time"> · {c.outletCount24h} outlets</span>}
              </li>
            ))}
            {namesOnly.map((a) => (
              <li key={a.code}>
                <button type="button" className="chip chip-small" onClick={() => onOpenStoryIn(a.code, a.clusterId)}>
                  {COUNTRIES[a.code]!.name}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
