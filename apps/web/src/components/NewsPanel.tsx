import type {
  Category,
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
import { SOURCES_URL } from '../lib/links';
import { relativeTime } from '../lib/time';
import { canTranslateOnDevice, getTranslator, TARGET_LANGUAGE } from '../lib/translate';
import { CATEGORY_NAMES } from '../lib/view';
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
  /** The open category: the top headlines (default) or a section. */
  category?: Category;
  /** The categories the place has a file in (its index entry's); the switch shows when there is more than `top`. */
  categories?: readonly Category[];
  onSelectCategory?: (category: Category) => void;
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

/**
 * The file to render: this view's data, fresh or kept from before while it refreshes or after a
 * refresh failed. Another view's file is never shown: right after a switch, the loader still holds
 * the previous country's (or category's) 'ready' data for one render.
 */
function visibleData(state: AsyncState<CountryFile>, viewCode: string, category: Category): CountryFile | null {
  const data = latestData(state);
  return data && (data.regionCode ?? data.countryCode) === viewCode && (data.category ?? 'top') === category ? data : null;
}

/** The Top / Sport / Business switch, for a place with section files. */
function CategorySwitch({
  categories,
  category,
  onSelect,
}: {
  categories: readonly Category[];
  category: Category;
  onSelect: (category: Category) => void;
}) {
  return (
    <div className="category-switch" role="group" aria-label="Section">
      {categories.map((c) => (
        <button key={c} type="button" aria-pressed={c === category} onClick={() => c !== category && onSelect(c)}>
          {CATEGORY_NAMES[c]}
        </button>
      ))}
    </div>
  );
}

/** The outlets with a headline in the list, A to Z. */
function outletNames(file: CountryFile): string[] {
  const names = new Set(file.clusters.flatMap((c) => [c.representative, ...c.related].map((a) => a.source.name)));
  return [...names].sort((a, b) => a.localeCompare(b));
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
  category,
  english,
  onOpenStory,
  onOpenStoryIn,
  trends,
  focusTitle,
  focusId,
}: Pick<NewsPanelProps, 'state' | 'now' | 'onRetry' | 'onOpenStory' | 'onOpenStoryIn' | 'trends' | 'focusTitle'> & {
  view: { code: string; name: string };
  category: Category;
  english: boolean;
  /** The story whose page was just closed: scrolled back into view. */
  focusId: string | null;
}) {
  const data = visibleData(state, view.code, category);
  const headlines = category === 'top' ? 'headlines' : `${CATEGORY_NAMES[category].toLowerCase()} headlines`;

  if (state.status === 'error' && !data) {
    return (
      <div className="panel-message" role="alert">
        <p>
          Couldn’t load {headlines} for {view.name}.
        </p>
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
        <p>
          No {headlines} for {view.name} right now.
        </p>
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
  category = 'top',
  categories = [],
  onSelectCategory,
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
  // A section: trends, "Also in", History and the cross-border stories cover the top headlines only.
  const section = category !== 'top';
  const sectionName = CATEGORY_NAMES[category].toLowerCase();

  const shown = visibleData(state, view.code, category);
  // This view's fresh file (not one kept from before, nor the previous place's): its time goes in the header.
  const file = state.status === 'ready' && state.data === shown ? state.data : null;
  const cluster = story && shown ? findStory(shown.clusters, story) : undefined;
  // Back from a story page: the list scrolls to the story just closed.
  const [focusId, setFocusId] = useState<string | null>(null);
  const backToList = () => {
    setFocusId(cluster?.id ?? story);
    onOpenStory(null);
  };
  const languages = foreignLanguages(shown);
  // Under the list: which outlets these headlines come from.
  const outlets = !story && shown ? outletNames(shown) : [];
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
      {section ? `${region ? 'Regional' : 'National'} ${sectionName} headlines` : `Top ${region ? 'regional' : 'national'} headlines`}
      {file && <> · updated {relativeTime(file.updatedAt, now)}</>}
    </>
  );
  const categorySwitch = !story && onSelectCategory && categories.length > 1 && (
    <CategorySwitch categories={categories} category={category} onSelect={onSelectCategory} />
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
      controls={
        (categorySwitch || languageToggle) && (
          <div className="panel-controls">
            {categorySwitch}
            {languageToggle}
          </div>
        )
      }
      sheetKey={country.code}
      scrollKey={`${view.code}.${category}/${story ?? ''}`}
      toolbar={story || section ? undefined : timeline}
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
          trend={section ? undefined : trends?.[cluster.id]}
          runs={section ? undefined : trendRuns}
          world={section ? [] : world}
          onOpenStoryIn={onOpenStoryIn}
          onToast={onToast}
        />
      ) : story && shown ? (
        <div className="panel-message">
          <p>
            This story is no longer among {view.name}’s {sectionName} stories.
          </p>
          <button type="button" className="btn" onClick={backToList}>
            See today’s {sectionName} stories
          </button>
        </div>
      ) : (
        <Body
          state={state}
          now={now}
          onRetry={onRetry}
          view={view}
          category={category}
          english={english}
          onOpenStory={onOpenStory}
          onOpenStoryIn={onOpenStoryIn}
          trends={section ? undefined : trends}
          focusTitle={focusTitle}
          focusId={focusId}
        />
      )}
      {outlets.length > 0 && (
        <p className="panel-sources">
          Headlines from <span className="panel-sources-names">{outlets.join(', ')}</span> ·{' '}
          <a href={SOURCES_URL} target="_blank" rel="noopener noreferrer">
            All sources ↗
          </a>
        </p>
      )}
      <p className="panel-footnote">
        Headlines and snippets link to the original publishers. Stories are grouped by matching headlines across outlets and ranked by how
        many outlets covered them in the last 24 hours.
        {section && <> New and rising badges, History, search and the World briefing cover top headlines only.</>}
      </p>
    </PanelShell>
  );
}
