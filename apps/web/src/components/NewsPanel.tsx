import type {
  ClusterTrend,
  CountryCode,
  CountryFile,
  CountryMeta,
  RegionCode,
  RegionMeta,
  StoryCluster,
  WorldStory,
} from '@news-globe/shared';
import { useEffect, useState, type ReactNode } from 'react';
import { latestData, type AsyncState } from '../hooks/useAsync';
import { relativeTime } from '../lib/time';
import { canTranslateOnDevice, getTranslator, TARGET_LANGUAGE } from '../lib/translate';
import { useTranslated } from '../hooks/useTranslated';
import { PanelShell } from './PanelShell';
import { findStory, StoryDetail } from './StoryDetail';
import { StoryItem } from './StoryItem';

interface NewsPanelProps {
  country: CountryMeta;
  /** Open region, when showing regional headlines. */
  region?: RegionMeta;
  /** The country's regions with headlines (empty if it has none). */
  regions: readonly RegionMeta[];
  /** null returns to the national headlines. */
  onSelectRegion: (code: RegionCode | null) => void;
  state: AsyncState<CountryFile>;
  now: number;
  isMobile: boolean;
  onClose: () => void;
  onRetry: () => void;
  onSheetChange: (fraction: number) => void;
  /** The open story page (a cluster id), or null for the list. */
  story: string | null;
  onOpenStory: (id: string | null) => void;
  /** Opens a story's counterpart in another country, from "Also in" and a story page. */
  onOpenStoryIn: (code: CountryCode, clusterId: string) => void;
  /** Today's cross-border stories, for a story page's "In other countries". */
  world: readonly WorldStory[];
  onToast: (message: string) => void;
  /** Cluster id → trend, when trends.json describes the run shown, and the run times of its ranks. */
  trends?: Record<string, ClusterTrend>;
  trendRuns?: string[];
  /** Headline of the story a search result opened, to scroll to and highlight. */
  focusTitle?: string | null;
  /** The bar above the headlines (live, and the way into History). */
  timeline?: ReactNode;
  animate?: boolean;
  /** Phones: a sideways swipe on the list moves to the next or previous country. */
  onSwipe?: (direction: 1 | -1) => void;
}

function Skeleton() {
  return (
    <ul className="story-list" aria-hidden="true">
      {Array.from({ length: 6 }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a fixed list of placeholders.
        <li key={i} className="story skeleton">
          <div className="sk-line" style={{ width: '92%' }} />
          <div className="sk-line" style={{ width: '70%' }} />
          <div className="sk-line sk-small" style={{ width: '35%' }} />
        </li>
      ))}
    </ul>
  );
}

type LanguageMode = 'original' | 'en';
const LANGUAGE_KEY = 'news-globe:language';

function readLanguageMode(): LanguageMode {
  try {
    return localStorage.getItem(LANGUAGE_KEY) === 'en' ? 'en' : 'original';
  } catch {
    return 'original';
  }
}

/** The file to render: fresh data, or the previous data for this view while it refreshes or after a refresh failed. */
function visibleData(state: AsyncState<CountryFile>, viewCode: string): CountryFile | null {
  if (state.status === 'ready') return state.data;
  const previous = latestData(state);
  if (previous && (previous.regionCode ?? previous.countryCode) === viewCode) return previous;
  return null;
}

/** Languages other than English among the visible stories. */
function foreignLanguages(file: CountryFile | null): string[] {
  const langs = new Set<string>();
  for (const c of file?.clusters ?? []) {
    for (const a of [c.representative, ...c.related]) if (a.language !== TARGET_LANGUAGE) langs.add(a.language);
  }
  return [...langs];
}

function Body({
  state,
  now,
  onRetry,
  view,
  english,
  onOpenStory,
  onOpenStoryIn,
  trends,
  focusTitle,
  focusId,
}: Pick<NewsPanelProps, 'state' | 'now' | 'onRetry' | 'onOpenStory' | 'onOpenStoryIn' | 'trends' | 'focusTitle'> & {
  view: { code: string; name: string };
  english: boolean;
  /** The story whose page was just closed: scrolled back into view. */
  focusId: string | null;
}) {
  const data = visibleData(state, view.code);

  if (state.status === 'error' && !data) {
    return (
      <div className="panel-message" role="alert">
        <p>Couldn’t load headlines for {view.name}.</p>
        <p className="panel-detail">{state.error}</p>
        <button type="button" className="btn" onClick={onRetry}>
          Try again
        </button>
      </div>
    );
  }
  if (!data) return <Skeleton />;
  if (data.clusters.length === 0) {
    return (
      <div className="panel-message">
        <p>No headlines for {view.name} right now.</p>
        <p className="panel-detail">Feeds are checked every hour — try again shortly.</p>
      </div>
    );
  }
  return (
    <ol className="story-list">
      {data.clusters.map((c) => (
        <StoryItem
          key={c.id}
          cluster={c}
          now={now}
          english={english}
          onOpen={() => onOpenStory(c.id)}
          onOpenStoryIn={onOpenStoryIn}
          trend={trends?.[c.id]}
          focused={c.id === focusId || (!!focusTitle && c.representative.title === focusTitle)}
        />
      ))}
    </ol>
  );
}

/** A story page's title: its headline, in English when that is on. */
function StoryTitle({ cluster, english }: { cluster: StoryCluster; english: boolean }) {
  const rep = cluster.representative;
  const title = useTranslated(rep.title, rep.language, english);
  return (
    <span lang={title.translated ? TARGET_LANGUAGE : rep.language} dir="auto">
      {title.text}
    </span>
  );
}

export function NewsPanel({
  country,
  region,
  regions,
  onSelectRegion,
  state,
  now,
  isMobile,
  onClose,
  onRetry,
  onSheetChange,
  story,
  onOpenStory,
  onOpenStoryIn,
  world,
  onToast,
  trends,
  trendRuns,
  focusTitle,
  timeline,
  animate,
  onSwipe,
}: NewsPanelProps) {
  const view = region ?? country;
  const [languageMode, setLanguageMode] = useState<LanguageMode>(readLanguageMode);

  const file = state.status === 'ready' ? state.data : null;
  const shown = visibleData(state, view.code);
  const cluster = story && shown ? findStory(shown.clusters, story) : undefined;
  // Back from a story page: the list scrolls to the story just closed.
  const [focusId, setFocusId] = useState<string | null>(null);
  const backToList = () => {
    setFocusId(cluster?.id ?? story);
    onOpenStory(null);
  };
  const languages = foreignLanguages(shown);
  const english = languageMode === 'en' && languages.length > 0;
  const languagesKey = languages.join(',');
  // Whether on-device translators exist for every language shown: drives the "Translating…" / fallback notes.
  const [translation, setTranslation] = useState<'pending' | 'ready' | 'unavailable'>('pending');

  useEffect(() => {
    if (!english) return;
    if (!canTranslateOnDevice) {
      setTranslation('unavailable');
      return;
    }
    let cancelled = false;
    setTranslation('pending');
    void Promise.all(languagesKey.split(',').map(getTranslator)).then((ts) => {
      if (!cancelled) setTranslation(ts.every(Boolean) ? 'ready' : 'unavailable');
    });
    return () => {
      cancelled = true;
    };
  }, [english, languagesKey]);

  const chooseLanguage = (mode: LanguageMode) => {
    setLanguageMode(mode);
    try {
      localStorage.setItem(LANGUAGE_KEY, mode);
    } catch {
      // Not persisted; the choice still applies for this visit.
    }
    // Create translators inside the click: downloading a model needs a user gesture.
    if (mode === 'en') for (const lang of languages) void getTranslator(lang);
  };
  const crumb = story
    ? { label: view.name, onClick: backToList }
    : region
      ? { label: country.name, onClick: () => onSelectRegion(null) }
      : undefined;
  const subtitle = story ? (
    cluster ? (
      <>Story · {cluster.representative.source.name}</>
    ) : (
      'Story'
    )
  ) : (
    <>
      Top {region ? 'regional' : 'national'} headlines
      {file && <> · updated {relativeTime(file.updatedAt, now)}</>}
    </>
  );
  const languageToggle = languages.length > 0 && (
    <div className="lang-toggle" role="group" aria-label="Headline language">
      <button type="button" aria-pressed={!english} onClick={() => chooseLanguage('original')}>
        Original
      </button>
      <button type="button" aria-pressed={english} onClick={() => chooseLanguage('en')}>
        English
      </button>
    </div>
  );

  return (
    <PanelShell
      crumb={crumb}
      title={story && cluster ? <StoryTitle cluster={cluster} english={english} /> : view.name}
      titleClassName={story && cluster ? 'story-detail-title' : undefined}
      subtitle={subtitle}
      controls={languageToggle}
      sheetKey={country.code}
      scrollKey={`${view.code}/${story ?? ''}`}
      toolbar={story ? undefined : timeline}
      animate={animate}
      onSwipe={story ? undefined : onSwipe}
      isMobile={isMobile}
      onClose={onClose}
      onSheetChange={onSheetChange}
    >
      {!story && !region && regions.length > 0 && (
        <nav className="region-picker" aria-label={`Regions of ${country.name}`}>
          <span className="region-picker-label">Regions</span>
          {regions.map((r) => (
            <button key={r.code} type="button" className="chip chip-small" onClick={() => onSelectRegion(r.code)}>
              {r.name}
            </button>
          ))}
        </nav>
      )}
      {english && translation === 'pending' && <p className="panel-note">Translating headlines on this device…</p>}
      {english && translation === 'unavailable' && (
        <p className="panel-note">
          This browser can’t translate on the device (Chrome on a computer can). “Translate” opens a story’s headline in Google Translate;
          its story page also links to the whole article translated.
        </p>
      )}
      {story && cluster ? (
        <StoryDetail
          cluster={cluster}
          unit={view}
          now={now}
          english={english}
          trend={trends?.[cluster.id]}
          runs={trendRuns}
          world={world}
          onOpenStoryIn={onOpenStoryIn}
          onToast={onToast}
        />
      ) : story && shown ? (
        <div className="panel-message">
          <p>This story is no longer among {view.name}’s top stories.</p>
          <button type="button" className="btn" onClick={backToList}>
            See today’s top stories
          </button>
        </div>
      ) : (
        <Body
          state={state}
          now={now}
          onRetry={onRetry}
          view={view}
          english={english}
          onOpenStory={onOpenStory}
          onOpenStoryIn={onOpenStoryIn}
          trends={trends}
          focusTitle={focusTitle}
          focusId={focusId}
        />
      )}
      <p className="panel-footnote">
        Headlines and snippets link to the original publishers. Stories are grouped by matching headlines across outlets and ranked by how
        many outlets covered them in the last 24 hours.
      </p>
    </PanelShell>
  );
}
