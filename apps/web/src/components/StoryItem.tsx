import { COUNTRIES, type Article, type ClusterTrend, type CountryCode, type StoryCluster } from '@news-globe/shared';
import { useId, useState } from 'react';
import { useTranslated } from '../hooks/useTranslated';
import { relativeTime } from '../lib/time';
import { TARGET_LANGUAGE, translatedPageUrl } from '../lib/translate';

function Thumbnail({ src }: { src: string | null }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return null;
  return (
    <img
      className="story-thumb"
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}

/** Always links to the publisher, whatever language the title is shown in. */
function ArticleLink({ article, className, english }: { article: Article; className: string; english: boolean }) {
  const title = useTranslated(article.title, article.language, english);
  return (
    <a
      className={className}
      href={article.url}
      target="_blank"
      rel="noopener noreferrer"
      lang={title.translated ? TARGET_LANGUAGE : article.language}
      dir="auto"
      title={title.translated ? article.title : undefined}
    >
      {title.text}
    </a>
  );
}

/** The story's rank over today's runs (top = 1 at the top), with gaps where it wasn't ranked. */
export function RankSparkline({ ranks }: { ranks: (number | null)[] }) {
  const known = ranks.filter((r): r is number => r !== null);
  if (known.length < 2) return null;
  const width = 56;
  const height = 20;
  const worst = Math.max(...known, 2);
  const x = (i: number) => (ranks.length === 1 ? width / 2 : (i / (ranks.length - 1)) * (width - 4) + 2);
  const y = (rank: number) => ((rank - 1) / (worst - 1)) * (height - 4) + 2;
  // One polyline per unbroken run of ranked hours.
  const segments: string[] = [];
  let current: string[] = [];
  ranks.forEach((r, i) => {
    if (r === null) {
      if (current.length) segments.push(current.join(' '));
      current = [];
    } else current.push(`${x(i).toFixed(1)},${y(r).toFixed(1)}`);
  });
  if (current.length) segments.push(current.join(' '));
  const last = ranks.at(-1);
  const label = `Rank over today's runs: ${ranks.map((r) => (r === null ? 'unranked' : `#${r}`)).join(', ')}`;
  return (
    <svg
      className="rank-sparkline"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label}
    >
      <title>{label}</title>
      {segments.map((points) =>
        points.includes(' ') ? (
          <polyline key={points} points={points} fill="none" />
        ) : (
          <circle key={points} cx={points.split(',')[0]} cy={points.split(',')[1]} r={1.5} />
        ),
      )}
      {last != null && <circle className="rank-now" cx={x(ranks.length - 1)} cy={y(last)} r={2.2} />}
    </svg>
  );
}

/** "New" or "↑ Rising" since the previous run, and the rank history, when the hourly trends cover this story. */
function Trend({ trend }: { trend?: ClusterTrend }) {
  if (!trend) return null;
  return (
    <>
      {trend.state && (
        <span className={`story-badge story-badge-${trend.state}`}>{trend.state === 'new' ? 'New' : '↑ Rising'}</span>
      )}
      <RankSparkline ranks={trend.ranks} />
    </>
  );
}

/** "Also in Germany · Chile": the same story in other countries' top stories. */
function AlsoIn({ cluster, onOpenCountry }: { cluster: StoryCluster; onOpenCountry: (code: CountryCode) => void }) {
  const countries = (cluster.alsoIn ?? []).filter((a) => COUNTRIES[a.code]);
  if (!countries.length) return null;
  return (
    <p className="story-also">
      <span className="story-also-label">Also in</span>
      {countries.map((a) => (
        <button key={a.code} type="button" className="chip chip-small" onClick={() => onOpenCountry(a.code)}>
          {COUNTRIES[a.code]!.name}
        </button>
      ))}
    </p>
  );
}

export function StoryItem({
  cluster,
  now,
  english,
  onOpenCountry,
  trend,
}: {
  cluster: StoryCluster;
  now: number;
  english: boolean;
  onOpenCountry: (code: CountryCode) => void;
  /** This story's trend in the latest run, from trends.json. */
  trend?: ClusterTrend;
}) {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const { representative: rep, related } = cluster;
  const others = related.length;
  const description = useTranslated(rep.description, rep.language, english);
  const foreign = rep.language !== TARGET_LANGUAGE;

  return (
    <li className="story">
      <div className="story-main">
        <div className="story-text">
          <ArticleLink article={rep} className="story-title" english={english} />
          <div className="story-meta">
            <Trend trend={trend} />
            <span className="story-source">{rep.source.name}</span>
            <span aria-hidden="true"> · </span>
            <time dateTime={rep.publishedAt} title={new Date(rep.publishedAt).toLocaleString()}>
              {relativeTime(rep.publishedAt, now)}
            </time>
            {english && foreign && (
              <>
                <span aria-hidden="true"> · </span>
                <a
                  className="story-translate"
                  href={translatedPageUrl(rep.url, rep.language)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Read in English ↗
                </a>
              </>
            )}
          </div>
          {description.text && (
            <p className="story-desc" lang={description.translated ? TARGET_LANGUAGE : rep.language} dir="auto">
              {description.text}
            </p>
          )}
        </div>
        <Thumbnail src={rep.imageUrl} />
      </div>
      <AlsoIn cluster={cluster} onOpenCountry={onOpenCountry} />

      {others > 0 && (
        <>
          <button
            type="button"
            className="story-more"
            aria-expanded={expanded}
            aria-controls={listId}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? 'Hide' : `+${others}`} other source{others === 1 ? '' : 's'}
            <span className="chevron" aria-hidden="true" />
          </button>
          {expanded && (
            <ul id={listId} className="story-related">
              {related.map((a) => (
                <li key={a.id}>
                  <span className="story-source">{a.source.name}</span>
                  <span className="related-time"> · {relativeTime(a.publishedAt, now)}</span>
                  <ArticleLink article={a} className="related-title" english={english} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </li>
  );
}
