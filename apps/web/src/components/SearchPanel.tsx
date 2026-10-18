import { type ReactNode, useMemo } from 'react';
import { useAsync } from '../hooks/useAsync';
import { fetchSearch } from '../lib/data';
import { indexSearch, placeName, searchHeadlines } from '../lib/search';
import { plural } from '../lib/text';
import { PanelShell } from './PanelShell';

export interface SearchPanelProps {
  /** What is typed in the top bar's search box. */
  query: string;
  /** Countries and regions matching it by name (searchPlaces), listed above the headlines. */
  places: readonly string[];
  isMobile: boolean;
  onClose: () => void;
  onSheetChange: (fraction: number) => void;
  /** Opens a result's country or region panel on that story. */
  onOpenStory: (unit: string, title: string) => void;
  /** Opens a country or region panel. */
  onOpenPlace: (unit: string) => void;
}

/** Results for the top bar's search box: places by name, then every current headline (search.json, loaded when the panel opens). */
export function SearchPanel({ query, places, isMobile, onClose, onSheetChange, onOpenStory, onOpenPlace }: SearchPanelProps) {
  const file = useAsync((signal) => fetchSearch(signal), []);
  const index = useMemo(() => (file.status === 'ready' && file.data ? indexSearch(file.data) : null), [file]);
  const results = useMemo(() => (index ? searchHeadlines(index, query) : { groups: [], total: 0 }), [index, query]);

  const subtitle = query.trim() ? <>Places and current headlines matching “{query.trim()}”</> : 'Places and current headlines';

  let body: ReactNode;
  if (file.status === 'error') body = <p className="panel-message">Couldn’t load the headlines to search.</p>;
  else if (file.status === 'ready' && !file.data) body = <p className="panel-message">Search isn’t available yet.</p>;
  else if (!index) body = <p className="panel-message">Loading…</p>;
  else if (!query.trim()) body = <p className="panel-note">Type a country, a region, a name or a topic.</p>;
  else if (!results.total) body = <p className="panel-message">No current headline mentions “{query.trim()}”.</p>;
  else
    body = (
      <>
        <p className="panel-note" aria-live="polite">
          {plural(results.total, 'headline')}
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
    <PanelShell
      title="Search results"
      subtitle={subtitle}
      sheetKey="search"
      scrollKey={query}
      isMobile={isMobile}
      onClose={onClose}
      onSheetChange={onSheetChange}
    >
      {places.length > 0 && (
        <section className="search-group" aria-label="Places">
          <h3 className="search-place">Places</h3>
          <ul>
            {places.map((code) => (
              <li key={code}>
                <button type="button" className="search-hit" onClick={() => onOpenPlace(code)}>
                  {placeName(code)}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {body}
    </PanelShell>
  );
}
