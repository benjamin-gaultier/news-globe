// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SCHEMA_VERSION, type TodayFile, type TodayStory, type WorldStory } from '@news-globe/shared';
import { TodayPanel } from '../src/components/TodayPanel';
import { TranslationsContext } from '../src/lib/translations';
import { minutesAgo, NOW } from './fixtures';
import { resetTranslator, translator } from './translate-mock';

vi.mock('../src/lib/translate', () => import('./translate-mock').then((m) => m.translateModule));

const item = (unit: string, title: string, extra: Partial<TodayStory> = {}): TodayStory => ({
  unit,
  clusterId: `${unit}-${title}`,
  title,
  url: `https://example.com/${title}`,
  source: 'Le Monde',
  language: 'en',
  imageUrl: null,
  outlets: 4,
  rank: 1,
  firstSeen: minutesAgo(600),
  state: null,
  ...extra,
});

const file: TodayFile = {
  schemaVersion: SCHEMA_VERSION,
  runAt: minutesAgo(20),
  top: [item('FR', 'Budget passes'), item('US', 'Senate vote', { outlets: 1 })],
  rising: [item('DE', 'Storm warning', { state: 'rising', rank: 2 })],
  lasting: [item('JP', 'Election day', { rank: 3 })],
  countries: 175,
  stories: 2547,
};

const world: WorldStory[] = [
  {
    id: 'w1',
    names: ['nato'],
    countries: [
      { code: 'FR', clusterId: 'c1', title: 'L’OTAN se réunit', url: 'https://fr.example/otan', outletCount24h: 3, language: 'fr' },
      { code: 'US', clusterId: 'c2', title: 'NATO meets', url: 'https://us.example/nato', outletCount24h: 2, language: 'en' },
    ],
    latestPublishedAt: minutesAgo(30),
  },
];

function renderToday(body: TodayFile | null = file) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => (body ? new Response(JSON.stringify(body)) : new Response('Not found', { status: 404 }))),
  );
  const handlers = { onClose: vi.fn(), onSheetChange: vi.fn(), onOpenStory: vi.fn(), onOpenWorld: vi.fn() };
  render(<TodayPanel world={world} now={NOW} isMobile={false} {...handlers} />);
  return handlers;
}

beforeEach(resetTranslator);
afterEach(() => vi.unstubAllGlobals());

describe('TodayPanel', () => {
  it('shows the most covered, rising, cross-border and lasting stories', async () => {
    renderToday();
    const top = await screen.findByRole('region', { name: 'Most covered' });
    expect(within(top).getAllByRole('button').map((b) => b.querySelector('.today-title')!.textContent)).toEqual([
      'Budget passes',
      'Senate vote',
    ]);
    expect(within(top).getByText('1 outlet · Le Monde')).toBeTruthy();
    expect(screen.getByText('175 countries · 2,547 stories · updated 20 minutes ago')).toBeTruthy();

    const rising = screen.getByRole('region', { name: 'Rising this hour' });
    expect(within(rising).getByText('↑ Rising')).toBeTruthy();
    expect(within(rising).getByText('#2 · 4 outlets · Le Monde')).toBeTruthy();

    // A cross-border story leads with its English headline.
    const across = screen.getByRole('region', { name: 'Across borders' });
    expect(within(across).getByText('NATO meets')).toBeTruthy();
    expect(within(across).getByText('France · United States')).toBeTruthy();

    expect(within(screen.getByRole('region', { name: 'On top all day' })).getByText('Election day')).toBeTruthy();
  });

  it('opens a story’s page in its country', async () => {
    const { onOpenStory } = renderToday();
    await userEvent.click(await screen.findByRole('button', { name: /Budget passes/ }));
    expect(onOpenStory).toHaveBeenCalledWith('FR', 'FR-Budget passes');
    await userEvent.click(screen.getByRole('button', { name: /NATO meets/ }));
    expect(onOpenStory).toHaveBeenCalledWith('US', 'c2');
  });

  it('offers Google Translate for headlines it can’t translate on the device', async () => {
    translator.available = false;
    renderToday({ ...file, top: [item('FR', 'Le budget adopté', { language: 'fr' }), item('US', 'Senate vote')] });
    const link = await screen.findByRole('link', { name: 'Translate “Le budget adopté” with Google Translate' });
    expect(link.getAttribute('href')).toContain('sl=fr');
    // English headlines need none.
    expect(screen.getAllByRole('link', { name: /Google Translate/ })).toHaveLength(1);
  });

  it('shows the workflow’s English on any device, without a Translate link', async () => {
    translator.available = false;
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ...file, top: [item('FR', 'Le budget adopté', { language: 'fr' })] }))));
    render(
      <TranslationsContext.Provider value={new Map([['Le budget adopté', 'Budget passed']])}>
        <TodayPanel world={[]} now={NOW} isMobile={false} onClose={vi.fn()} onSheetChange={vi.fn()} onOpenStory={vi.fn()} onOpenWorld={vi.fn()} />
      </TranslationsContext.Provider>,
    );
    const title = await screen.findByText('Budget passed');
    expect(title.getAttribute('lang')).toBe('en');
    expect(title.getAttribute('title')).toBe('Le budget adopté');
    expect(screen.queryByRole('link', { name: /Google Translate/ })).toBeNull();
  });

  it('says so before the workflow has written the file', async () => {
    renderToday(null);
    await waitFor(() => expect(screen.getByText(/Today’s overview isn’t available yet/)).toBeTruthy());
  });
});
