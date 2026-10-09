import { COUNTRIES, type Article, type ClusterTrend, type CountryCode, type StoryCluster } from '@news-globe/shared';
import { useEffect, useRef, useState } from 'react';
import { useTranslated } from '../hooks/useTranslated';
import { relativeTime } from '../lib/time';
import { TARGET_LANGUAGE, translatedPageUrl, translatedTextUrl } from '../lib/translate';

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

/** The headline and its snippet, as one text to translate. */
export const headlineText = (a: Article) => (a.description ? `${a.title}\n\n${a.description}` : a.title);

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

/** "Also in Germany · Chile": the same story in other countries' top stories, each opening its page there. */
function AlsoIn({
  cluster,
  onOpenStoryIn,
}: {
  cluster: StoryCluster;
  onOpenStoryIn: (code: CountryCode, clusterId: string) => void;
}) {
  const countries = (cluster.alsoIn ?? []).filter((a) => COUNTRIES[a.code]);
  if (!countries.length) return null;
  return (
    <p className="story-also">
      <span className="story-also-label">Also in</span>
      {countries.map((a) => (
        <button key={a.code} type="button" className="chip chip-small" onClick={() => onOpenStoryIn(a.code, a.clusterId)}>
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
  onOpen,
  onOpenStoryIn,
  trend,
  focused = false,
}: {
  cluster: StoryCluster;
  now: number;
  english: boolean;
  /** Opens this story's page: every outlet, its rank today, the same story elsewhere. */
  onOpen: () => void;
  onOpenStoryIn: (code: CountryCode, clusterId: string) => void;
  /** This story's trend in the latest run, from trends.json. */
  trend?: ClusterTrend;
  /** Scrolled into view and highlighted: the story a search result opened. */
  focused?: boolean;
}) {
  const item = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (focused) item.current?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  }, [focused]);
  const { representative: rep, related } = cluster;
  const others = related.length;
  const title = useTranslated(rep.title, rep.language, english);
  const description = useTranslated(rep.description, rep.language, english);
  const foreign = rep.language !== TARGET_LANGUAGE;
  // English asked for, but this browser can't translate on the device (phones): Google Translate.
  const offerTranslate = english && foreign && !title.translated;

  return (
    <li ref={item} className={`story${focused ? ' story-focused' : ''}`}>
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
            {offerTranslate && (
              <>
                <span aria-hidden="true"> · </span>
                <a
                  className="story-translate"
                  href={translatedTextUrl(headlineText(rep), rep.language)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Translate “${rep.title}” with Google Translate`}
                >
                  Translate ↗
                </a>
              </>
            )}
            {/* The whole article translated: on the story page too, so the list keeps one link. */}
            {english && foreign && !offerTranslate && (
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
      <AlsoIn cluster={cluster} onOpenStoryIn={onOpenStoryIn} />
      <button type="button" className="story-more" onClick={onOpen}>
        {others > 0 ? `+${others} other source${others === 1 ? '' : 's'}` : 'Story details'}
        <span className="chevron chevron-right" aria-hidden="true" />
      </button>
    </li>
  );
}
