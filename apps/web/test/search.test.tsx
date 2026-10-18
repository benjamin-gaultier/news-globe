// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SCHEMA_VERSION, type SearchFile } from '@news-globe/shared';
import { SearchPanel } from '../src/components/SearchPanel';
import { foldForSearch, indexSearch, placeName, searchHeadlines, searchPlaces } from '../src/lib/search';

const file: SearchFile = {
  schemaVersion: SCHEMA_VERSION,
  runAt: '2026-10-08T10:00:00.000Z',
  items: [
    ['FR', 'Le Sénat adopte le budget', 4],
    ['FR', 'Grève à la SNCF', 2],
    ['FR-BRE', 'Rennes : le budget du métro', 1],
    ['US', 'Senate passes the budget bill', 6],
    ['DE', 'Bundestag debattiert', 1],
  ],
};

describe('search', () => {
  const index = indexSearch(file);

  it('folds accents and case', () => {
    expect(foldForSearch('Sénat ÉTÉ')).toBe('senat ete');
  });

  it('names regions with their country', () => {
    expect(placeName('FR-BRE')).toBe('Brittany, France');
    expect(placeName('US')).toBe('United States');
  });

  it('matches every word, in the headline or the place name, most covered first', () => {
    const { groups, total } = searchHeadlines(index, 'budget');
    expect(total).toBe(3);
    expect(groups.map((g) => [g.unit, g.hits.map((h) => h.title)])).toEqual([
      ['US', ['Senate passes the budget bill']],
      ['FR', ['Le Sénat adopte le budget']],
      ['FR-BRE', ['Rennes : le budget du métro']],
    ]);
    // "senat" is in "Sénat" and in "Senate": both match, accents ignored.
    expect(searchHeadlines(index, 'senat budget').total).toBe(2);
    expect(searchHeadlines(index, 'sénat adopte').total).toBe(1);
    expect(searchHeadlines(index, 'budget brittany').groups.map((g) => g.unit)).toEqual(['FR-BRE']);
    expect(searchHeadlines(index, '   ').total).toBe(0);
  });

  it('finds places with headlines by the start of each word of their name', () => {
    const has = (code: string) => ['FR', 'FR-BRE', 'FR-IDF', 'US', 'US-AR', 'US-KS', 'GB', 'CI', 'DE-BY'].includes(code);
    expect(searchPlaces('uni', has).sort()).toEqual(['GB', 'US']);
    // Accents, case and punctuation don't matter; countries come before regions.
    expect(searchPlaces('ile de france', has)).toEqual(['FR-IDF']);
    expect(searchPlaces('COTE d’IVOIRE', has)).toEqual(['CI']);
    expect(searchPlaces('fr', has)).toEqual(['FR', 'FR-IDF']);
    // Word starts only: "kansas" is not in "Arkansas".
    expect(searchPlaces('kansas', has)).toEqual(['US-KS']);
    // A region's local name.
    expect(searchPlaces('bretagne', has)).toEqual(['FR-BRE']);
    expect(searchPlaces('bayern', has)).toEqual(['DE-BY']);
    // Common short names, and a name that is exactly the query first, then countries before regions.
    const more = (code: string) => has(code) || ['UA', 'AE', 'CG', 'CD', 'GE', 'US-GA'].includes(code);
    expect(searchPlaces('uk', more)).toEqual(['GB', 'UA']);
    expect(searchPlaces('USA', more)).toEqual(['US']);
    expect(searchPlaces('uae', more)).toEqual(['AE']);
    expect(searchPlaces('congo', more)).toEqual(['CG', 'CD']);
    expect(searchPlaces('georgia', more)).toEqual(['GE', 'US-GA']);
    // Only places with headlines.
    expect(searchPlaces('germany', has)).toEqual([]);
    expect(searchPlaces('  ', has)).toEqual([]);
    expect(searchPlaces('a', () => true, 3)).toHaveLength(3);
  });

  it('caps the results but reports the full count', () => {
    const { groups, total } = searchHeadlines(index, 'e', 2);
    expect(total).toBe(5);
    expect(groups.flatMap((g) => g.hits)).toHaveLength(2);
  });
});

describe('SearchPanel', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(file))),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it('shows the results for the query and opens one', async () => {
    const onOpenStory = vi.fn();
    const props = { places: [], isMobile: false, onClose: vi.fn(), onSheetChange: vi.fn(), onOpenStory, onOpenPlace: vi.fn() };
    const { rerender } = render(<SearchPanel query="" {...props} />);
    await screen.findByText('Type a country, a region, a name or a topic.');

    rerender(<SearchPanel query="senat" {...props} />);
    expect(screen.getByText('Places and current headlines matching “senat”')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Places' })).toBeNull();
    const france = await screen.findByRole('region', { name: 'France' });
    fireEvent.click(within(france).getByRole('button', { name: /Le Sénat adopte le budget/ }));
    expect(onOpenStory).toHaveBeenCalledWith('FR', 'Le Sénat adopte le budget');

    rerender(<SearchPanel query="xyzzy" {...props} />);
    expect(screen.getByText('No current headline mentions “xyzzy”.')).toBeTruthy();
  });

  it('lists the places matching by name above the headlines, and opens one', async () => {
    const onOpenPlace = vi.fn();
    render(
      <SearchPanel
        query="bri"
        places={['FR-BRE']}
        isMobile={false}
        onClose={vi.fn()}
        onSheetChange={vi.fn()}
        onOpenStory={vi.fn()}
        onOpenPlace={onOpenPlace}
      />,
    );
    const places = screen.getByRole('region', { name: 'Places' });
    fireEvent.click(within(places).getByRole('button', { name: 'Brittany, France' }));
    expect(onOpenPlace).toHaveBeenCalledWith('FR-BRE');
  });

  it('says so before the workflow has written the index', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('Not found', { status: 404 })),
    );
    render(
      <SearchPanel
        query="budget"
        places={[]}
        isMobile={false}
        onClose={vi.fn()}
        onSheetChange={vi.fn()}
        onOpenStory={vi.fn()}
        onOpenPlace={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText('Search isn’t available yet.')).toBeTruthy());
  });
});
