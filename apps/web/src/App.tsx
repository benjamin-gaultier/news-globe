import { COUNTRIES, type CountryCode } from '@news-globe/shared';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NewsPanel } from './components/NewsPanel';
import { useAsync } from './hooks/useAsync';
import { MOBILE_QUERY, useMediaQuery } from './hooks/useMediaQuery';
import { useNow } from './hooks/useNow';
import { fetchCountry, fetchIndex } from './lib/data';
import { relativeTime } from './lib/time';

// three.js is most of the bundle; load it after the shell renders.
const GlobeView = lazy(() => import('./components/GlobeView'));

const INDEX_REFRESH_MS = 5 * 60_000;

export function App() {
  const now = useNow();
  const isMobile = useMediaQuery(MOBILE_QUERY);
  const [selected, setSelected] = useState<CountryCode | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [indexTick, setIndexTick] = useState(0);
  const [sheetFraction, setSheetFraction] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Re-read index.json periodically so "updated" times and data stay current.
  useEffect(() => {
    const id = setInterval(() => setIndexTick((t) => t + 1), INDEX_REFRESH_MS);
    return () => clearInterval(id);
  }, []);
  const index = useAsync(fetchIndex, [indexTick, retryKey]);
  const indexData = index.status === 'ready' ? index.data : index.status === 'loading' ? index.previous : undefined;

  const available = useMemo(
    () => new Set((indexData?.countries ?? []).map((c) => c.code).filter((c) => COUNTRIES[c])),
    [indexData],
  );

  // Refetch the open country when the index reports a newer file.
  const selectedUpdatedAt = indexData?.countries.find((c) => c.code === selected)?.updatedAt;
  const country = useAsync(selected ? (signal) => fetchCountry(selected, signal) : null, [
    selected,
    selectedUpdatedAt,
    retryKey,
  ]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }, []);

  const handleUnavailable = useCallback((name: string) => showToast(`${name} — coming soon`), [showToast]);
  const handleClose = useCallback(() => setSelected(null), []);
  const retry = useCallback(() => setRetryKey((k) => k + 1), []);
  const meta = selected ? COUNTRIES[selected] : undefined;

  return (
    <div className={`app${meta ? ' has-panel' : ''}`}>
      <header className="topbar">
        <div className="brand">
          <h1>News Globe</h1>
          <p className="updated" aria-live="polite">
            {index.status === 'error' && !indexData ? (
              <>
                Couldn’t reach the news data.{' '}
                <button type="button" className="link-btn" onClick={retry}>
                  Retry
                </button>
              </>
            ) : indexData ? (
              <>Updated {relativeTime(indexData.updatedAt, now)}</>
            ) : (
              <>Loading…</>
            )}
          </p>
        </div>
        <nav className="country-picker" aria-label="Countries">
          {Object.values(COUNTRIES).map((c) => (
            <button
              key={c.code}
              type="button"
              className="chip"
              aria-pressed={selected === c.code}
              disabled={!available.has(c.code)}
              onClick={() => setSelected(selected === c.code ? null : c.code)}
            >
              {c.name}
            </button>
          ))}
        </nav>
      </header>

      <main className="stage">
        <Suspense fallback={<div className="globe globe-loading" aria-hidden="true" />}>
          <GlobeView
            available={available}
            selected={selected}
            onSelect={setSelected}
            onUnavailable={handleUnavailable}
            isMobile={isMobile}
            sheetFraction={sheetFraction}
          />
        </Suspense>
        {!meta && <p className="hint">Tap a highlighted country to see its top headlines</p>}
      </main>

      {meta && (
        <NewsPanel
          country={meta}
          state={country}
          now={now}
          isMobile={isMobile}
          onClose={handleClose}
          onRetry={retry}
          onSheetChange={setSheetFraction}
        />
      )}

      <div className={`toast${toast ? ' visible' : ''}`} role="status">
        {toast}
      </div>
    </div>
  );
}
