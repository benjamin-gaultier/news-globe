import { clock, dayLabel } from '../lib/time';

export interface HistoryBarProps {
  date: string;
  /** The day's run times, oldest first; empty while loading or when the day has none. */
  runs: string[];
  runAt: string | null;
  status: 'loading' | 'ready' | 'empty' | 'error';
  canGoForward: boolean;
  onShiftDay: (days: number) => void;
  onRun: (runAt: string) => void;
  onLive: () => void;
}

/** Day arrows and a slider over the day's hourly runs: the globe shows the run picked. */
export function HistoryBar({ date, runs, runAt, status, canGoForward, onShiftDay, onRun, onLive }: HistoryBarProps) {
  const index = runAt ? runs.indexOf(runAt) : -1;
  return (
    <div className="history-bar" role="group" aria-label="History">
      <div className="history-day">
        <button type="button" className="icon-btn" onClick={() => onShiftDay(-1)} aria-label="Previous day">
          ‹
        </button>
        <span className="history-date">{dayLabel(date)}</span>
        <button type="button" className="icon-btn" onClick={() => onShiftDay(1)} disabled={!canGoForward} aria-label="Next day">
          ›
        </button>
      </div>
      {status === 'ready' && runs.length > 0 ? (
        <label className="history-time">
          <input
            type="range"
            min={0}
            max={runs.length - 1}
            step={1}
            value={Math.max(index, 0)}
            onChange={(e) => onRun(runs[Number(e.target.value)]!)}
            aria-valuetext={runAt ? clock(runAt) : undefined}
          />
          <span className="history-clock">{runAt ? clock(runAt) : ''}</span>
        </label>
      ) : (
        <span className="history-note">
          {status === 'loading' ? 'Loading…' : status === 'error' ? 'Couldn’t load this day' : 'No history for this day'}
        </span>
      )}
      <button type="button" className="chip chip-small" onClick={onLive}>
        Live
      </button>
    </div>
  );
}

/** The live counterpart, at the top of a live panel: where the timeline appears, and the way in. */
export function LiveBar({ onHistory }: { onHistory: () => void }) {
  return (
    <div className="history-bar history-live" role="group" aria-label="Time">
      <span className="live-label">
        <span className="live-dot" aria-hidden="true" />
        Live
      </span>
      <button type="button" className="tool-btn tool-btn-small" onClick={onHistory}>
        <ClockIcon />
        History
      </button>
    </div>
  );
}

export function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M12 7.5V12l3 2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
