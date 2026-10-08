import { forwardRef } from 'react';

export interface SearchBoxProps {
  query: string;
  onQueryChange: (query: string) => void;
  /** Focus with text in the box: show its results again. */
  onFocus: () => void;
  /** Escape: clear the box and close the results. */
  onClear: () => void;
}

/** The search bar in the top bar: results open in the panel as you type. */
export const SearchBox = forwardRef<HTMLInputElement, SearchBoxProps>(function SearchBox(
  { query, onQueryChange, onFocus, onClear },
  ref,
) {
  return (
    <form className="search-box" role="search" onSubmit={(e) => e.preventDefault()}>
      <svg className="search-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M15.5 15.5L20 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <input
        ref={ref}
        type="search"
        placeholder="Search headlines"
        aria-label="Search every country’s current headlines"
        aria-keyshortcuts="/"
        autoComplete="off"
        enterKeyHint="search"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onFocus={onFocus}
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return;
          // Keep the panel's own Escape (close) from also firing.
          e.stopPropagation();
          e.nativeEvent.stopImmediatePropagation();
          onClear();
          e.currentTarget.blur();
        }}
      />
      <kbd className="search-key" aria-hidden="true">
        /
      </kbd>
    </form>
  );
});
