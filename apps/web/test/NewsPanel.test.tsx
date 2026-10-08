// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { COUNTRIES, REGIONS, type CountryFile } from '@news-globe/shared';
import { NewsPanel } from '../src/components/NewsPanel';
import type { AsyncState } from '../src/hooks/useAsync';
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
    onOpenCountry: vi.fn(),
    onSelectRegion: vi.fn(),
  };
  const all: Props = {
    country: FR,
    regions: [],
    state: { status: 'loading' },
    now: NOW,
    isMobile: false,
    ...handlers,
    ...props,
  };
  const view = render(<NewsPanel {...all} />);
  return { ...handlers, rerender: (p: Partial<Props>) => view.rerender(<NewsPanel {...all} {...p} />) };
}

const ready = (data: CountryFile): AsyncState<CountryFile> => ({ status: 'ready', data });
const headlines = () => screen.queryAllByRole('link').filter((a) => a.classList.contains('story-title')).map((a) => a.textContent);

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

  it('keeps showing the previous data for the same view while it refreshes', () => {
    const previous = countryFile([cluster(article({ title: 'Earlier' }))]);
    renderPanel({ state: { status: 'loading', previous } });
    expect(headlines()).toEqual(['Earlier']);
  });

  it('does not show another view’s data while the new one loads', () => {
    const previous = countryFile([cluster(article({ title: 'National' }))]);
    renderPanel({ region: BRE, state: { status: 'loading', previous } });
    expect(headlines()).toEqual([]);
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

  it('opens other countries from a story', async () => {
    const { onOpenCountry } = renderPanel({ state: ready(countryFile([cluster(article(), [], { alsoIn: [{ code: 'DE', clusterId: 'x' }] })])) });
    await userEvent.click(screen.getByRole('button', { name: 'Germany' }));
    expect(onOpenCountry).toHaveBeenCalledWith('DE');
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
      expect(await screen.findByText(/can’t translate headlines on-device/)).toBeTruthy();
      expect(screen.queryByText('Translating headlines on this device…')).toBeNull();
    });

    it('explains the fallback right away without the Translator API', () => {
      translator.available = false;
      localStorage.setItem('news-globe:language', 'en');
      renderPanel({ state: foreign() });
      expect(screen.getByText(/can’t translate headlines on-device/)).toBeTruthy();
    });
  });
});
