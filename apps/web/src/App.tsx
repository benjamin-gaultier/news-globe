import { COUNTRIES, REGIONS, type Category, type CountryCode, type IndexEntry, type RegionCode } from '@news-globe/shared';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AboutPanel, InfoIcon } from './components/AboutPanel';
import { HeatLegend } from './components/HeatLegend';
import { HistoryBar, LiveBar } from './components/HistoryBar';
import { HistoryPanel } from './components/HistoryPanel';
import { NewsPanel } from './components/NewsPanel';
import { SearchBox } from './components/SearchBox';
import { SearchPanel } from './components/SearchPanel';
import { WorldIcon, WorldPanel } from './components/WorldPanel';
import { latestData, useAsync } from './hooks/useAsync';
import { useHashRoute } from './hooks/useHashRoute';
import { useHistoryMode } from './hooks/useHistoryMode';
import { MOBILE_QUERY, REDUCED_MOTION_QUERY, useMediaQuery } from './hooks/useMediaQuery';
import { useNow } from './hooks/useNow';
import { useRecentCountries } from './hooks/useRecentCountries';
import { fetchCountry, fetchIndex, fetchRegion, fetchTranslations, fetchTrends } from './lib/data';
import { pulsesFrom } from './lib/heat';
import { storiesAt, todayUtc } from './lib/history';
import { AUTHOR_URL } from './lib/links';
import { formatRoute, parseRoute } from './lib/route';
import { searchPlaces } from './lib/search';
import { TranslationsContext } from './lib/translations';
import { relativeTime } from './lib/time';
import { ABOUT, CATEGORY_NAMES, categoryIn, GLOBE, home, place, routeOf, viewFromRoute, WORLD, type View } from './lib/view';
import { visitorCountry } from './lib/visitor';

// three.js is most of the bundle; load it after the shell renders.
const GlobeView = lazy(() => import('./components/GlobeView'));

const INDEX_REFRESH_MS = 5 * 60_000;
/** The globe's entries while a History run loads: one empty map, so the globe isn't handed a new one every render. */
const NO_ENTRIES = new Map<string, IndexEntry>();
type GlobeArc = { startLat: number; startLng: number; endLat: number; endLng: number };
const NO_ARCS: GlobeArc[] = [];

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
      <path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="10" r="2.2" fill="currentColor" />
    </svg>
  );
}

/** Arcs from a story's first (best-covered) country to each of the others. */
function arcsBetween(codes: readonly CountryCode[]): GlobeArc[] {
  const [hub, ...rest] = codes.map((c) => COUNTRIES[c]).filter((m) => m !== undefined);
  return hub ? rest.map((m) => ({ startLat: hub.lat, startLng: hub.lng, endLat: m.lat, endLng: m.lng })) : [];
}

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
  const about = view.kind === 'about';
  // The visitor's country, guessed from this browser's time zone or language: the globe starts over it, and it
  // leads the shortcuts.
  const [visitor] = useState(visitorCountry);
  // The search box's text; its results are the 'search' view.
  const [query, setQuery] = useState('');
  const searchInput = useRef<HTMLInputElement>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [indexTick, setIndexTick] = useState(0);
  const [sheetFraction, setSheetFraction] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // The countries of the briefing's story under the pointer (or focused), lit on the globe.
  const [highlight, setHighlight] = useState<readonly CountryCode[] | null>(null);
  const highlighted = world ? highlight : null;

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

  // Trends for the latest run: badges, sparklines and pulses (live only).
  const trends = useAsync(historyDate ? null : (signal) => fetchTrends(signal), [historyDate, indexTick]);
  const trendsData = latestData(trends);

  // English for the most-seen headlines, from the hourly workflow (none until it is set up).
  const translationsFile = useAsync((signal) => fetchTranslations(signal), [indexTick]);
  const translationsData = latestData(translationsFile);
  const translations = useMemo(() => new Map(Object.entries(translationsData?.items ?? {})), [translationsData]);

  const liveEntries = useMemo(
    () => new Map([...(indexData?.countries ?? []), ...(indexData?.regions ?? [])].map((e) => [e.code, e])),
    [indexData],
  );
  // For callbacks that check a place's sections, without changing whenever the index reloads.
  const liveEntriesRef = useRef(liveEntries);
  liveEntriesRef.current = liveEntries;
  // In history mode the globe shows the picked run (nothing while it loads).
  const entries = historyDate ? (history.entries ?? NO_ENTRIES) : liveEntries;
  // Rings over the countries whose #1 story is new or rising this hour (live, no country open; not with reduced motion).
  const pulses = useMemo(
    () => (!historyDate && !reducedMotion && trendsData ? pulsesFrom(trendsData, liveEntries) : []),
    [historyDate, reducedMotion, trendsData, liveEntries],
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
  // The country a phone swipe moved to: browsed past, not picked. Only the swipe sets it; picking a country (even
  // the one swiped to, still open) or leaving it clears it, and the country it names becomes a shortcut.
  const [swipedTo, setSwipedTo] = useState<CountryCode | null>(null);
  useEffect(() => {
    if (selected !== swipedTo) setSwipedTo(null);
  }, [selected, swipedTo]);
  // Shortcuts to the countries picked lately (not a swipe's, nor a link's country that turns out to have no headlines).
  const recent = useRecentCountries(selected && selected !== swipedTo && available.has(selected) ? selected : null);
  // The visitor's own country first, once it is known to have headlines; it stays first when opened.
  const ownCountry = visitor && available.has(visitor) ? visitor : null;
  const shortcuts = ownCountry ? [ownCountry, ...recent.filter((c) => c !== ownCountry)] : recent;

  // Selecting a country always starts from its national top headlines; so does a swipe to the next one.
  // Closing (null) returns to the world briefing, or to the globe in History.
  const selectCountry = useCallback(
    (code: CountryCode | null) => {
      setSwipedTo(null);
      setView(code ? place(code) : home(historyDate));
    },
    [historyDate],
  );
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
  const openSearch = useCallback(() => setView({ kind: 'search' }), []);
  const closeSearch = useCallback(() => setView((v) => (v.kind === 'search' ? home(historyDate) : v)), [historyDate]);
  /** A search result: its country or region panel, live, on that story if it is a headline. */
  const openSearchResult = useCallback(
    (unit: string, title?: string) => {
      const region = REGIONS[unit];
      setSwipedTo(null);
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
  // Places with live headlines whose name matches the query; Enter opens the first.
  const places = useMemo(() => searchPlaces(query, (code) => liveEntries.has(code)), [query, liveEntries]);
  const submitSearch = useCallback(() => {
    if (places[0]) openSearchResult(places[0]);
  }, [places, openSearchResult]);

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
  // The countries the globe can open, live (in History, `available` is the day's): the tagline's and About's count.
  const countryCount = indexData?.countries.filter((c) => COUNTRIES[c.code]).length;

  // Arcs join the countries of the briefing story pointed at (or focused), and only then: every story's at once
  // would be a tangle in front of the globe.
  const arcs = useMemo(() => (highlighted ? arcsBetween(highlighted) : NO_ARCS), [highlighted]);

  // The URL hash follows the open view and History time; Back and Forward restore them.
  useHashRoute(routeOf(view, history.at), (route) => {
    setView(viewFromRoute(route));
    historyGoTo(route.at);
  });

  // Keep the open country's chip in view (on a phone the row can be wider than the screen).
  useEffect(() => {
    if (!selected) return;
    document
      .querySelector('.country-picker [aria-pressed="true"]')
      ?.scrollIntoView?.({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [selected]);

  const placeName = region?.name ?? (selected ? COUNTRIES[selected]?.name : undefined);
  const pageTitle = placeName ? `${placeName}${category === 'top' ? '' : ` · ${CATEGORY_NAMES[category]}`}` : undefined;
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
  // the world briefing, the region's country, or the place's top headlines.
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

  // History opens from a live panel's timeline and keeps its place (on the top list: History has no sections).
  const openHistory = useCallback(() => {
    setView((v) => (v.kind === 'place' ? { ...v, category: 'top', story: null } : GLOBE));
    startHistory();
  }, [startHistory]);
  /** Back to live: the open place stays; with none, the world briefing (History has none) opens again. */
  const goLive = useCallback(() => {
    closeHistory();
    setView((v) => (v.kind === 'globe' ? WORLD : v));
  }, [closeHistory]);
  // The briefing is live only: opening it leaves History.
  const toggleWorld = () => {
    if (world) return setView(GLOBE);
    closeHistory();
    setView(WORLD);
  };
  const toggleAbout = () => setView(about ? home(historyDate) : ABOUT);
  const closeAbout = useCallback(() => setView(home(historyDate)), [historyDate]);

  const handleUnavailable = useCallback((name: string) => showToast(`${name} — coming soon`), [showToast]);
  const handleClose = useCallback(() => selectCountry(null), [selectCountry]);
  // Closing the briefing leaves the globe alone; the World button brings it back.
  const closeWorld = useCallback(() => setView(GLOBE), []);
  /** Phones: a sideways swipe on a country's panel opens the next or previous country with headlines, in COUNTRIES order. */
  const swipeCountry = useCallback(
    (direction: 1 | -1) => {
      const codes = Object.keys(COUNTRIES).filter((c) => available.has(c));
      const current = selected ? codes.indexOf(selected) : -1;
      if (current < 0 || codes.length < 2) return;
      const next = codes[(current + direction + codes.length) % codes.length]!;
      selectCountry(next);
      setSwipedTo(next); // after selectCountry, which clears it
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
      setSwipedTo(null);
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
      onLive={goLive}
    />
  );

  return (
    <TranslationsContext.Provider value={translations}>
      <div className={`app${view.kind !== 'globe' ? ' has-panel' : ''}`}>
        <header className="topbar">
          <div className="brand">
            <h1>News Globe</h1>
            <p className="tagline">
              {countryCount ? `Top headlines in ${countryCount} countries` : 'Top headlines around the world'}
              <span className="tagline-more">, updated hourly</span>
            </p>
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
                <a href={AUTHOR_URL}>Benjamin Gaultier</a>
              </span>
            </p>
          </div>
          <SearchBox
            ref={searchInput}
            query={query}
            onQueryChange={changeQuery}
            onFocus={reopenSearch}
            onClear={clearSearch}
            onSubmit={submitSearch}
          />
          <div className="topbar-tools">
            <button type="button" className="tool-btn" aria-label="World" aria-pressed={world} onClick={toggleWorld}>
              <WorldIcon />
              <span>World</span>
            </button>
            <button type="button" className="tool-btn" aria-label="About" aria-pressed={about} onClick={toggleAbout}>
              <InfoIcon />
              <span>About</span>
            </button>
          </div>
          <nav className="country-picker" aria-label="Shortcuts">
            {shortcuts.map((code) => (
              <button
                key={code}
                type="button"
                className={code === ownCountry ? 'chip chip-own' : 'chip'}
                title={code === ownCountry ? 'Your country, going by this browser’s settings' : undefined}
                aria-pressed={selected === code}
                disabled={!available.has(code)}
                onClick={() => selectCountry(selected === code ? null : code)}
              >
                {code === ownCountry && <PinIcon />}
                {COUNTRIES[code]?.name ?? code}
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
              facing={visitor}
              isMobile={isMobile}
              sheetFraction={sheetFraction}
              arcs={arcs}
              pulses={pulses}
              highlighted={highlighted ?? undefined}
            />
          </Suspense>
          {view.kind === 'globe' && !historyDate && <p className="hint">Tap a highlighted country to see its top headlines</p>}
          {/* An index from before the ingest wrote counts shades everything alike: no key then. On phones, not under a sheet. */}
          {!meta &&
            !(isMobile && (historyDate || view.kind !== 'globe')) &&
            [...entries.values()].some((e) => e.topOutlets !== undefined) && <HeatLegend pulsing={pulses.length > 0} />}
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
            places={places}
            isMobile={isMobile}
            onClose={handleClose}
            onSheetChange={setSheetFraction}
            onOpenStory={openSearchResult}
            onOpenPlace={openSearchResult}
          />
        )}
        {about && <AboutPanel countries={countryCount} isMobile={isMobile} onClose={closeAbout} onSheetChange={setSheetFraction} />}
        {world && (
          <WorldPanel
            world={worldStories}
            updatedAt={indexData?.updatedAt}
            refreshKey={indexTick}
            now={now}
            isMobile={isMobile}
            onClose={closeWorld}
            onSheetChange={setSheetFraction}
            onOpenStory={openStoryIn}
            onHighlight={setHighlight}
            timeline={<LiveBar onHistory={openHistory} />}
          />
        )}

        <div className={`toast${toast ? ' visible' : ''}`} role="status">
          {toast}
        </div>
      </div>
    </TranslationsContext.Provider>
  );
}
