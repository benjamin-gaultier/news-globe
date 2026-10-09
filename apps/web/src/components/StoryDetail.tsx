import { COUNTRIES, type Article, type ClusterTrend, type CountryCode, type StoryCluster, type WorldStory } from '@news-globe/shared';
import { useState } from 'react';
import { useTranslated } from '../hooks/useTranslated';
import { headlineText, plural } from '../lib/text';
import { clock, relativeTime } from '../lib/time';
import { TARGET_LANGUAGE, translatedPageUrl, translatedTextUrl } from '../lib/translate';
import { RankChart } from './RankCharts';
import { ArticleLink, CountryStoryRow, TrendBadge } from './StoryParts';

/** The cluster a story link names: by its id, else by any of its articles (the headline article may have changed). */
export function findStory(clusters: readonly StoryCluster[], id: string): StoryCluster | undefined {
  return clusters.find((c) => c.id === id) ?? clusters.find((c) => c.representative.id === id || c.related.some((a) => a.id === id));
}

/** The cross-border story this cluster belongs to, if any. */
function worldStoryOf(world: readonly WorldStory[], code: string, clusterId: string): WorldStory | undefined {
  return world.find((s) => s.countries.some((c) => c.code === code && c.clusterId === clusterId));
}

function CoverageItem({ article, now, english, first }: { article: Article; now: number; english: boolean; first: boolean }) {
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
      <ArticleLink article={article} className="related-title" english={english} />
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
  const title = useTranslated(rep.title, rep.language, english);
  const foreign = rep.language !== TARGET_LANGUAGE;
  const coverage = [rep, ...cluster.related].sort((a, b) => Date.parse(a.publishedAt) - Date.parse(b.publishedAt));
  const elsewhere = (worldStoryOf(world, unit.code, cluster.id)?.countries ?? []).filter((c) => c.code !== unit.code && COUNTRIES[c.code]);
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
        {plural(cluster.outletCount, 'outlet')}
        {rank != null && (
          <>
            {' '}
            · #{rank} in {unit.name} now
          </>
        )}
        {trend && <> · in the top list since {clock(trend.firstSeen)}</>}
        <TrendBadge state={trend?.state} />
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
        {foreign && !title.translated && (
          <a className="btn btn-quiet" href={translatedTextUrl(headlineText(rep), rep.language)} target="_blank" rel="noopener noreferrer">
            Translate ↗
          </a>
        )}
        {foreign && (
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
        <h3 id="story-coverage">Coverage · {plural(coverage.length, 'outlet')}</h3>
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
              <CountryStoryRow key={c.code} story={c} onOpen={onOpenStoryIn} />
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
