// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SCHEMA_VERSION, type SearchFile } from '@news-globe/shared';
import { SearchPanel } from '../src/components/SearchPanel';
import { foldForSearch, indexSearch, placeName, searchHeadlines } from '../src/lib/search';

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

  it('caps the results but reports the full count', () => {
    const { groups, total } = searchHeadlines(index, 'e', 2);
    expect(total).toBe(5);
    expect(groups.flatMap((g) => g.hits)).toHaveLength(2);
  });
});

describe('SearchPanel', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(file))));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('searches as you type and opens a result', async () => {
    const onOpenStory = vi.fn();
    render(<SearchPanel isMobile={false} onClose={vi.fn()} onSheetChange={vi.fn()} onOpenStory={onOpenStory} />);
    const box = screen.getByRole('searchbox', { name: /Search every country/ });
    expect(document.activeElement).toBe(box);
    await screen.findByText('Searches the current headlines of every country and region.');

    fireEvent.change(box, { target: { value: 'senat' } });
    const france = await screen.findByRole('region', { name: 'France' });
    fireEvent.click(within(france).getByRole('button', { name: /Le Sénat adopte le budget/ }));
    expect(onOpenStory).toHaveBeenCalledWith('FR', 'Le Sénat adopte le budget');

    fireEvent.change(box, { target: { value: 'xyzzy' } });
    expect(screen.getByText('No current headline matches “xyzzy”.')).toBeTruthy();
  });

  it('says so before the workflow has written the index', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Not found', { status: 404 })));
    render(<SearchPanel isMobile={false} onClose={vi.fn()} onSheetChange={vi.fn()} onOpenStory={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Search isn’t available yet.')).toBeTruthy());
  });
});
