import { COUNTRIES, REGIONS, type CountryCode, type RegionCode } from '@news-globe/shared';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HeatLegend, type Shading } from './components/HeatLegend';
import { HistoryBar } from './components/HistoryBar';
import { HistoryPanel } from './components/HistoryPanel';
import { NewsPanel } from './components/NewsPanel';
import { WorldPanel } from './components/WorldPanel';
import { useAsync } from './hooks/useAsync';
import { MOBILE_QUERY, useMediaQuery } from './hooks/useMediaQuery';
import { useNow } from './hooks/useNow';
import { fetchArchive, fetchCountry, fetchIndex, fetchRegion, fetchTrends } from './lib/data';
import { changeStep } from './lib/heat';
import { entriesAt, runTimes, shiftDate, storiesAt, todayUtc } from './lib/history';
import { formatRoute, parseRoute, runForAt, runToAt } from './lib/route';
import { relativeTime } from './lib/time';

// three.js is most of the bundle; load it after the shell renders.
const GlobeView = lazy(() => import('./components/GlobeView'));

const INDEX_REFRESH_MS = 5 * 60_000;

export function App() {
  const now = useNow();
  const isMobile = useMediaQuery(MOBILE_QUERY);
  const [selected, setSelected] = useState<CountryCode | null>(() => parseRoute(location.hash).country);
  const [selectedRegion, setSelectedRegion] = useState<RegionCode | null>(() => parseRoute(location.hash).region);
  // The cross-border stories panel (#world); never open together with a country.
  const [world, setWorld] = useState(() => parseRoute(location.hash).world);
  // History mode: the UTC day shown and the run picked on its timeline; null is live.
  const [historyDate, setHistoryDate] = useState<string | null>(() => parseRoute(location.hash).at?.slice(0, 10) ?? null);
  const [historyRun, setHistoryRun] = useState<string | null>(null);
  // The run a link or Back/Forward asked for (`at`), picked once its day has loaded.
  const wantedAt = useRef<string | null>(parseRoute(location.hash).at);
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

  // Today's file grows every run, so it is re-read with the index.
  const today = todayUtc(now);
  const archive = useAsync(historyDate ? (signal) => fetchArchive(historyDate, signal) : null, [
    historyDate,
    historyDate === today ? indexTick : 0,
  ]);
  // Right after the day changes, the loader still holds the previous day for one render: ignore it.
  const archiveDay = archive.status === 'ready' && archive.data?.date === historyDate ? archive.data : undefined;
  const runs = useMemo(() => (archiveDay ? runTimes(archiveDay) : []), [archiveDay]);
  // A newly loaded day opens on the run asked for, else its latest.
  useEffect(() => {
    if (!runs.length || (historyRun && runs.includes(historyRun))) return;
    setHistoryRun(wantedAt.current ? runForAt(runs, wantedAt.current) : runs.at(-1)!);
    wantedAt.current = null;
  }, [runs, historyRun]);
  const historyEntries = useMemo(
    () => (archiveDay && historyRun && archiveDay.runs[historyRun] ? entriesAt(archiveDay, historyRun) : null),
    [archiveDay, historyRun],
  );

  // Trends for the latest run: badges, sparklines and the "change" shading (live only).
  const trends = useAsync(historyDate ? null : (signal) => fetchTrends(signal), [historyDate, indexTick]);
  const trendsData = trends.status === 'ready' ? trends.data : trends.status === 'loading' ? trends.previous : undefined;
  const [shading, setShading] = useState<Shading>('coverage');
  const canShadeByChange = !historyDate && !!trendsData;
  const shadeStep = useMemo(
    () =>
      canShadeByChange && shading === 'change' ? (code: string) => changeStep(trendsData!.change[code] ?? 0) : undefined,
    [canShadeByChange, shading, trendsData],
  );

  const liveEntries = useMemo(
    () => new Map([...(indexData?.countries ?? []), ...(indexData?.regions ?? [])].map((e) => [e.code, e])),
    [indexData],
  );
  // In history mode the globe shows the picked run (nothing while it loads).
  const entries = historyDate ? (historyEntries ?? new Map()) : liveEntries;

  const available = useMemo(
    () =>
      historyDate
        ? new Set([...entries.keys()].filter((c) => COUNTRIES[c]))
        : new Set((indexData?.countries ?? []).map((c) => c.code).filter((c) => COUNTRIES[c])),
    [historyDate, entries, indexData],
  );

  // Regions of the open country that have a file, in REGIONS order.
  const regions = useMemo(() => {
    const withData = historyDate ? new Set(entries.keys()) : new Set((indexData?.regions ?? []).map((r) => r.code));
    return Object.values(REGIONS).filter((r) => r.country === selected && withData.has(r.code));
  }, [historyDate, entries, indexData, selected]);
  const region = selectedRegion ? REGIONS[selectedRegion] : undefined;

  // Selecting a country (or closing) always starts from its national view.
  const selectCountry = useCallback((code: CountryCode | null) => {
    setSelected(code);
    setSelectedRegion(null);
    setWorld(false);
  }, []);
  const openWorld = useCallback(() => {
    setSelected(null);
    setSelectedRegion(null);
    setWorld(true);
  }, []);
  const worldStories = useMemo(() => indexData?.world ?? [], [indexData]);

  // While the world panel is open, arcs join the countries of each cross-border story.
  const arcs = useMemo(
    () =>
      world
        ? worldStories.flatMap((story) => {
            const [hub, ...rest] = story.countries.map((c) => COUNTRIES[c.code]).filter((m) => m !== undefined);
            return hub ? rest.map((m) => ({ startLat: hub.lat, startLng: hub.lng, endLat: m.lat, endLng: m.lng })) : [];
          })
        : [],
    [world, worldStories],
  );

  // Keep the URL hash in step with the open view, so it can be shared and Back closes it.
  // In History, `at` names the day until a run is picked, then the run.
  const runOfDay = historyDate && historyRun?.startsWith(historyDate) ? historyRun : null;
  const at = historyDate ? (runOfDay ? runToAt(runOfDay) : (wantedAt.current ?? historyDate)) : null;
  useEffect(() => {
    const route = { country: selected, region: selectedRegion, world, at };
    const hash = formatRoute(route);
    if (location.hash === hash) return;
    const url = hash || location.pathname + location.search;
    // The same view and day (a link written differently, or another run picked on the
    // timeline) replaces the entry, so Back skips slider moves.
    const current = parseRoute(location.hash);
    const sameView =
      current.country === route.country &&
      current.region === route.region &&
      current.world === route.world &&
      (current.at?.slice(0, 10) ?? null) === (at?.slice(0, 10) ?? null);
    if (sameView) history.replaceState(null, '', url);
    else history.pushState(null, '', url);
  }, [selected, selectedRegion, world, at]);

  useEffect(() => {
    const onPopState = () => {
      const route = parseRoute(location.hash);
      setSelected(route.country);
      setSelectedRegion(route.region);
      setWorld(route.world);
      wantedAt.current = route.at;
      setHistoryDate(route.at?.slice(0, 10) ?? null);
      setHistoryRun(null);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    const name = selectedRegion
      ? REGIONS[selectedRegion]?.name
      : selected
        ? COUNTRIES[selected]?.name
        : world
          ? 'Across borders'
          : undefined;
    document.title = name ? `${name} · News Globe` : 'News Globe';
  }, [selected, selectedRegion, world]);

  // Refetch the open country or region when the index reports a newer file.
  const selectedUpdatedAt = selectedRegion
    ? indexData?.regions?.find((r) => r.code === selectedRegion)?.updatedAt
    : indexData?.countries.find((c) => c.code === selected)?.updatedAt;
  const country = useAsync(
    historyDate
      ? null
      : selectedRegion
      ? (signal) => fetchRegion(selectedRegion, signal)
      : selected
        ? (signal) => fetchCountry(selected, signal)
        : null,
    [historyDate, selected, selectedRegion, selectedUpdatedAt, retryKey],
  );

  // Trends apply only to the run they describe: the file shown must be that run's.
  const shownFile = country.status === 'ready' ? country.data : undefined;
  const unitTrends =
    trendsData && shownFile && trendsData.runAt === shownFile.updatedAt
      ? trendsData.units[shownFile.regionCode ?? shownFile.countryCode]
      : undefined;

  const showToast = useCallback((message: string) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }, []);

  // A link may name a country or region that has no data (yet). Once the index is in,
  // fall back to the nearest view that has some, replacing the entry so Back doesn't return to it.
  useEffect(() => {
    if (!indexData || !selected || historyDate) return;
    if (!available.has(selected)) {
      history.replaceState(null, '', location.pathname + location.search);
      selectCountry(null);
      showToast(`${COUNTRIES[selected]!.name} — coming soon`);
    } else if (selectedRegion && !regions.some((r) => r.code === selectedRegion)) {
      history.replaceState(null, '', formatRoute({ country: selected, region: null, world: false, at: null }));
      setSelectedRegion(null);
    }
  }, [indexData, available, regions, selected, selectedRegion, selectCountry, showToast, historyDate]);

  const openHistory = useCallback(() => {
    setWorld(false);
    setHistoryRun(null);
    setHistoryDate(todayUtc());
  }, []);
  const closeHistory = useCallback(() => {
    setHistoryDate(null);
    setHistoryRun(null);
  }, []);
  const shiftHistoryDay = useCallback((days: number) => {
    setHistoryRun(null);
    setHistoryDate((d) => (d ? shiftDate(d, days) : d));
  }, []);

  const handleUnavailable = useCallback((name: string) => showToast(`${name} — coming soon`), [showToast]);
  const handleClose = useCallback(() => selectCountry(null), [selectCountry]);
  const openCountry = useCallback((code: CountryCode) => selectCountry(available.has(code) ? code : null), [selectCountry, available]);
  const retry = useCallback(() => setRetryKey((k) => k + 1), []);
  const meta = selected ? COUNTRIES[selected] : undefined;

  return (
    <div className={`app${world || (meta && (!historyDate || (archiveDay && historyRun))) ? ' has-panel' : ''}`}>
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
          <button
            type="button"
            className="chip chip-world"
            aria-pressed={historyDate !== null}
            onClick={() => (historyDate ? closeHistory() : openHistory())}
          >
            History
          </button>
          {worldStories.length > 0 && !historyDate && (
            <button
              type="button"
              className="chip chip-world"
              aria-pressed={world}
              onClick={() => (world ? selectCountry(null) : openWorld())}
            >
              Across borders
            </button>
          )}
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
            shadeStep={shadeStep}
            arcs={arcs}
          />
        </Suspense>
        {!meta && !world && !historyDate && <p className="hint">Tap a highlighted country to see its top headlines</p>}
        {/* An index from before the ingest wrote counts shades everything alike: no key then. */}
        {!meta && !world && !(historyDate && isMobile) && [...entries.values()].some((e) => e.topOutlets !== undefined) && (
          <HeatLegend
            shading={canShadeByChange ? shading : 'coverage'}
            onShadingChange={canShadeByChange ? setShading : undefined}
          />
        )}
        {historyDate && (
          <HistoryBar
            date={historyDate}
            runs={runs}
            runAt={historyRun}
            status={
              archive.status === 'error' ? 'error' : archive.status === 'ready' ? (archive.data ? 'ready' : 'empty') : 'loading'
            }
            canGoForward={historyDate < today}
            onShiftDay={shiftHistoryDay}
            onRun={setHistoryRun}
            onLive={closeHistory}
          />
        )}
      </main>

      {meta && historyDate && archiveDay && historyRun && (
        <HistoryPanel
          unit={region ?? meta}
          countryName={region ? meta.name : undefined}
          onBackToCountry={() => setSelectedRegion(null)}
          stories={storiesAt(archiveDay, historyRun, selectedRegion ?? meta.code)}
          date={historyDate}
          runAt={historyRun}
          isMobile={isMobile}
          onClose={handleClose}
          onSheetChange={setSheetFraction}
        />
      )}
      {meta && !historyDate && (
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
          onOpenCountry={openCountry}
          trends={unitTrends}
        />
      )}
      {world && (
        <WorldPanel
          stories={worldStories}
          now={now}
          isMobile={isMobile}
          onClose={handleClose}
          onSheetChange={setSheetFraction}
          onOpenCountry={openCountry}
        />
      )}

      <div className={`toast${toast ? ' visible' : ''}`} role="status">
        {toast}
      </div>
    </div>
  );
}
