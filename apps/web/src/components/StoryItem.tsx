import type { Article, StoryCluster } from '@news-globe/shared';
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

export function StoryItem({ cluster, now, english }: { cluster: StoryCluster; now: number; english: boolean }) {
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
