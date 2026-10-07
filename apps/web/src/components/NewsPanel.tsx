import type { CountryFile, CountryMeta } from '@news-globe/shared';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { AsyncState } from '../hooks/useAsync';
import { relativeTime } from '../lib/time';
import { canTranslateOnDevice, getTranslator, TARGET_LANGUAGE } from '../lib/translate';
import { StoryItem } from './StoryItem';

/** Bottom-sheet snap points, as a fraction of the viewport height. */
export const SHEET_SNAPS = { half: 0.52, full: 0.9 } as const;
type Snap = keyof typeof SHEET_SNAPS;

interface NewsPanelProps {
  country: CountryMeta;
  state: AsyncState<CountryFile>;
  now: number;
  isMobile: boolean;
  onClose: () => void;
  onRetry: () => void;
  onSheetChange: (fraction: number) => void;
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

/** The file to render: fresh data, or the previous data for this country while it refreshes. */
function visibleData(state: AsyncState<CountryFile>, country: CountryMeta): CountryFile | null {
  if (state.status === 'ready') return state.data;
  if (state.status === 'loading' && state.previous?.countryCode === country.code) return state.previous;
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
  country,
  english,
}: Pick<NewsPanelProps, 'state' | 'now' | 'onRetry' | 'country'> & { english: boolean }) {
  const data = visibleData(state, country);

  if (state.status === 'error') {
    return (
      <div className="panel-message" role="alert">
        <p>Couldn’t load headlines for {country.name}.</p>
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
        <p>No headlines for {country.name} right now.</p>
        <p className="panel-detail">Feeds are checked every hour — try again shortly.</p>
      </div>
    );
  }
  return (
    <ol className="story-list">
      {data.clusters.map((c) => (
        <StoryItem key={c.id} cluster={c} now={now} english={english} />
      ))}
    </ol>
  );
}

export function NewsPanel({ country, state, now, isMobile, onClose, onRetry, onSheetChange }: NewsPanelProps) {
  const [snap, setSnap] = useState<Snap>('half');
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  // Live drag state lives in a ref: pointerup can fire before React re-renders after the last move.
  const drag = useRef<{ startY: number; startHeight: number; height: number; moved: boolean } | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const [languageMode, setLanguageMode] = useState<LanguageMode>(readLanguageMode);

  useEffect(() => onSheetChange(isMobile ? SHEET_SNAPS[snap] : 0), [snap, isMobile, onSheetChange]);

  // Start each country at half height, scrolled to the top.
  useEffect(() => {
    setSnap('half');
    panelRef.current?.querySelector('.panel-body')?.scrollTo({ top: 0 });
  }, [country.code]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!isMobile || (e.target as HTMLElement).closest('button')) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Not fatal: we still get moves while the pointer stays over the header.
    }
    const startHeight = panelRef.current?.getBoundingClientRect().height ?? 0;
    drag.current = { startY: e.clientY, startHeight, height: startHeight, moved: false };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const dy = e.clientY - d.startY;
    if (Math.abs(dy) > 4) d.moved = true;
    const max = window.innerHeight * SHEET_SNAPS.full;
    d.height = Math.max(80, Math.min(max, d.startHeight - dy));
    setDragHeight(d.height);
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    setDragHeight(null);
    if (!d) return;
    if (!d.moved) {
      // A tap on the handle toggles between the two heights.
      if (e.type === 'pointerup') setSnap((s) => (s === 'half' ? 'full' : 'half'));
      return;
    }
    const fraction = d.height / window.innerHeight;
    if (fraction < SHEET_SNAPS.half * 0.6) onClose();
    else setSnap(fraction > (SHEET_SNAPS.half + SHEET_SNAPS.full) / 2 ? 'full' : 'half');
  };

  const file = state.status === 'ready' ? state.data : null;
  const languages = foreignLanguages(visibleData(state, country));
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
  const style = isMobile
    ? { height: dragHeight !== null ? `${dragHeight}px` : `${SHEET_SNAPS[snap] * 100}dvh` }
    : undefined;

  return (
    <aside
      ref={panelRef}
      className={`panel${dragHeight !== null ? ' dragging' : ''}`}
      style={style}
      aria-labelledby="panel-title"
    >
      <div
        className="panel-header"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div className="sheet-handle" aria-hidden="true" />
        <div className="panel-heading">
          <h2 id="panel-title">{country.name}</h2>
          <p className="panel-sub">
            Top national headlines
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
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close headlines">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div className="panel-body">
        {english && translation === 'pending' && <p className="panel-note">Translating headlines on this device…</p>}
        {english && translation === 'unavailable' && (
          <p className="panel-note">
            This browser can’t translate headlines on-device (Chrome 138+ on desktop can). Use “Read in English” to open
            a translated copy of an article.
          </p>
        )}
        <Body state={state} now={now} onRetry={onRetry} country={country} english={english} />
        <p className="panel-footnote">
          Headlines and snippets link to the original publishers. Stories are grouped by matching headlines across outlets
          and ranked by how many outlets covered them in the last 24 hours.
        </p>
      </div>
    </aside>
  );
}
