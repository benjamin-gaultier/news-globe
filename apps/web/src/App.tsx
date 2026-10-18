import { COUNTRIES, REGIONS, type Category, type CountryCode, type IndexEntry, type RegionCode } from '@news-globe/shared';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HeatLegend, type Shading } from './components/HeatLegend';
import { ClockIcon, HistoryBar, LiveBar } from './components/HistoryBar';
import { HistoryPanel } from './components/HistoryPanel';
import { NewsPanel } from './components/NewsPanel';
import { SearchBox } from './components/SearchBox';
import { SearchPanel } from './components/SearchPanel';
import { TodayIcon, TodayPanel } from './components/TodayPanel';
import { WorldPanel } from './components/WorldPanel';
import { latestData, useAsync } from './hooks/useAsync';
import { useHashRoute } from './hooks/useHashRoute';
import { useHistoryMode } from './hooks/useHistoryMode';
import { MOBILE_QUERY, REDUCED_MOTION_QUERY, useMediaQuery } from './hooks/useMediaQuery';
import { useNow } from './hooks/useNow';
import { fetchCountry, fetchIndex, fetchRegion, fetchTranslations, fetchTrends } from './lib/data';
import { changeStep, pulsesFrom } from './lib/heat';
import { storiesAt, todayUtc } from './lib/history';
import { formatRoute, parseRoute } from './lib/route';
import { TranslationsContext } from './lib/translations';
import { relativeTime } from './lib/time';
import { CATEGORY_NAMES, categoryIn, GLOBE, place, routeOf, viewFromRoute, type View } from './lib/view';

// three.js is most of the bundle; load it after the shell renders.
const GlobeView = lazy(() => import('./components/GlobeView'));

const INDEX_REFRESH_MS = 5 * 60_000;
/** The globe's entries while a History run loads: one empty map, so the globe isn't handed a new one every render. */
const NO_ENTRIES = new Map<string, IndexEntry>();

export function App() {
  const now = useNow();
  const isMobile = useMediaQuery(MOBILE_QUERY);
  const reducedMotion = useMediaQuery(REDUCED_MOTION_QUERY);
  const [initialRoute] = useState(() => parseRoute(location.hash));
  const [view, setView] = useState<View>(() => viewFromRoute(initialRoute));
  const placeView = view.kind === 'place' ? view : null;
  const selected = placeView?.country ?? null;
  const selectedRegion = placeView?.region ?? null;
  const category = placeView?.category ?? 'top';
  const world = view.kind === 'world';
  // The search box's text; its results are the 'search' view.
  const [query, setQuery] = useState('');
  const searchInput = useRef<HTMLInputElement>(null);
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
  const indexData = latestData(index);

  const today = todayUtc(now);
  const history = useHistoryMode(initialRoute.at, today, indexTick);
  const historyDate = history.date;
  const { open: startHistory, close: closeHistory, goTo: historyGoTo } = history;

  // Trends for the latest run: badges, sparklines and the "change" shading (live only).
  const trends = useAsync(historyDate ? null : (signal) => fetchTrends(signal), [historyDate, indexTick]);
  const trendsData = latestData(trends);
  const [shading, setShading] = useState<Shading>('coverage');

  // English for the most-seen headlines, from the hourly workflow (none until it is set up).
  const translationsFile = useAsync((signal) => fetchTranslations(signal), [indexTick]);
  const translationsData = latestData(translationsFile);
  const translations = useMemo(() => new Map(Object.entries(translationsData?.items ?? {})), [translationsData]);
  const canShadeByChange = !historyDate && !!trendsData;
  const shadeStep = useMemo(
    () => (canShadeByChange && shading === 'change' ? (code: string) => changeStep(trendsData!.change[code] ?? 0) : undefined),
    [canShadeByChange, shading, trendsData],
  );

  const liveEntries = useMemo(
    () => new Map([...(indexData?.countries ?? []), ...(indexData?.regions ?? [])].map((e) => [e.code, e])),
    [indexData],
  );
  // For callbacks that check a place's sections, without changing whenever the index reloads.
  const liveEntriesRef = useRef(liveEntries);
  liveEntriesRef.current = liveEntries;
  // In history mode the globe shows the picked run (nothing while it loads).
  const entries = historyDate ? (history.entries ?? NO_ENTRIES) : liveEntries;
  // Rings over the countries whose #1 story is new or rising this hour (live, overview only; not with reduced motion).
  const pulses = useMemo(
    () => (!historyDate && !world && !reducedMotion && trendsData ? pulsesFrom(trendsData, liveEntries) : []),
    [historyDate, world, reducedMotion, trendsData, liveEntries],
  );

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

  // Selecting a country (or closing) always starts from its national top headlines; so does a swipe to the next one.
  const selectCountry = useCallback((code: CountryCode | null) => setView(code ? place(code) : GLOBE), []);
  /** A region of the open country, or back to the country (null), in the same section when that place has one. */
  const selectRegion = useCallback(
    (code: RegionCode | null) =>
      setView((v) =>
        v.kind === 'place'
          ? {
              ...v,
              region: code,
              category: categoryIn(liveEntriesRef.current.get(code ?? v.country), v.category),
              story: null,
              focusTitle: null,
            }
          : v,
      ),
    [],
  );
  /** The open place's top headlines or one of its sections (the switch only offers the ones it has). */
  const selectCategory = useCallback(
    (category: Category) => setView((v) => (v.kind === 'place' ? { ...v, category, story: null, focusTitle: null } : v)),
    [],
  );
  /** A story's page in the open panel, or back to its list (null). */
  const showStory = useCallback((story: string | null) => setView((v) => (v.kind === 'place' ? { ...v, story } : v)), []);
  const openWorld = useCallback(() => setView({ kind: 'world' }), []);
  const openSearch = useCallback(() => setView({ kind: 'search' }), []);
  const closeSearch = useCallback(() => setView((v) => (v.kind === 'search' ? GLOBE : v)), []);
  /** A search result: its country or region panel, live, on that story. */
  const openSearchResult = useCallback(
    (unit: string, title: string) => {
      const region = REGIONS[unit];
      setView(place(region?.country ?? unit, { region: region ? unit : null, focusTitle: title }));
      closeHistory();
    },
    [closeHistory],
  );
  // Results show while the box has text; emptying it closes them.
  const changeQuery = useCallback(
    (text: string) => {
      setQuery(text);
      if (text.trim()) openSearch();
      else closeSearch();
    },
    [openSearch, closeSearch],
  );
  const reopenSearch = useCallback(() => {
    if (query.trim()) openSearch();
  }, [query, openSearch]);
  const clearSearch = useCallback(() => {
    setQuery('');
    closeSearch();
  }, [closeSearch]);

  // "/" jumps to the search box, as on many sites, unless the user is typing somewhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      e.preventDefault();
      searchInput.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
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

  // The URL hash follows the open view and History time; Back and Forward restore them.
  useHashRoute(routeOf(view, history.at), (route) => {
    setView(viewFromRoute(route));
    historyGoTo(route.at);
  });

  // Keep the open country's chip in view (a swipe or a link can open one far along the row).
  useEffect(() => {
    if (!selected) return;
    document
      .querySelector('.country-picker [aria-pressed="true"]')
      ?.scrollIntoView?.({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [selected]);

  const placeName = region?.name ?? (selected ? COUNTRIES[selected]?.name : undefined);
  const pageTitle = placeName
    ? `${placeName}${category === 'top' ? '' : ` · ${CATEGORY_NAMES[category]}`}`
    : world
      ? 'Across borders'
      : view.kind === 'today'
        ? 'Today'
        : undefined;
  useEffect(() => {
    document.title = pageTitle ? `${pageTitle} · News Globe` : 'News Globe';
  }, [pageTitle]);

  // Refetch the open country or region when the index reports a newer file. The index dates only top files, and a run
  // that keeps a place's previous top file can still rewrite its sections: a section follows every run (304 if unchanged).
  const selectedEntry = selected ? liveEntries.get(selectedRegion ?? selected) : undefined;
  const selectedUpdatedAt = category === 'top' ? selectedEntry?.updatedAt : indexData?.updatedAt;
  const country = useAsync(
    historyDate
      ? null
      : selectedRegion
        ? (signal) => fetchRegion(selectedRegion, category, signal)
        : selected
          ? (signal) => fetchCountry(selected, category, signal)
          : null,
    [historyDate, selected, selectedRegion, category, selectedUpdatedAt, retryKey],
  );

  // Trends apply only to the run they describe: the file shown must be that run's, and a top file (they don't cover sections).
  const shownFile = country.status === 'ready' ? country.data : undefined;
  const unitTrends =
    trendsData && shownFile && !shownFile.category && trendsData.runAt === shownFile.updatedAt
      ? trendsData.units[shownFile.regionCode ?? shownFile.countryCode]
      : undefined;

  const showToast = useCallback((message: string) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }, []);

  // A link may name a country, region or section that has no data (yet). Once the index is in,
  // fall back to the nearest view that has some, replacing the entry so Back doesn't return to it:
  // the globe, the region's country, or the place's top headlines.
  useEffect(() => {
    if (!indexData || !placeView || historyDate) return;
    const { country: code, region: unit } = placeView;
    if (!available.has(code)) {
      window.history.replaceState(null, '', location.pathname + location.search);
      selectCountry(null);
      showToast(`${COUNTRIES[code]!.name} — coming soon`);
      return;
    }
    const region = unit && regions.some((r) => r.code === unit) ? unit : null;
    const section = categoryIn(liveEntries.get(region ?? code), placeView.category);
    if (region === unit && section === placeView.category) return;
    const next = place(code, { region, category: section });
    window.history.replaceState(null, '', formatRoute(routeOf(next, null)));
    setView(next);
  }, [indexData, available, regions, liveEntries, placeView, selectCountry, showToast, historyDate]);

  // History keeps the open place (on its top list: History has no sections); any other panel closes.
  const openHistory = useCallback(() => {
    setView((v) => (v.kind === 'place' ? { ...v, category: 'top', story: null } : GLOBE));
    startHistory();
  }, [startHistory]);
  const toggleHistory = () => (historyDate ? closeHistory() : openHistory());
  // Today is live only: opening it leaves History.
  const toggleToday = () => {
    if (view.kind === 'today') return selectCountry(null);
    closeHistory();
    setView({ kind: 'today' });
  };

  const handleUnavailable = useCallback((name: string) => showToast(`${name} — coming soon`), [showToast]);
  const handleClose = useCallback(() => selectCountry(null), [selectCountry]);
  /** Phones: a sideways swipe on a country's panel opens the next or previous country with headlines, in the list's order. */
  const swipeCountry = useCallback(
    (direction: 1 | -1) => {
      const codes = Object.keys(COUNTRIES).filter((c) => available.has(c));
      const current = selected ? codes.indexOf(selected) : -1;
      if (current < 0 || codes.length < 2) return;
      selectCountry(codes[(current + direction + codes.length) % codes.length]!);
    },
    [available, selected, selectCountry],
  );
  /** A story's counterpart in another country: that country's panel, on the story's page. */
  const openStoryIn = useCallback(
    (code: CountryCode, clusterId: string) => {
      if (!available.has(code)) {
        handleUnavailable(COUNTRIES[code]?.name ?? code);
        return;
      }
      setView(place(code, { story: clusterId }));
    },
    [available, handleUnavailable],
  );
  const retry = useCallback(() => setRetryKey((k) => k + 1), []);
  const meta = selected ? COUNTRIES[selected] : undefined;

  // Switching the same place's panel between live and History swaps the panel: no slide-in then.
  const panelUnit = meta ? (selectedRegion ?? meta.code) : null;
  const shownUnit = useRef<string | null>(null);
  const animatePanel = panelUnit === null || shownUnit.current !== panelUnit;
  useEffect(() => {
    shownUnit.current = panelUnit;
  }, [panelUnit]);

  // Above the headlines while a place is open; over the globe otherwise.
  const historyBar = historyDate && (
    <HistoryBar
      date={historyDate}
      runs={history.runs}
      runAt={history.run}
      status={history.status}
      canGoForward={historyDate < today}
      onShiftDay={history.shiftDay}
      onRun={history.pickRun}
      onLive={closeHistory}
    />
  );

  return (
    <TranslationsContext.Provider value={translations}>
      <div className={`app${view.kind !== 'globe' ? ' has-panel' : ''}`}>
        <header className="topbar">
          <div className="brand">
            <h1>News Globe</h1>
            {/* No live region here: "Updated N minutes ago" ticks every 30 s. Only the error is announced. */}
            <p className="updated">
              {index.status === 'error' && !indexData ? (
                <span role="alert">
                  Couldn’t reach the news data.{' '}
                  <button type="button" className="link-btn" onClick={retry}>
                    Retry
                  </button>
                </span>
              ) : indexData ? (
                <>Updated {relativeTime(indexData.updatedAt, now)}</>
              ) : (
                <>Loading…</>
              )}
              <span className="credit">
                {' · by '}
                <a href="https://benjamingaultier.com/">Benjamin Gaultier</a>
              </span>
            </p>
          </div>
          <SearchBox ref={searchInput} query={query} onQueryChange={changeQuery} onFocus={reopenSearch} onClear={clearSearch} />
          <div className="topbar-tools">
            <button type="button" className="tool-btn" aria-label="Today" aria-pressed={view.kind === 'today'} onClick={toggleToday}>
              <TodayIcon />
              <span>Today</span>
            </button>
            <button type="button" className="tool-btn" aria-label="History" aria-pressed={historyDate !== null} onClick={toggleHistory}>
              <ClockIcon />
              <span>History</span>
            </button>
          </div>
          <nav className="country-picker" aria-label="Countries">
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
              onSelectRegion={selectRegion}
              onUnavailable={handleUnavailable}
              isMobile={isMobile}
              sheetFraction={sheetFraction}
              shadeStep={shadeStep}
              arcs={arcs}
              pulses={pulses}
            />
          </Suspense>
          {view.kind === 'globe' && !historyDate && <p className="hint">Tap a highlighted country to see its top headlines</p>}
          {/* An index from before the ingest wrote counts shades everything alike: no key then. */}
          {!meta && !world && !(historyDate && isMobile) && [...entries.values()].some((e) => e.topOutlets !== undefined) && (
            <HeatLegend
              shading={canShadeByChange ? shading : 'coverage'}
              onShadingChange={canShadeByChange ? setShading : undefined}
              pulsing={pulses.length > 0}
            />
          )}
          {!meta && historyBar}
        </main>

        {meta && historyDate && (
          <HistoryPanel
            unit={region ?? meta}
            countryName={region ? meta.name : undefined}
            onBackToCountry={() => selectRegion(null)}
            stories={history.day && history.runOfDay ? storiesAt(history.day, history.runOfDay, selectedRegion ?? meta.code) : null}
            note={
              history.status === 'error'
                ? 'Couldn’t load this day.'
                : history.status === 'empty' || (history.day && !history.runs.length)
                  ? 'No history for this day.'
                  : 'Loading…'
            }
            date={historyDate}
            runAt={history.runOfDay}
            timeline={historyBar}
            animate={animatePanel}
            onSwipe={swipeCountry}
            isMobile={isMobile}
            onClose={handleClose}
            onSheetChange={setSheetFraction}
          />
        )}
        {meta && placeView && !historyDate && (
          <NewsPanel
            country={meta}
            region={region}
            regions={regions}
            onSelectRegion={selectRegion}
            category={category}
            categories={selectedEntry?.categories}
            onSelectCategory={selectCategory}
            state={country}
            now={now}
            isMobile={isMobile}
            onClose={handleClose}
            onRetry={retry}
            onSheetChange={setSheetFraction}
            story={placeView.story}
            onOpenStory={showStory}
            onOpenStoryIn={openStoryIn}
            world={worldStories}
            onToast={showToast}
            trends={unitTrends}
            trendRuns={unitTrends ? trendsData?.runs : undefined}
            focusTitle={placeView.focusTitle}
            timeline={<LiveBar onHistory={openHistory} />}
            animate={animatePanel}
            onSwipe={swipeCountry}
          />
        )}
        {view.kind === 'search' && (
          <SearchPanel
            query={query}
            isMobile={isMobile}
            onClose={handleClose}
            onSheetChange={setSheetFraction}
            onOpenStory={openSearchResult}
          />
        )}
        {view.kind === 'today' && (
          <TodayPanel
            world={worldStories}
            now={now}
            isMobile={isMobile}
            onClose={handleClose}
            onSheetChange={setSheetFraction}
            onOpenStory={openStoryIn}
            onOpenWorld={openWorld}
          />
        )}
        {world && (
          <WorldPanel
            stories={worldStories}
            now={now}
            isMobile={isMobile}
            onClose={handleClose}
            onSheetChange={setSheetFraction}
            onOpenStory={openStoryIn}
          />
        )}

        <div className={`toast${toast ? ' visible' : ''}`} role="status">
          {toast}
        </div>
      </div>
    </TranslationsContext.Provider>
  );
}
