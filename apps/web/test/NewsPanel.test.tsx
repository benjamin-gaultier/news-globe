// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { COUNTRIES, REGIONS, type CountryFile } from '@news-globe/shared';
import { NewsPanel } from '../src/components/NewsPanel';
import type { AsyncState } from '../src/hooks/useAsync';
import { SOURCES_URL } from '../src/lib/links';
import { article, cluster, countryFile, NOW } from './fixtures';
import { resetTranslator, translateModule, translator } from './translate-mock';

vi.mock('../src/lib/translate', () => import('./translate-mock').then((m) => m.translateModule));

beforeEach(resetTranslator);

const FR = COUNTRIES.FR!;
const BRE = REGIONS['FR-BRE']!;
const NAQ = REGIONS['FR-NAQ']!;

type Props = Parameters<typeof NewsPanel>[0];

function renderPanel(props: Partial<Props> = {}) {
  const handlers = {
    onClose: vi.fn(),
    onRetry: vi.fn(),
    onSheetChange: vi.fn(),
    onOpenStory: vi.fn(),
    onOpenStoryIn: vi.fn(),
    onToast: vi.fn(),
    onSelectRegion: vi.fn(),
  };
  const all: Props = {
    country: FR,
    regions: [],
    state: { status: 'loading' },
    now: NOW,
    isMobile: false,
    story: null,
    world: [],
    ...handlers,
    ...props,
  };
  const view = render(<NewsPanel {...all} />);
  return { ...handlers, rerender: (p: Partial<Props>) => view.rerender(<NewsPanel {...all} {...p} />) };
}

const ready = (data: CountryFile): AsyncState<CountryFile> => ({ status: 'ready', data });
const headlines = () =>
  screen
    .queryAllByRole('link')
    .filter((a) => a.classList.contains('story-title'))
    .map((a) => a.textContent);

describe('NewsPanel', () => {
  it('shows a placeholder while the first load is in flight', () => {
    renderPanel();
    expect(screen.getByRole('heading', { name: 'France' })).toBeTruthy();
    expect(screen.getByText('Top national headlines')).toBeTruthy();
    expect(document.querySelectorAll('.skeleton')).toHaveLength(6);
  });

  it('lists the stories in order with when the file was updated', () => {
    renderPanel({ state: ready(countryFile([cluster(article({ title: 'One' })), cluster(article({ title: 'Two' }))])) });
    expect(headlines()).toEqual(['One', 'Two']);
    expect(screen.getByText(/Top national headlines/).textContent).toBe('Top national headlines · updated 10 minutes ago');
  });

  it('names the outlets its headlines come from, with a link to every source, under the list only', () => {
    const lemonde = { id: 'lemonde', name: 'Le Monde' };
    const first = article({ source: { id: 'liberation', name: 'Libération' } });
    const file = countryFile([
      cluster(first, [article({ source: lemonde })]),
      cluster(article({ source: { id: 'figaro', name: 'Le Figaro' } })),
      cluster(article({ source: lemonde })),
    ]);
    const { rerender } = renderPanel({ state: ready(file) });
    const line = screen.getByText(/^Headlines from/);
    expect(line.textContent).toBe('Headlines from Le Figaro, Le Monde, Libération · All sources ↗');
    expect(within(line).getByRole('link', { name: 'All sources ↗' }).getAttribute('href')).toBe(SOURCES_URL);

    rerender({ state: ready(file), story: first.id });
    expect(screen.queryByText(/^Headlines from/)).toBeNull();
  });

  it('keeps showing the previous data for the same view while it refreshes', () => {
    const previous = countryFile([cluster(article({ title: 'Earlier' }))]);
    renderPanel({ state: { status: 'loading', previous } });
    expect(headlines()).toEqual(['Earlier']);
  });

  it('keeps showing the previous data when a refresh fails', () => {
    const previous = countryFile([cluster(article({ title: 'Earlier' }))]);
    renderPanel({ state: { status: 'error', error: 'HTTP 503', previous } });
    expect(headlines()).toEqual(['Earlier']);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('does not show another view’s data while the new one loads', () => {
    const previous = countryFile([cluster(article({ title: 'National' }))]);
    renderPanel({ region: BRE, state: { status: 'loading', previous } });
    expect(headlines()).toEqual([]);
    expect(document.querySelectorAll('.skeleton')).toHaveLength(6);
  });

  it('does not show the previous country’s file, still marked ready, right after a switch', () => {
    // For one render after picking another country, the loader still holds France's file as 'ready'.
    const france = countryFile([cluster(article({ title: 'National' }))]);
    renderPanel({ country: COUNTRIES.US!, state: ready(france) });
    expect(headlines()).toEqual([]);
    expect(screen.queryByText(/updated/)).toBeNull();
    expect(document.querySelectorAll('.skeleton')).toHaveLength(6);
  });

  it('says when there are no headlines', () => {
    renderPanel({ state: ready(countryFile([])) });
    expect(screen.getByText('No headlines for France right now.')).toBeTruthy();
  });

  it('reports a failed load and retries', async () => {
    const { onRetry } = renderPanel({ state: { status: 'error', error: 'HTTP 503' } });
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Couldn’t load headlines for France.');
    expect(alert.textContent).toContain('HTTP 503');
    await userEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('offers the country’s regions, and a way back from one', async () => {
    const { onSelectRegion, rerender } = renderPanel({ regions: [BRE, NAQ], state: ready(countryFile([])) });
    const picker = screen.getByRole('navigation', { name: 'Regions of France' });
    await userEvent.click(within(picker).getByRole('button', { name: BRE.name }));
    expect(onSelectRegion).toHaveBeenCalledWith('FR-BRE');

    rerender({ region: BRE, state: ready(countryFile([], { regionCode: 'FR-BRE' })) });
    expect(screen.getByRole('heading', { name: BRE.name })).toBeTruthy();
    expect(screen.getByText(/Top regional headlines/)).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: 'Regions of France' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: '‹ France' }));
    expect(onSelectRegion).toHaveBeenLastCalledWith(null);
  });

  it('opens a story’s counterpart in another country', async () => {
    const { onOpenStoryIn } = renderPanel({
      state: ready(countryFile([cluster(article(), [], { alsoIn: [{ code: 'DE', clusterId: 'x' }] })])),
    });
    await userEvent.click(screen.getByRole('button', { name: 'Germany' }));
    expect(onOpenStoryIn).toHaveBeenCalledWith('DE', 'x');
  });

  describe('sections', () => {
    const sport = (clusters = [cluster(article({ title: 'Le PSG s’impose' }))]) => ready(countryFile(clusters, { category: 'sport' }));
    const sections = () => screen.queryByRole('group', { name: 'Section' });

    it('offers Top, Sport and Business only for a place with section files', async () => {
      const { rerender } = renderPanel({ state: ready(countryFile([])) });
      expect(sections()).toBeNull();
      rerender({ categories: ['top'] });
      expect(sections()).toBeNull();

      const onSelectCategory = vi.fn();
      rerender({ categories: ['top', 'sport', 'business'], onSelectCategory });
      const buttons = within(sections()!).getAllByRole('button');
      expect(buttons.map((b) => [b.textContent, b.getAttribute('aria-pressed')])).toEqual([
        ['Top', 'true'],
        ['Sport', 'false'],
        ['Business', 'false'],
      ]);
      await userEvent.click(within(sections()!).getByRole('button', { name: 'Sport' }));
      expect(onSelectCategory).toHaveBeenCalledWith('sport');
      // The open one does nothing.
      await userEvent.click(within(sections()!).getByRole('button', { name: 'Top' }));
      expect(onSelectCategory).toHaveBeenCalledOnce();
    });

    it('lists a section’s stories, saying which section and that trends and History cover top headlines only', () => {
      renderPanel({ state: sport(), category: 'sport', categories: ['top', 'sport'], onSelectCategory: vi.fn() });
      expect(headlines()).toEqual(['Le PSG s’impose']);
      expect(screen.getByText(/National sport headlines/).textContent).toBe('National sport headlines · updated 10 minutes ago');
      expect(within(sections()!).getByRole('button', { name: 'Sport' }).getAttribute('aria-pressed')).toBe('true');
      expect(screen.getByText(/cover top headlines only/)).toBeTruthy();
    });

    it('names the section for a region too', () => {
      renderPanel({
        region: BRE,
        state: ready(countryFile([], { regionCode: 'FR-BRE', category: 'business' })),
        category: 'business',
      });
      expect(screen.getByText('Regional business headlines · updated 10 minutes ago')).toBeTruthy();
      expect(screen.getByText('No business headlines for Brittany right now.')).toBeTruthy();
    });

    it('shows no badges, sparklines, History bar or top-story countries in a section', () => {
      const c = cluster(article({ title: 'Le PSG s’impose' }));
      renderPanel({
        state: sport([c]),
        category: 'sport',
        trends: { [c.id]: { ranks: [4, 1], firstSeen: '2026-10-08T10:00:00Z', state: 'rising' } },
        trendRuns: ['2026-10-08T10:00:00Z', '2026-10-08T11:00:00Z'],
        timeline: <div>Timeline</div>,
      });
      expect(headlines()).toEqual(['Le PSG s’impose']);
      expect(screen.queryByText('↑ Rising')).toBeNull();
      expect(screen.queryByRole('img', { name: /Rank over/ })).toBeNull();
      expect(screen.queryByText('Timeline')).toBeNull();
    });

    it('never shows the top file under a section, nor a section under Top', () => {
      const top = countryFile([cluster(article({ title: 'Le budget' }))]);
      // Right after the switch, the loader still holds the top file, ready, for one render; then it loads.
      const { rerender } = renderPanel({ state: ready(top), category: 'sport' });
      expect(headlines()).toEqual([]);
      expect(document.querySelectorAll('.skeleton')).toHaveLength(6);
      rerender({ state: { status: 'loading', previous: top }, category: 'sport' });
      expect(headlines()).toEqual([]);
      rerender({ state: sport(), category: 'top' });
      expect(headlines()).toEqual([]);
    });

    it('reports a section that fails to load', () => {
      renderPanel({ state: { status: 'error', error: 'HTTP 404' }, category: 'sport' });
      expect(screen.getByRole('alert').textContent).toContain('Couldn’t load sport headlines for France.');
    });

    it('opens a story’s page without its rank or other countries, and says when it has left the section', async () => {
      const c = cluster(article({ title: 'Le PSG s’impose' }), [article({ title: 'Victoire du PSG' })]);
      const world = [
        {
          id: 'w',
          names: ['psg'],
          countries: [
            { code: 'FR', clusterId: c.id, title: 'Le PSG s’impose', url: c.representative.url, outletCount24h: 2 },
            { code: 'US', clusterId: 'us1', title: 'PSG win', url: 'https://us.example/p', outletCount24h: 3, language: 'en' },
          ],
          latestPublishedAt: c.representative.publishedAt,
        },
      ];
      const { rerender, onOpenStory } = renderPanel({
        state: sport([c]),
        category: 'sport',
        categories: ['top', 'sport'],
        onSelectCategory: vi.fn(),
        story: c.id,
        world,
        trends: { [c.id]: { ranks: [4, 1], firstSeen: '2026-10-08T10:00:00Z', state: 'rising' } },
        trendRuns: ['2026-10-08T10:00:00Z', '2026-10-08T11:00:00Z'],
      });
      expect(screen.getByRole('heading', { level: 2, name: 'Le PSG s’impose' })).toBeTruthy();
      expect(screen.getByRole('region', { name: 'Coverage · 2 outlets' })).toBeTruthy();
      expect(screen.queryByRole('region', { name: 'In other countries' })).toBeNull();
      expect(screen.queryByRole('region', { name: 'Rank today' })).toBeNull();
      expect(screen.queryByText(/in France now/)).toBeNull();
      expect(sections()).toBeNull();

      rerender({ story: 'gone123' });
      expect(screen.getByText('This story is no longer among France’s sport stories.')).toBeTruthy();
      await userEvent.click(screen.getByRole('button', { name: 'See today’s sport stories' }));
      expect(onOpenStory).toHaveBeenCalledWith(null);
    });
  });

  describe('story page', () => {
    const one = article({ title: 'Le budget adopté', source: { id: 'lemonde', name: 'Le Monde' }, publishedAt: '2026-10-08T11:00:00Z' });
    const two = article({ title: 'Budget : le vote', source: { id: 'figaro', name: 'Le Figaro' }, publishedAt: '2026-10-08T10:00:00Z' });
    const file = () =>
      countryFile([cluster(article({ title: 'Other story' })), cluster(one, [two], { alsoIn: [{ code: 'US', clusterId: 'us1' }] })]);

    it('opens from a story’s sources button', async () => {
      const { onOpenStory } = renderPanel({ state: ready(file()) });
      await userEvent.click(screen.getByRole('button', { name: '+1 other source' }));
      expect(onOpenStory).toHaveBeenCalledWith(one.id);
    });

    it('shows the story: headline, every outlet earliest first, the same story elsewhere', async () => {
      const world = [
        {
          id: 'w',
          names: ['budget'],
          countries: [
            { code: 'FR', clusterId: one.id, title: 'Le budget adopté', url: one.url, outletCount24h: 2 },
            { code: 'US', clusterId: 'us1', title: 'French budget passes', url: 'https://us.example/b', outletCount24h: 3, language: 'en' },
          ],
          latestPublishedAt: one.publishedAt,
        },
      ];
      const { onOpenStoryIn, onOpenStory } = renderPanel({ state: ready(file()), story: one.id, world });
      expect(screen.getByRole('heading', { level: 2, name: 'Le budget adopté' })).toBeTruthy();
      expect(screen.getByText('Story · Le Monde')).toBeTruthy();
      expect(screen.getByRole('link', { name: 'Read at Le Monde ↗' }).getAttribute('href')).toBe(one.url);
      // No list, no region picker: just the story.
      expect(screen.queryByText('Other story')).toBeNull();

      const coverage = screen.getByRole('region', { name: 'Coverage · 2 outlets' });
      expect([...coverage.querySelectorAll('.story-source')].map((s) => s.textContent)).toEqual(['Le Figaro', 'Le Monde']);
      expect(within(coverage).getByText('First')).toBeTruthy();

      const elsewhere = screen.getByRole('region', { name: 'In other countries' });
      expect(within(elsewhere).getByRole('link', { name: 'French budget passes' }).getAttribute('href')).toBe('https://us.example/b');
      await userEvent.click(within(elsewhere).getByRole('button', { name: 'United States' }));
      expect(onOpenStoryIn).toHaveBeenCalledWith('US', 'us1');

      await userEvent.click(screen.getByRole('button', { name: '‹ France' }));
      expect(onOpenStory).toHaveBeenCalledWith(null);
    });

    it('finds the story by any of its articles, and draws its rank today', () => {
      const runs = ['2026-10-08T09:00:00.000Z', '2026-10-08T10:00:00.000Z', '2026-10-08T11:00:00.000Z'];
      const c = file().clusters[1]!;
      renderPanel({
        state: ready(file()),
        story: two.id,
        trends: { [c.id]: { ranks: [null, 4, 2], firstSeen: runs[1]!, state: 'rising' } },
        trendRuns: runs,
      });
      expect(screen.getByRole('heading', { level: 2, name: 'Le budget adopté' })).toBeTruthy();
      expect(screen.getByText(/#2 in France now/)).toBeTruthy();
      expect(screen.getByText('↑ Rising')).toBeTruthy();
      expect(screen.getByRole('img', { name: /^Rank at each run today: .* not ranked, .* #4, .* #2$/ })).toBeTruthy();
    });

    it('says when the story has left the top stories', async () => {
      const { onOpenStory } = renderPanel({ state: ready(file()), story: 'gone123' });
      expect(screen.getByText('This story is no longer among France’s top stories.')).toBeTruthy();
      await userEvent.click(screen.getByRole('button', { name: 'See today’s top stories' }));
      expect(onOpenStory).toHaveBeenCalledWith(null);
    });

    it('copies the link when the browser has no share sheet', async () => {
      const writeText = vi.fn(async () => {});
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
      const { onToast } = renderPanel({ state: ready(file()), story: one.id });
      await userEvent.click(screen.getByRole('button', { name: 'Share' }));
      expect(writeText).toHaveBeenCalledWith(location.href);
      expect(onToast).toHaveBeenCalledWith('Link copied');
    });
  });

  describe('headline language', () => {
    const foreign = () => ready(countryFile([cluster(article({ title: 'Le budget', language: 'fr' }), [article({ language: 'br' })])]));

    it('has no toggle when every headline is already English', () => {
      renderPanel({ state: ready(countryFile([cluster(article({ language: 'en' }))])) });
      expect(screen.queryByRole('group', { name: 'Headline language' })).toBeNull();
    });

    it('switches to English, remembers the choice and prepares a translator per language', async () => {
      renderPanel({ state: foreign() });
      const group = screen.getByRole('group', { name: 'Headline language' });
      const original = within(group).getByRole('button', { name: 'Original' });
      const english = within(group).getByRole('button', { name: 'English' });
      expect(original.getAttribute('aria-pressed')).toBe('true');

      await userEvent.click(english);

      expect(english.getAttribute('aria-pressed')).toBe('true');
      expect(localStorage.getItem('news-globe:language')).toBe('en');
      expect(translateModule.getTranslator.mock.calls.map(([l]) => l)).toEqual(expect.arrayContaining(['fr', 'br']));
      expect(await screen.findByRole('link', { name: '[en] Le budget' })).toBeTruthy();
      expect(screen.queryByText(/Translating headlines/)).toBeNull();

      await userEvent.click(original);
      expect(localStorage.getItem('news-globe:language')).toBe('original');
      expect(screen.getByRole('link', { name: 'Le budget' })).toBeTruthy();
    });

    it('starts in the language chosen on an earlier visit', async () => {
      localStorage.setItem('news-globe:language', 'en');
      renderPanel({ state: foreign() });
      expect(within(screen.getByRole('group')).getByRole('button', { name: 'English' }).getAttribute('aria-pressed')).toBe('true');
      expect(await screen.findByRole('link', { name: '[en] Le budget' })).toBeTruthy();
    });

    it('says so while translators load, and when the browser can’t translate', async () => {
      let resolve!: (t: object | null) => void;
      translateModule.getTranslator.mockImplementationOnce(() => new Promise((r) => (resolve = r)));
      translator.missing.add('br');
      localStorage.setItem('news-globe:language', 'en');

      renderPanel({ state: foreign() });

      expect(screen.getByText('Translating headlines on this device…')).toBeTruthy();
      resolve({});
      expect(await screen.findByText(/can’t translate on the device/)).toBeTruthy();
      expect(screen.queryByText('Translating headlines on this device…')).toBeNull();
    });

    it('explains the fallback right away without the Translator API', () => {
      translator.available = false;
      localStorage.setItem('news-globe:language', 'en');
      renderPanel({ state: foreign() });
      expect(screen.getByText(/can’t translate on the device/)).toBeTruthy();
    });
  });
});
