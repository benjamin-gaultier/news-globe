import { COUNTRIES, type CountryCode, type WorldStory } from '@news-globe/shared';
import { useTranslated } from '../hooks/useTranslated';
import { relativeTime } from '../lib/time';
import { TARGET_LANGUAGE } from '../lib/translate';
import { PanelShell } from './PanelShell';
import { CountryStoryRow } from './StoryParts';

/** "warner bros" → "Warner Bros": names arrive folded to lower case. */
const titleCase = (name: string) => name.replace(/(^|\s)(\p{L})/gu, (_, space: string, letter: string) => space + letter.toUpperCase());

function WorldItem({
  story,
  now,
  onOpenStory,
}: {
  story: WorldStory;
  now: number;
  onOpenStory: (code: CountryCode, clusterId: string) => void;
}) {
  const countries = story.countries.filter((c) => COUNTRIES[c.code]);
  // An English line for the story: an English-language country's headline when there is one,
  // else the best-covered headline translated on-device where the browser can (see lib/translate.ts).
  const english = countries.find((c) => c.language === TARGET_LANGUAGE);
  const lead = countries[0];
  const translated = useTranslated(english ? null : (lead?.title ?? null), lead?.language ?? TARGET_LANGUAGE, true);
  const line = english?.title ?? (translated.translated ? translated.text : null);
  return (
    <li className="story world-story">
      <p className="world-names">{story.names.map(titleCase).join(' · ') || 'Same story'}</p>
      {line && (
        <p className="world-english" lang={TARGET_LANGUAGE}>
          {line}
        </p>
      )}
      <p className="story-meta">
        In {countries.length} countries · latest {relativeTime(story.latestPublishedAt, now)}
      </p>
      <ul className="world-countries">
        {countries.map((c) => (
          <CountryStoryRow key={c.code} story={c} onOpen={onOpenStory} />
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
  /** Opens the story's page in one of its countries. */
  onOpenStory: (code: CountryCode, clusterId: string) => void;
}

/** Stories in several countries' top stories at once. */
export function WorldPanel({ stories, now, isMobile, onClose, onSheetChange, onOpenStory }: WorldPanelProps) {
  return (
    <PanelShell
      title="Across borders"
      subtitle="Stories in several countries’ top headlines right now"
      sheetKey="world"
      scrollKey="world"
      isMobile={isMobile}
      onClose={onClose}
      onSheetChange={onSheetChange}
    >
      {stories.length === 0 ? (
        <div className="panel-message">
          <p>No story is in several countries’ top headlines right now.</p>
        </div>
      ) : (
        <ol className="story-list">
          {stories.map((s) => (
            <WorldItem key={s.id} story={s} now={now} onOpenStory={onOpenStory} />
          ))}
        </ol>
      )}
      <p className="panel-footnote">
        Headlines link to the original publishers. Stories are matched across countries and languages by the names their headlines share
        (people, places, organisations), without translation.
      </p>
    </PanelShell>
  );
}
