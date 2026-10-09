import { COUNTRIES, type CountryCode, type TodayStory, type WorldStory } from '@news-globe/shared';
import { useAsync } from '../hooks/useAsync';
import { useTranslated } from '../hooks/useTranslated';
import { fetchToday } from '../lib/data';
import { plural } from '../lib/text';
import { clock, relativeTime } from '../lib/time';
import { TARGET_LANGUAGE, translatedTextUrl } from '../lib/translate';
import { PanelShell } from './PanelShell';
import { Thumbnail, TrendBadge } from './StoryParts';

const WORLD_SHOWN = 4;

export function TodayIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <rect x="4" y="5" width="16" height="15" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M4 10h16M9 3v4M15 3v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** One story: its country, its headline (in English where the browser can translate on-device), and its coverage. */
function TodayItem({
  story,
  onOpenStory,
  detail,
  image = false,
}: {
  story: TodayStory;
  onOpenStory: (code: CountryCode, clusterId: string) => void;
  detail: string;
  image?: boolean;
}) {
  const title = useTranslated(story.title, story.language, true);
  const country = COUNTRIES[story.unit]?.name ?? story.unit;
  return (
    <li className="today-item">
      <button type="button" className="today-open" onClick={() => onOpenStory(story.unit, story.clusterId)}>
        <span className="today-text">
          <span className="today-place">
            {country}
            <TrendBadge state={story.state} />
          </span>
          <span
            className="today-title"
            lang={title.translated ? TARGET_LANGUAGE : story.language}
            dir="auto"
            title={title.translated ? story.title : undefined}
          >
            {title.text}
          </span>
          <span className="today-meta">{detail}</span>
        </span>
        {image && <Thumbnail src={story.imageUrl} className="today-thumb" />}
      </button>
      {/* No on-device translation (phones): the headline in Google Translate. Beside the button, not in it. */}
      {story.language !== TARGET_LANGUAGE && !title.translated && (
        <a
          className="today-translate"
          href={translatedTextUrl(story.title, story.language)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Translate “${story.title}” with Google Translate`}
        >
          Translate ↗
        </a>
      )}
    </li>
  );
}

const outlets = (s: TodayStory) => `${plural(s.outlets, 'outlet')} · ${s.source}`;

export interface TodayPanelProps {
  /** Cross-border stories from the index. */
  world: readonly WorldStory[];
  now: number;
  isMobile: boolean;
  onClose: () => void;
  onSheetChange: (fraction: number) => void;
  /** Opens a story's page in its country. */
  onOpenStory: (code: CountryCode, clusterId: string) => void;
  onOpenWorld: () => void;
}

/** The day at a glance: the most covered stories, what's rising, what crosses borders and what has lasted all day. */
export function TodayPanel({ world, now, isMobile, onClose, onSheetChange, onOpenStory, onOpenWorld }: TodayPanelProps) {
  const file = useAsync((signal) => fetchToday(signal), []);
  const today = file.status === 'ready' ? file.data : null;

  const heading = (
    <>
      <h2 id="panel-title">Today</h2>
      <p className="panel-sub">
        {today ? (
          <>
            {today.countries} countries · {today.stories.toLocaleString('en')} stories · updated {relativeTime(today.runAt, now)}
          </>
        ) : (
          'The day’s news at a glance'
        )}
      </p>
    </>
  );

  let body;
  if (file.status === 'error') body = <p className="panel-message">Couldn’t load today’s stories.</p>;
  else if (file.status === 'loading') body = <p className="panel-message">Loading…</p>;
  else if (!today) body = <p className="panel-message">Today’s overview isn’t available yet. It appears after the next hourly update.</p>;
  else
    body = (
      <>
        <section className="today-section" aria-labelledby="today-top">
          <h3 id="today-top">Most covered</h3>
          <ol className="today-list">
            {today.top.map((s) => (
              <TodayItem key={`${s.unit}/${s.clusterId}`} story={s} onOpenStory={onOpenStory} detail={outlets(s)} image />
            ))}
          </ol>
        </section>

        {today.rising.length > 0 && (
          <section className="today-section" aria-labelledby="today-rising">
            <h3 id="today-rising">Rising this hour</h3>
            <ol className="today-list">
              {today.rising.map((s) => (
                <TodayItem key={`${s.unit}/${s.clusterId}`} story={s} onOpenStory={onOpenStory} detail={`#${s.rank} · ${outlets(s)}`} />
              ))}
            </ol>
          </section>
        )}

        {world.length > 0 && (
          <section className="today-section" aria-labelledby="today-world">
            <h3 id="today-world">Across borders</h3>
            <ul className="today-list">
              {world.slice(0, WORLD_SHOWN).map((w) => {
                const lead = w.countries.find((c) => c.language === TARGET_LANGUAGE) ?? w.countries[0]!;
                const names = w.countries.filter((c) => COUNTRIES[c.code]).map((c) => COUNTRIES[c.code]!.name);
                return (
                  <li key={w.id} className="today-item">
                    <button type="button" className="today-open" onClick={() => onOpenStory(lead.code, lead.clusterId)}>
                      <span className="today-text">
                        <span className="today-place">{names.join(' · ')}</span>
                        <span className="today-title" lang={lead.language} dir="auto">
                          {lead.title}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {world.length > WORLD_SHOWN && (
              <button type="button" className="story-more" onClick={onOpenWorld}>
                All {world.length} cross-border stories
                <span className="chevron chevron-right" aria-hidden="true" />
              </button>
            )}
          </section>
        )}

        {today.lasting.length > 0 && (
          <section className="today-section" aria-labelledby="today-lasting">
            <h3 id="today-lasting">On top all day</h3>
            <ol className="today-list">
              {today.lasting.map((s) => (
                <TodayItem
                  key={`${s.unit}/${s.clusterId}`}
                  story={s}
                  onOpenStory={onOpenStory}
                  detail={`#${s.rank} · in the top list since ${clock(s.firstSeen)}`}
                />
              ))}
            </ol>
          </section>
        )}
        <p className="panel-footnote">
          “Most covered” counts each country’s own outlets, so it favours stories a country’s whole press is following.
          Headlines are translated on this device where the browser can; elsewhere “Translate” opens one in Google
          Translate.
        </p>
      </>
    );

  return (
    <PanelShell heading={heading} sheetKey="today" scrollKey="today" isMobile={isMobile} onClose={onClose} onSheetChange={onSheetChange}>
      {body}
    </PanelShell>
  );
}
