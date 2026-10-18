import type { CountryCode, TodayStory, WorldStory } from '@news-globe/shared';
import { type PointerEvent, type ReactNode, useCallback, useEffect, useMemo, useRef } from 'react';
import { latestData, useAsync } from '../hooks/useAsync';
import { useTranslated } from '../hooks/useTranslated';
import { briefOf, notIn, topStories, type Brief } from '../lib/briefing';
import { fetchToday } from '../lib/data';
import { plural } from '../lib/text';
import { clock, relativeTime } from '../lib/time';
import { TARGET_LANGUAGE, translatedTextUrl } from '../lib/translate';
import { PanelShell } from './PanelShell';
import { CountryChips, Thumbnail, TrendBadge } from './StoryParts';

export function WorldIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <path
        d="M3.5 12h17M12 3.5c-2.6 2.4-3.6 5.3-3.6 8.5s1 6.1 3.6 8.5c2.6-2.4 3.6-5.3 3.6-8.5S14.6 5.9 12 3.5z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}

type OpenStory = (code: CountryCode, clusterId: string) => void;
type Highlight = (countries: readonly CountryCode[] | null) => void;
/** What lights a story: the pointer resting on it, or keyboard focus in it. */
const LIT_BY = ['pointer', 'focus'] as const;
type LitBy = (typeof LIT_BY)[number];
type Light = (by: LitBy, countries: readonly CountryCode[] | null) => void;

/**
 * One story: its headline (an English-speaking country's, else the best-covered one, in English where it can be
 * translated), opening its page in that country, and a chip for each country whose top headlines carry it.
 * Pointing at it, or focusing it from the keyboard, lights those countries up on the globe. A tap does neither:
 * touch has no hover, and nothing would clear the focus it leaves (on a Translate link that opened a tab, say).
 */
function BriefItem({
  brief,
  detail,
  image = false,
  onOpenStory,
  onLight,
}: {
  brief: Brief;
  detail: string;
  image?: boolean;
  onOpenStory: OpenStory;
  onLight: Light;
}) {
  const lead = brief.countries.find((c) => c.language === TARGET_LANGUAGE) ?? brief.countries[0]!;
  const language = lead.language ?? TARGET_LANGUAGE;
  const title = useTranslated(lead.title, language, true);
  // What this line lit. A refresh can change its countries, or drop it from the list, while it is lit: nothing else
  // would light the new ones, or clear them.
  const lit = useRef<Record<LitBy, boolean>>({ pointer: false, focus: false });
  const codes = brief.countries.map((c) => c.code).join(' ');
  const light = (by: LitBy, on: boolean) => {
    lit.current[by] = on;
    onLight(by, on ? codes.split(' ') : null);
  };
  useEffect(() => {
    for (const by of LIT_BY) if (lit.current[by]) onLight(by, codes.split(' '));
  }, [codes, onLight]);
  useEffect(
    () => () => {
      for (const by of LIT_BY) if (lit.current[by]) onLight(by, null);
    },
    [onLight],
  );
  const hover = (on: boolean) => (e: PointerEvent) => e.pointerType !== 'touch' && light('pointer', on);
  return (
    <li
      className="story brief"
      onPointerEnter={hover(true)}
      onPointerLeave={hover(false)}
      onFocus={(e) => e.target.matches(':focus-visible') && light('focus', true)}
      onBlur={() => lit.current.focus && light('focus', false)}
    >
      <div className="story-main">
        <div className="story-text">
          <button
            type="button"
            className="story-title brief-open"
            onClick={() => onOpenStory(lead.code, lead.clusterId)}
            lang={title.translated ? TARGET_LANGUAGE : language}
            dir="auto"
            title={title.translated ? lead.title : undefined}
          >
            {title.text}
          </button>
          <div className="story-meta">
            <TrendBadge state={brief.state} />
            {detail}
            <span aria-hidden="true"> · </span>
            <a
              className="story-translate"
              href={lead.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Read “${lead.title}” at its publisher`}
            >
              Read ↗
            </a>
            {/* No on-device translation (phones): the headline in Google Translate. */}
            {language !== TARGET_LANGUAGE && !title.translated && (
              <>
                <span aria-hidden="true"> · </span>
                <a
                  className="story-translate"
                  href={translatedTextUrl(lead.title, language)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Translate “${lead.title}” with Google Translate`}
                >
                  Translate ↗
                </a>
              </>
            )}
          </div>
        </div>
        {image && <Thumbnail src={brief.imageUrl} className="story-thumb" />}
      </div>
      <CountryChips countries={brief.countries} onOpen={onOpenStory} />
    </li>
  );
}

const outlets = (s: TodayStory) => `${plural(s.outlets, 'outlet')} · ${s.source}`;
const topDetail = (b: Brief) =>
  b.countries.length > 1
    ? `${plural(b.outlets, 'outlet')} in ${b.countries.length} countries`
    : `${plural(b.outlets, 'outlet')}${b.source ? ` · ${b.source}` : ''}`;

export interface WorldPanelProps {
  /** Cross-border stories, from the index. */
  world: readonly WorldStory[];
  /** Changes each time the app re-reads the index: Today's file is re-read with it. */
  refreshKey: number;
  now: number;
  isMobile: boolean;
  onClose: () => void;
  onSheetChange: (fraction: number) => void;
  /** Opens a story's page in one of its countries. */
  onOpenStory: OpenStory;
  /** The countries of the story pointed at or focused, for the globe; null when there is none. */
  onHighlight: Highlight;
  /** The bar under the heading: Live, and the way into History. */
  timeline?: ReactNode;
}

/**
 * The world briefing, and the landing view: the top stories worldwide right now, each with the countries whose
 * headlines carry it, then what is rising this hour and what has stayed on top all day.
 */
export function WorldPanel({
  world,
  refreshKey,
  now,
  isMobile,
  onClose,
  onSheetChange,
  onOpenStory,
  onHighlight,
  timeline,
}: WorldPanelProps) {
  const file = useAsync((signal) => fetchToday(signal), [refreshKey]);
  // Kept while it is re-read; undefined until the first read is in (null: the workflow hasn't written it yet).
  const loaded = latestData(file);
  // Today's file is written after the index, so it can be a run or more behind `world`. Its stories still fold into their
  // cross-border lines, as a story keeps its id (its lead article's) from run to run; one whose lead article changed
  // shows twice until the file catches up, which beats a briefing without them.
  const today = loaded ?? null;
  const top = useMemo(() => topStories(today?.top ?? [], world), [today, world]);
  const rising = notIn(top, today?.rising ?? []);
  const lasting = notIn([...top, ...rising.map(briefOf)], today?.lasting ?? []);
  // The story pointed at lights the globe, else the one with keyboard focus: the mouse passing over the list
  // leaves the focused story lit once it has gone.
  const lit = useRef<Record<LitBy, readonly CountryCode[] | null>>({ pointer: null, focus: null });
  const light = useCallback<Light>(
    (by, countries) => {
      lit.current[by] = countries;
      onHighlight(lit.current.pointer ?? lit.current.focus);
    },
    [onHighlight],
  );
  // No story stays lit once the briefing closes.
  useEffect(() => () => onHighlight(null), [onHighlight]);

  const subtitle = today ? (
    <>
      {today.countries} countries · {today.stories.toLocaleString('en')} stories · updated {relativeTime(today.runAt, now)}
    </>
  ) : (
    'The top stories worldwide right now'
  );

  let body: ReactNode;
  // The cross-border stories are in as soon as the index is: they show while Today's file loads, and its stories fold in.
  if (loaded === undefined && file.status === 'loading' && !top.length) body = <p className="panel-message">Loading…</p>;
  else if (!top.length)
    body = (
      <p className="panel-message">
        {file.status === 'error'
          ? 'Couldn’t load today’s stories.'
          : 'Today’s stories aren’t available yet. They appear after the next hourly update.'}
      </p>
    );
  else
    body = (
      <>
        <section className="world-section" aria-labelledby="world-top">
          <h3 id="world-top">Top stories</h3>
          <ol className="story-list">
            {top.map((b) => (
              <BriefItem key={b.key} brief={b} detail={topDetail(b)} image onOpenStory={onOpenStory} onLight={light} />
            ))}
          </ol>
        </section>

        {rising.length > 0 && (
          <section className="world-section" aria-labelledby="world-rising">
            <h3 id="world-rising">Rising this hour</h3>
            <ol className="story-list">
              {rising.map((s) => (
                <BriefItem
                  key={`${s.unit}/${s.clusterId}`}
                  brief={briefOf(s)}
                  detail={`#${s.rank} · ${outlets(s)}`}
                  onOpenStory={onOpenStory}
                  onLight={light}
                />
              ))}
            </ol>
          </section>
        )}

        {lasting.length > 0 && (
          <section className="world-section" aria-labelledby="world-lasting">
            <h3 id="world-lasting">On top all day</h3>
            <ol className="story-list">
              {lasting.map((s) => (
                <BriefItem
                  key={`${s.unit}/${s.clusterId}`}
                  brief={briefOf(s)}
                  detail={`#${s.rank} · in the top list since ${clock(s.firstSeen)}`}
                  onOpenStory={onOpenStory}
                  onLight={light}
                />
              ))}
            </ol>
          </section>
        )}
        <p className="panel-footnote">
          Top stories are ranked by how many outlets cover them, added up over every country whose top headlines carry them. Stories are
          matched across countries by the names their headlines share (people, places, organisations), without translation. Headlines are
          translated on this device where the browser can; elsewhere “Translate” opens one in Google Translate.
        </p>
      </>
    );

  return (
    <PanelShell
      title="World"
      subtitle={subtitle}
      sheetKey="world"
      peek
      scrollKey="world"
      isMobile={isMobile}
      onClose={onClose}
      onSheetChange={onSheetChange}
      toolbar={timeline}
    >
      {body}
    </PanelShell>
  );
}
