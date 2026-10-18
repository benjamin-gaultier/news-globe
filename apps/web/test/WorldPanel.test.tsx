// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SCHEMA_VERSION, type TodayFile, type TodayStory, type WorldStory } from '@news-globe/shared';
import { WorldPanel } from '../src/components/WorldPanel';
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
  top: [item('FR', 'Budget passes', { outlets: 6 }), item('US', 'Senate vote', { outlets: 1 })],
  rising: [item('DE', 'Storm warning', { state: 'rising', rank: 2 })],
  lasting: [item('JP', 'Election day', { rank: 3 })],
  countries: 175,
  stories: 2547,
};

const nato: WorldStory = {
  id: 'w1',
  names: ['nato'],
  countries: [
    { code: 'FR', clusterId: 'c1', title: 'L’OTAN se réunit', url: 'https://fr.example/otan', outletCount24h: 3, language: 'fr' },
    { code: 'US', clusterId: 'c2', title: 'NATO meets', url: 'https://us.example/nato', outletCount24h: 2, language: 'en' },
  ],
  latestPublishedAt: minutesAgo(30),
};

function renderWorld({ body = file, world = [nato] }: { body?: TodayFile | null; world?: WorldStory[] } = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => (body ? new Response(JSON.stringify(body)) : new Response('Not found', { status: 404 }))),
  );
  const handlers = { onClose: vi.fn(), onSheetChange: vi.fn(), onOpenStory: vi.fn(), onHighlight: vi.fn() };
  const view = render(<WorldPanel world={world} refreshKey={0} now={NOW} isMobile={false} {...handlers} />);
  return { ...handlers, ...view };
}

/** Each line of a section: its headline and the countries' chips. */
const lines = (section: HTMLElement) =>
  within(section)
    .getAllByRole('listitem')
    .map((li) => ({
      title: li.querySelector('.brief-open')!.textContent,
      countries: [...li.querySelectorAll('.story-also .chip')].map((c) => c.textContent),
    }));

beforeEach(resetTranslator);
afterEach(() => vi.unstubAllGlobals());

describe('WorldPanel', () => {
  it('lists the top stories worldwide in one list, each with its countries, then rising and lasting ones', async () => {
    renderWorld();
    expect(screen.getByRole('heading', { level: 2, name: 'World' })).toBeTruthy();
    const top = await screen.findByRole('region', { name: 'Top stories' });
    // A national story and a cross-border one, most outlets first; the cross-border story leads with its English headline.
    expect(lines(top)).toEqual([
      { title: 'Budget passes', countries: ['France'] },
      { title: 'NATO meets', countries: ['France', 'United States'] },
      { title: 'Senate vote', countries: ['United States'] },
    ]);
    expect(within(top).getByText('6 outlets · Le Monde')).toBeTruthy();
    expect(within(top).getByText('5 outlets in 2 countries')).toBeTruthy();
    expect(screen.getByText('175 countries · 2,547 stories · updated 20 minutes ago')).toBeTruthy();

    const rising = screen.getByRole('region', { name: 'Rising this hour' });
    expect(within(rising).getByText('↑ Rising')).toBeTruthy();
    expect(within(rising).getByText('#2 · 4 outlets · Le Monde')).toBeTruthy();
    expect(lines(rising)).toEqual([{ title: 'Storm warning', countries: ['Germany'] }]);

    expect(lines(screen.getByRole('region', { name: 'On top all day' }))).toEqual([{ title: 'Election day', countries: ['Japan'] }]);
  });

  it('shows a national story that crosses borders once, as its cross-border story', async () => {
    const shared = item('US', 'NATO meets', { clusterId: 'c2', outlets: 2, state: 'new', imageUrl: 'https://us.example/nato.jpg' });
    renderWorld({ body: { ...file, top: [shared], rising: [shared], lasting: [] } });
    const top = await screen.findByRole('region', { name: 'Top stories' });
    expect(lines(top)).toEqual([{ title: 'NATO meets', countries: ['France', 'United States'] }]);
    // It takes the national story's badge and image.
    expect(within(top).getByText('New')).toBeTruthy();
    expect(top.querySelector('img')!.getAttribute('src')).toBe('https://us.example/nato.jpg');
    // Nor is it repeated under Rising.
    expect(screen.queryByRole('region', { name: 'Rising this hour' })).toBeNull();
  });

  it('opens a story’s page from its headline, in that headline’s country, or in any of its countries', async () => {
    const { onOpenStory } = renderWorld();
    const top = await screen.findByRole('region', { name: 'Top stories' });
    await userEvent.click(within(top).getByRole('button', { name: 'Budget passes' }));
    expect(onOpenStory).toHaveBeenLastCalledWith('FR', 'FR-Budget passes');
    await userEvent.click(within(top).getByRole('button', { name: 'NATO meets' }));
    expect(onOpenStory).toHaveBeenLastCalledWith('US', 'c2');
    const nato = within(top).getByRole('button', { name: 'NATO meets' }).closest('li')!;
    await userEvent.click(within(nato).getByRole('button', { name: 'France' }));
    expect(onOpenStory).toHaveBeenLastCalledWith('FR', 'c1');
  });

  it('lights a story’s countries while it is pointed at or focused, and none once closed', async () => {
    const { onHighlight, unmount } = renderWorld();
    const top = await screen.findByRole('region', { name: 'Top stories' });
    const nato = within(top).getByRole('button', { name: 'NATO meets' }).closest('li')!;
    fireEvent.mouseEnter(nato);
    expect(onHighlight).toHaveBeenLastCalledWith(['FR', 'US']);
    fireEvent.mouseLeave(nato);
    expect(onHighlight).toHaveBeenLastCalledWith(null);

    within(top).getByRole('button', { name: 'Senate vote' }).focus();
    expect(onHighlight).toHaveBeenLastCalledWith(['US']);
    onHighlight.mockClear();
    unmount();
    expect(onHighlight).toHaveBeenCalledWith(null);
  });

  it('translates the best-covered headline when no country is English-speaking', async () => {
    const story: WorldStory = {
      ...nato,
      countries: [
        { ...nato.countries[0]!, code: 'DE', title: 'Warner Bros kauft Paramount', language: 'de' },
        { ...nato.countries[0]!, title: 'Warner Bros rachète Paramount' },
      ],
    };
    renderWorld({ body: { ...file, top: [] }, world: [story] });
    expect(await screen.findByRole('button', { name: '[en] Warner Bros kauft Paramount' })).toBeTruthy();
  });

  it('offers Google Translate for headlines it can’t translate on the device', async () => {
    translator.available = false;
    renderWorld({ body: { ...file, top: [item('FR', 'Le budget adopté', { language: 'fr' }), item('US', 'Senate vote')] }, world: [] });
    const link = await screen.findByRole('link', { name: 'Translate “Le budget adopté” with Google Translate' });
    expect(link.getAttribute('href')).toContain('sl=fr');
    // English headlines need none.
    expect(screen.getAllByRole('link', { name: /Google Translate/ })).toHaveLength(1);
  });

  it('shows the workflow’s English on any device, without a Translate link', async () => {
    translator.available = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ ...file, top: [item('FR', 'Le budget adopté', { language: 'fr' })] }))),
    );
    render(
      <TranslationsContext.Provider value={new Map([['Le budget adopté', 'Budget passed']])}>
        <WorldPanel
          world={[]}
          refreshKey={0}
          now={NOW}
          isMobile={false}
          onClose={vi.fn()}
          onSheetChange={vi.fn()}
          onOpenStory={vi.fn()}
          onHighlight={vi.fn()}
        />
      </TranslationsContext.Provider>,
    );
    const title = await screen.findByText('Budget passed');
    expect(title.getAttribute('lang')).toBe('en');
    expect(title.getAttribute('title')).toBe('Le budget adopté');
    expect(screen.queryByRole('link', { name: /Google Translate/ })).toBeNull();
  });

  it('lists the cross-border stories before the workflow has written Today’s file', async () => {
    renderWorld({ body: null });
    const top = await screen.findByRole('region', { name: 'Top stories' });
    expect(lines(top)).toEqual([{ title: 'NATO meets', countries: ['France', 'United States'] }]);
    expect(screen.getByText('The top stories worldwide right now')).toBeTruthy();
  });

  it('says so when it has no stories yet', async () => {
    renderWorld({ body: null, world: [] });
    await waitFor(() => expect(screen.getByText(/Today’s stories aren’t available yet/)).toBeTruthy());
  });
});
