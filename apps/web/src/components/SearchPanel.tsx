import { useEffect, useMemo, useRef, useState } from 'react';
import { useAsync } from '../hooks/useAsync';
import { fetchSearch } from '../lib/data';
import { indexSearch, searchHeadlines } from '../lib/search';
import { PanelShell } from './PanelShell';

export interface SearchPanelProps {
  isMobile: boolean;
  onClose: () => void;
  onSheetChange: (fraction: number) => void;
  /** Opens a result's country or region panel on that story. */
  onOpenStory: (unit: string, title: string) => void;
}

/** Searches every current headline (search.json, loaded when the panel opens). */
export function SearchPanel({ isMobile, onClose, onSheetChange, onOpenStory }: SearchPanelProps) {
  const [query, setQuery] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const file = useAsync((signal) => fetchSearch(signal), []);
  const index = useMemo(() => (file.status === 'ready' && file.data ? indexSearch(file.data) : null), [file]);
  const results = useMemo(() => (index ? searchHeadlines(index, query) : { groups: [], total: 0 }), [index, query]);

  useEffect(() => {
    input.current?.focus();
  }, []);

  const heading = (
    <>
      <h2 id="panel-title">Search headlines</h2>
      <input
        ref={input}
        className="search-input"
        type="search"
        placeholder="A name, a place, a topic…"
        aria-label="Search every country’s current headlines"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
    </>
  );

  let body;
  if (file.status === 'error') body = <p className="panel-message">Couldn’t load the headlines to search.</p>;
  else if (file.status === 'ready' && !file.data) body = <p className="panel-message">Search isn’t available yet.</p>;
  else if (!index) body = <p className="panel-message">Loading…</p>;
  else if (!query.trim()) body = <p className="panel-note">Searches the current headlines of every country and region.</p>;
  else if (!results.total) body = <p className="panel-message">No current headline matches “{query.trim()}”.</p>;
  else
    body = (
      <>
        <p className="panel-note" aria-live="polite">
          {results.total} headline{results.total === 1 ? '' : 's'}
          {results.total > 60 ? ', most widely covered first' : ''}
        </p>
        {results.groups.map((g) => (
          <section key={g.unit} className="search-group" aria-label={g.place}>
            <h3 className="search-place">{g.place}</h3>
            <ul>
              {g.hits.map((h) => (
                <li key={h.title}>
                  <button type="button" className="search-hit" onClick={() => onOpenStory(h.unit, h.title)} dir="auto">
                    {h.title}
                    {h.outlets > 1 && <span className="related-time"> · {h.outlets} outlets</span>}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </>
    );

  return (
    <PanelShell heading={heading} sheetKey="search" scrollKey={query} isMobile={isMobile} onClose={onClose} onSheetChange={onSheetChange}>
      {body}
    </PanelShell>
  );
}
