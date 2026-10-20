import { AUTHOR_URL, REPO_URL, SOURCES_URL } from '../lib/links';
import { PanelShell } from './PanelShell';

export function InfoIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M12 11v5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="7.75" r="1.25" fill="currentColor" />
    </svg>
  );
}

function External({ href, children }: { href: string; children: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}&nbsp;↗
    </a>
  );
}

export interface AboutPanelProps {
  /** Countries with headlines, once the index is in. */
  countries?: number;
  isMobile: boolean;
  onClose: () => void;
  onSheetChange: (fraction: number) => void;
}

/** What the site is, how it ranks stories, where the headlines come from, and who made it. */
export function AboutPanel({ countries, isMobile, onClose, onSheetChange }: AboutPanelProps) {
  return (
    <PanelShell
      title="About"
      subtitle="What this is and where the headlines come from"
      sheetKey="about"
      scrollKey="about"
      isMobile={isMobile}
      onClose={onClose}
      onSheetChange={onSheetChange}
    >
      <div className="about">
        <section aria-labelledby="about-what">
          <h3 id="about-what">What this is</h3>
          <p>
            News Globe shows what each country’s own news outlets are leading with right now
            {countries ? <>, in {countries} countries</> : null}. Click a country on the globe for its top national headlines; some
            countries also have regional ones. The World view gathers the stories in the headlines of several countries at once.
          </p>
        </section>
        <section aria-labelledby="about-rank">
          <h3 id="about-rank">How stories are ranked</h3>
          <p>
            Headlines from different outlets about the same story are grouped together, and each country’s stories are ranked by how many
            outlets covered them in the last 24 hours. The globe’s shading shows how widely each country’s top story is covered. The list is
            rebuilt every hour, and History replays any day hour by hour.
          </p>
        </section>
        <section aria-labelledby="about-sources">
          <h3 id="about-sources">Where the headlines come from</h3>
          <p>
            The outlets’ own RSS feeds, checked every hour. Only the headline, the feed’s short summary, the picture’s link and the time are
            kept, never the article: every headline links to its publisher. <External href={SOURCES_URL}>Every outlet, by country</External>
          </p>
        </section>
        <section aria-labelledby="about-ai">
          <h3 id="about-ai">No AI picks the news</h3>
          <p>
            Nothing here is written, picked or summarised by AI: stories are grouped by the words their headlines share and ranked by
            counting outlets. English versions of foreign headlines are machine translations, made on your device where the browser can, and
            hourly for the most-seen headlines.
          </p>
        </section>
        <section aria-labelledby="about-who">
          <h3 id="about-who">Who made it</h3>
          <p>
            <External href={AUTHOR_URL}>Benjamin Gaultier</External>, a full stack engineer in Paris. The code is open source:{' '}
            <External href={REPO_URL}>News Globe on GitHub</External>. Ideas and bug reports are welcome there.
          </p>
        </section>
        <p className="about-tip">
          {/* Phones have no key to press. */}
          {!isMobile && (
            <>
              Press <kbd>/</kbd> to search every headline.{' '}
            </>
          )}
          The page’s link keeps what’s open, so you can share a country or a story.
        </p>
      </div>
    </PanelShell>
  );
}
