import { COUNTRIES, REGIONS, type CountryCode, type RegionCode } from '@news-globe/shared';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HeatLegend } from './components/HeatLegend';
import { NewsPanel } from './components/NewsPanel';
import { useAsync } from './hooks/useAsync';
import { MOBILE_QUERY, useMediaQuery } from './hooks/useMediaQuery';
import { useNow } from './hooks/useNow';
import { fetchCountry, fetchIndex, fetchRegion } from './lib/data';
import { formatRoute, parseRoute } from './lib/route';
import { relativeTime } from './lib/time';

// three.js is most of the bundle; load it after the shell renders.
const GlobeView = lazy(() => import('./components/GlobeView'));

const INDEX_REFRESH_MS = 5 * 60_000;

export function App() {
  const now = useNow();
  const isMobile = useMediaQuery(MOBILE_QUERY);
  const [selected, setSelected] = useState<CountryCode | null>(() => parseRoute(location.hash).country);
  const [selectedRegion, setSelectedRegion] = useState<RegionCode | null>(() => parseRoute(location.hash).region);
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

  const entries = useMemo(
    () => new Map([...(indexData?.countries ?? []), ...(indexData?.regions ?? [])].map((e) => [e.code, e])),
    [indexData],
  );

  // Regions of the open country that have a file, in REGIONS order.
  const regions = useMemo(() => {
    const withData = new Set((indexData?.regions ?? []).map((r) => r.code));
    return Object.values(REGIONS).filter((r) => r.country === selected && withData.has(r.code));
  }, [indexData, selected]);
  const region = selectedRegion ? REGIONS[selectedRegion] : undefined;

  // Selecting a country (or closing) always starts from its national view.
  const selectCountry = useCallback((code: CountryCode | null) => {
    setSelected(code);
    setSelectedRegion(null);
  }, []);

  // Keep the URL hash in step with the open view, so it can be shared and Back closes it.
  useEffect(() => {
    const hash = formatRoute({ country: selected, region: selectedRegion });
    if (location.hash === hash) return;
    const url = hash || location.pathname + location.search;
    // A link written differently (#fr) is the same view: tidy it without a new entry.
    if (formatRoute(parseRoute(location.hash)) === hash) history.replaceState(null, '', url);
    else history.pushState(null, '', url);
  }, [selected, selectedRegion]);

  useEffect(() => {
    const onPopState = () => {
      const route = parseRoute(location.hash);
      setSelected(route.country);
      setSelectedRegion(route.region);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    const name = selectedRegion ? REGIONS[selectedRegion]?.name : selected ? COUNTRIES[selected]?.name : undefined;
    document.title = name ? `${name} · News Globe` : 'News Globe';
  }, [selected, selectedRegion]);

  // Refetch the open country or region when the index reports a newer file.
  const selectedUpdatedAt = selectedRegion
    ? indexData?.regions?.find((r) => r.code === selectedRegion)?.updatedAt
    : indexData?.countries.find((c) => c.code === selected)?.updatedAt;
  const country = useAsync(
    selectedRegion
      ? (signal) => fetchRegion(selectedRegion, signal)
      : selected
        ? (signal) => fetchCountry(selected, signal)
        : null,
    [selected, selectedRegion, selectedUpdatedAt, retryKey],
  );

  const showToast = useCallback((message: string) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }, []);

  // A link may name a country or region that has no data (yet). Once the index is in,
  // fall back to the nearest view that has some, replacing the entry so Back doesn't return to it.
  useEffect(() => {
    if (!indexData || !selected) return;
    if (!available.has(selected)) {
      history.replaceState(null, '', location.pathname + location.search);
      selectCountry(null);
      showToast(`${COUNTRIES[selected]!.name} — coming soon`);
    } else if (selectedRegion && !regions.some((r) => r.code === selectedRegion)) {
      history.replaceState(null, '', formatRoute({ country: selected, region: null }));
      setSelectedRegion(null);
    }
  }, [indexData, available, regions, selected, selectedRegion, selectCountry, showToast]);

  const handleUnavailable = useCallback((name: string) => showToast(`${name} — coming soon`), [showToast]);
  const handleClose = useCallback(() => selectCountry(null), [selectCountry]);
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
              onClick={() => selectCountry(selected === c.code ? null : c.code)}
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
            entries={entries}
            selected={selected}
            onSelect={selectCountry}
            regions={regions}
            selectedRegion={selectedRegion}
            onSelectRegion={setSelectedRegion}
            onUnavailable={handleUnavailable}
            isMobile={isMobile}
            sheetFraction={sheetFraction}
          />
        </Suspense>
        {!meta && <p className="hint">Tap a highlighted country to see its top headlines</p>}
        {/* An index from before the ingest wrote counts shades everything alike: no key then. */}
        {!meta && indexData?.countries.some((c) => c.topOutlets !== undefined) && <HeatLegend />}
      </main>

      {meta && (
        <NewsPanel
          country={meta}
          region={region}
          regions={regions}
          onSelectRegion={setSelectedRegion}
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
