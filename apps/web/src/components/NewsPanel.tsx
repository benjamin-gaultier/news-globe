import type { ClusterTrend, CountryCode, CountryFile, CountryMeta, RegionCode, RegionMeta } from '@news-globe/shared';
import { useEffect, useState } from 'react';
import type { AsyncState } from '../hooks/useAsync';
import { relativeTime } from '../lib/time';
import { canTranslateOnDevice, getTranslator, TARGET_LANGUAGE } from '../lib/translate';
import { PanelShell } from './PanelShell';
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
  /** Opens another country, from a story's "Also in" links. */
  onOpenCountry: (code: CountryCode) => void;
  /** Cluster id → trend, when trends.json describes the run shown. */
  trends?: Record<string, ClusterTrend>;
  /** Headline of the story a search result opened, to scroll to and highlight. */
  focusTitle?: string | null;
}

function Skeleton() {
  return (
    <ul className="story-list" aria-hidden="true">
      {Array.from({ length: 6 }, (_, i) => (
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

/** The file to render: fresh data, or the previous data for this view while it refreshes. */
function visibleData(state: AsyncState<CountryFile>, viewCode: string): CountryFile | null {
  if (state.status === 'ready') return state.data;
  const previous = state.status === 'loading' ? state.previous : undefined;
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
  onOpenCountry,
  trends,
  focusTitle,
}: Pick<NewsPanelProps, 'state' | 'now' | 'onRetry' | 'onOpenCountry' | 'trends' | 'focusTitle'> & {
  view: { code: string; name: string };
  english: boolean;
}) {
  const data = visibleData(state, view.code);

  if (state.status === 'error') {
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
          onOpenCountry={onOpenCountry}
          trend={trends?.[c.id]}
          focused={!!focusTitle && c.representative.title === focusTitle}
        />
      ))}
    </ol>
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
  onOpenCountry,
  trends,
  focusTitle,
}: NewsPanelProps) {
  const view = region ?? country;
  const [languageMode, setLanguageMode] = useState<LanguageMode>(readLanguageMode);

  const file = state.status === 'ready' ? state.data : null;
  const languages = foreignLanguages(visibleData(state, view.code));
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
  const heading = (
    <>
      {region && (
        <button type="button" className="crumb" onClick={() => onSelectRegion(null)}>
          ‹ {country.name}
        </button>
      )}
      <h2 id="panel-title">{view.name}</h2>
      <p className="panel-sub">
        Top {region ? 'regional' : 'national'} headlines
        {file && <> · updated {relativeTime(file.updatedAt, now)}</>}
      </p>
      {languages.length > 0 && (
        <div className="lang-toggle" role="group" aria-label="Headline language">
          <button type="button" aria-pressed={!english} onClick={() => chooseLanguage('original')}>
            Original
          </button>
          <button type="button" aria-pressed={english} onClick={() => chooseLanguage('en')}>
            English
          </button>
        </div>
      )}
    </>
  );

  return (
    <PanelShell
      heading={heading}
      sheetKey={country.code}
      scrollKey={view.code}
      isMobile={isMobile}
      onClose={onClose}
      onSheetChange={onSheetChange}
    >
      {!region && regions.length > 0 && (
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
          This browser can’t translate headlines on-device (Chrome 138+ on desktop can). Use “Read in English” to open
          a translated copy of an article.
        </p>
      )}
      <Body
        state={state}
        now={now}
        onRetry={onRetry}
        view={view}
        english={english}
        onOpenCountry={onOpenCountry}
        trends={trends}
        focusTitle={focusTitle}
      />
      <p className="panel-footnote">
        Headlines and snippets link to the original publishers. Stories are grouped by matching headlines across outlets
        and ranked by how many outlets covered them in the last 24 hours.
      </p>
    </PanelShell>
  );
}
