import type { ArchiveStory } from '@news-globe/shared';
import { clock, dayLabel } from './HistoryBar';
import { PanelShell } from './PanelShell';

export interface HistoryPanelProps {
  /** Country or region code and display name. */
  unit: { code: string; name: string };
  /** Crumb back to the country while a region is open. */
  countryName?: string;
  onBackToCountry?: () => void;
  stories: ArchiveStory[];
  date: string;
  runAt: string;
  isMobile: boolean;
  onClose: () => void;
  onSheetChange: (fraction: number) => void;
}

/** A country's or region's ranked stories at one archived run. */
export function HistoryPanel({
  unit,
  countryName,
  onBackToCountry,
  stories,
  date,
  runAt,
  isMobile,
  onClose,
  onSheetChange,
}: HistoryPanelProps) {
  const heading = (
    <>
      {countryName && onBackToCountry && (
        <button type="button" className="crumb" onClick={onBackToCountry}>
          ‹ {countryName}
        </button>
      )}
      <h2 id="panel-title">{unit.name}</h2>
      <p className="panel-sub">
        Top stories at {clock(runAt)} · {dayLabel(date)}
      </p>
    </>
  );
  return (
    <PanelShell
      heading={heading}
      sheetKey={`history:${unit.code}`}
      scrollKey={`${unit.code}@${runAt}`}
      isMobile={isMobile}
      onClose={onClose}
      onSheetChange={onSheetChange}
    >
      {stories.length === 0 ? (
        <div className="panel-message">
          <p>No headlines for {unit.name} at this time.</p>
        </div>
      ) : (
        <ol className="story-list">
          {stories.map((s) => (
            <li key={s.articleIds[0] ?? s.url} className="story">
              <a className="story-title" href={s.url} target="_blank" rel="noopener noreferrer" dir="auto">
                {s.title}
              </a>
              <div className="story-meta">
                {s.sources.length} outlet{s.sources.length === 1 ? '' : 's'}
                <span aria-hidden="true"> · </span>
                in the top list {clock(s.firstSeen)}–{clock(s.lastSeen)}
                <span aria-hidden="true"> · </span>
                best #{s.bestRank}
              </div>
            </li>
          ))}
        </ol>
      )}
      <p className="panel-footnote">
        From the hourly history archive: the headline as last seen that day, linking to the publisher. Times are in your time
        zone.
      </p>
    </PanelShell>
  );
}
