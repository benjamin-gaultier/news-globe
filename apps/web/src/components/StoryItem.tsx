import { COUNTRIES, type ClusterTrend, type CountryCode, type StoryCluster } from '@news-globe/shared';
import { useEffect, useRef } from 'react';
import { useTranslated } from '../hooks/useTranslated';
import { headlineText, plural } from '../lib/text';
import { relativeTime } from '../lib/time';
import { TARGET_LANGUAGE, translatedPageUrl, translatedTextUrl } from '../lib/translate';
import { RankSparkline } from './RankCharts';
import { ArticleLink, Thumbnail, TrendBadge } from './StoryParts';

/** "New" or "↑ Rising" since the previous run, and the rank history, when the hourly trends cover this story. */
function Trend({ trend }: { trend?: ClusterTrend }) {
  if (!trend) return null;
  return (
    <>
      <TrendBadge state={trend.state} />
      <RankSparkline ranks={trend.ranks} />
    </>
  );
}

/** "Also in Germany · Chile": the same story in other countries' top stories, each opening its page there. */
function AlsoIn({ cluster, onOpenStoryIn }: { cluster: StoryCluster; onOpenStoryIn: (code: CountryCode, clusterId: string) => void }) {
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
                <a className="story-translate" href={translatedPageUrl(rep.url, rep.language)} target="_blank" rel="noopener noreferrer">
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
        <Thumbnail src={rep.imageUrl} className="story-thumb" />
      </div>
      <AlsoIn cluster={cluster} onOpenStoryIn={onOpenStoryIn} />
      <button type="button" className="story-more" onClick={onOpen}>
        {others > 0 ? `+${plural(others, 'other source')}` : 'Story details'}
        <span className="chevron chevron-right" aria-hidden="true" />
      </button>
    </li>
  );
}
