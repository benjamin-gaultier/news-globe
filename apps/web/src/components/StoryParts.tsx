import { COUNTRIES, type Article, type CountryCode } from '@news-globe/shared';
import { useState } from 'react';
import { useTranslated } from '../hooks/useTranslated';
import { plural } from '../lib/text';
import { TARGET_LANGUAGE } from '../lib/translate';

/** Small pieces shared by the story lists, the story page and the world briefing. */

/** The countries whose top headlines carry a story: a chip each, opening the story's page there. */
export function CountryChips({
  countries,
  onOpen,
  label,
}: {
  countries: readonly { code: CountryCode; clusterId: string }[];
  onOpen: (code: CountryCode, clusterId: string) => void;
  /** A word before the chips ("Also in"). */
  label?: string;
}) {
  const known = countries.filter((c) => COUNTRIES[c.code]);
  if (!known.length) return null;
  return (
    <p className="story-also">
      {label && <span className="story-also-label">{label}</span>}
      {known.map((c) => (
        <button key={c.code} type="button" className="chip chip-small" onClick={() => onOpen(c.code, c.clusterId)}>
          {COUNTRIES[c.code]!.name}
        </button>
      ))}
    </p>
  );
}

/** "New" or "↑ Rising" since the previous run. */
export function TrendBadge({ state }: { state: 'new' | 'rising' | null | undefined }) {
  if (!state) return null;
  return <span className={`story-badge story-badge-${state}`}>{state === 'new' ? 'New' : '↑ Rising'}</span>;
}

/** A publisher's image, hidden when there is none or it fails to load. */
export function Thumbnail({ src, className }: { src: string | null; className: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return null;
  return (
    <img
      className={className}
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
export function ArticleLink({ article, className, english }: { article: Article; className: string; english: boolean }) {
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

/** The same story in another country: a chip opening its page there, its headline, and its coverage. */
export function CountryStoryRow({
  story,
  onOpen,
}: {
  story: { code: CountryCode; clusterId: string; title: string; url: string; outletCount24h: number; language?: string };
  onOpen: (code: CountryCode, clusterId: string) => void;
}) {
  return (
    <li>
      <button type="button" className="chip chip-small" onClick={() => onOpen(story.code, story.clusterId)}>
        {COUNTRIES[story.code]!.name}
      </button>
      <a className="related-title" href={story.url} target="_blank" rel="noopener noreferrer" lang={story.language} dir="auto">
        {story.title}
      </a>
      {story.outletCount24h > 1 && <span className="related-time"> · {plural(story.outletCount24h, 'outlet')}</span>}
    </li>
  );
}
