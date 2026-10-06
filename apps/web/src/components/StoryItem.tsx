import type { Article, StoryCluster } from '@news-globe/shared';
import { useId, useState } from 'react';
import { relativeTime } from '../lib/time';

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

function ArticleLink({ article, className }: { article: Article; className: string }) {
  return (
    <a className={className} href={article.url} target="_blank" rel="noopener noreferrer" lang={article.language}>
      {article.title}
    </a>
  );
}

export function StoryItem({ cluster, now }: { cluster: StoryCluster; now: number }) {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const { representative: rep, related } = cluster;
  const others = related.length;

  return (
    <li className="story">
      <div className="story-main">
        <div className="story-text">
          <ArticleLink article={rep} className="story-title" />
          <div className="story-meta">
            <span className="story-source">{rep.source.name}</span>
            <span aria-hidden="true"> · </span>
            <time dateTime={rep.publishedAt} title={new Date(rep.publishedAt).toLocaleString()}>
              {relativeTime(rep.publishedAt, now)}
            </time>
          </div>
          {rep.description && (
            <p className="story-desc" lang={rep.language}>
              {rep.description}
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
                  <ArticleLink article={a} className="related-title" />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </li>
  );
}
