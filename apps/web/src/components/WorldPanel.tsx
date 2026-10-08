import { COUNTRIES, type CountryCode, type WorldStory } from '@news-globe/shared';
import { relativeTime } from '../lib/time';
import { PanelShell } from './PanelShell';

/** "warner bros" → "Warner Bros": names arrive folded to lower case. */
const titleCase = (name: string) => name.replace(/(^|\s)(\p{L})/gu, (_, space: string, letter: string) => space + letter.toUpperCase());

function WorldItem({ story, now, onOpenCountry }: { story: WorldStory; now: number; onOpenCountry: (code: CountryCode) => void }) {
  const countries = story.countries.filter((c) => COUNTRIES[c.code]);
  return (
    <li className="story world-story">
      <p className="world-names">{story.names.map(titleCase).join(' · ') || 'Same story'}</p>
      <p className="story-meta">
        In {countries.length} countries · latest {relativeTime(story.latestPublishedAt, now)}
      </p>
      <ul className="world-countries">
        {countries.map((c) => (
          <li key={c.code}>
            <button type="button" className="chip chip-small" onClick={() => onOpenCountry(c.code)}>
              {COUNTRIES[c.code]!.name}
            </button>
            <a className="related-title" href={c.url} target="_blank" rel="noopener noreferrer" dir="auto">
              {c.title}
            </a>
            {c.outletCount24h > 1 && <span className="related-time"> · {c.outletCount24h} outlets</span>}
          </li>
        ))}
      </ul>
    </li>
  );
}

export interface WorldPanelProps {
  stories: WorldStory[];
  now: number;
  isMobile: boolean;
  onClose: () => void;
  onSheetChange: (fraction: number) => void;
  onOpenCountry: (code: CountryCode) => void;
}

/** Stories in several countries' top stories at once. */
export function WorldPanel({ stories, now, isMobile, onClose, onSheetChange, onOpenCountry }: WorldPanelProps) {
  const heading = (
    <>
      <h2 id="panel-title">Across borders</h2>
      <p className="panel-sub">Stories in several countries’ top headlines right now</p>
    </>
  );
  return (
    <PanelShell heading={heading} sheetKey="world" scrollKey="world" isMobile={isMobile} onClose={onClose} onSheetChange={onSheetChange}>
      {stories.length === 0 ? (
        <div className="panel-message">
          <p>No story is in several countries’ top headlines right now.</p>
        </div>
      ) : (
        <ol className="story-list">
          {stories.map((s) => (
            <WorldItem key={s.id} story={s} now={now} onOpenCountry={onOpenCountry} />
          ))}
        </ol>
      )}
      <p className="panel-footnote">
        Headlines link to the original publishers. Stories are matched across countries and languages by the names their
        headlines share (people, places, organisations), without translation.
      </p>
    </PanelShell>
  );
}
