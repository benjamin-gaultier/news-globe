// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoryCluster } from '@news-globe/shared';
import { StoryItem } from '../src/components/StoryItem';
import { article, cluster, minutesAgo, NOW } from './fixtures';
import { resetTranslator, translator } from './translate-mock';

vi.mock('../src/lib/translate', () => import('./translate-mock').then((m) => m.translateModule));

beforeEach(resetTranslator);

function renderStory(c: StoryCluster, english = false) {
  const onOpenCountry = vi.fn();
  render(
    <ul>
      <StoryItem cluster={c} now={NOW} english={english} onOpenCountry={onOpenCountry} />
    </ul>,
  );
  return { onOpenCountry, item: screen.getAllByRole('listitem')[0]! };
}

describe('StoryItem', () => {
  it('links the headline to the publisher in a new tab, with outlet, time and snippet', () => {
    const rep = article({ title: 'Le budget adopté', description: 'Les députés ont voté.', publishedAt: minutesAgo(120) });
    renderStory(cluster(rep));

    const link = screen.getByRole('link', { name: 'Le budget adopté' });
    expect(link.getAttribute('href')).toBe(rep.url);
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link.getAttribute('lang')).toBe('fr');
    expect(screen.getByText('Le Monde')).toBeTruthy();
    expect(screen.getByText('2 hours ago').getAttribute('datetime')).toBe(rep.publishedAt);
    expect(screen.getByText('Les députés ont voté.').getAttribute('lang')).toBe('fr');
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('link', { name: /Read in English/ })).toBeNull();
  });

  it('shows the image until it fails to load', () => {
    const { item } = renderStory(cluster(article({ imageUrl: 'https://img.example/a.jpg' })));
    const img = item.querySelector('img')!;
    expect(img.getAttribute('src')).toBe('https://img.example/a.jpg');
    expect(img.getAttribute('referrerpolicy')).toBe('no-referrer');
    fireEvent.error(img);
    expect(item.querySelector('img')).toBeNull();
  });

  it('expands and collapses the other outlets covering the story', async () => {
    const related = [
      article({ source: { id: 'figaro', name: 'Le Figaro' }, title: 'Budget : le vote', publishedAt: minutesAgo(30) }),
      article({ source: { id: 'liberation', name: 'Libération' }, title: 'Le budget passe' }),
    ];
    renderStory(cluster(article(), related));

    const toggle = screen.getByRole('button', { name: '+2 other sources' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('Le Figaro')).toBeNull();

    await userEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.textContent).toContain('Hide other sources');
    const list = document.getElementById(toggle.getAttribute('aria-controls')!)!;
    expect(within(list).getByText('Le Figaro')).toBeTruthy();
    expect(within(list).getByRole('link', { name: 'Budget : le vote' }).getAttribute('href')).toBe(related[0]!.url);
    expect(within(list).getByText('· 30 minutes ago')).toBeTruthy();

    await userEvent.click(toggle);
    expect(screen.queryByText('Le Figaro')).toBeNull();
  });

  it('says "source" for a single other outlet', () => {
    renderStory(cluster(article(), [article()]));
    expect(screen.getByRole('button', { name: '+1 other source' })).toBeTruthy();
  });

  it('links to the same story in other countries, skipping unknown codes', async () => {
    const { onOpenCountry } = renderStory(
      cluster(article(), [], { alsoIn: [{ code: 'DE', clusterId: 'x' }, { code: 'ZZ', clusterId: 'y' }, { code: 'CL', clusterId: 'z' }] }),
    );
    expect(screen.getByText('Also in')).toBeTruthy();
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Germany', 'Chile']);
    await userEvent.click(screen.getByRole('button', { name: 'Chile' }));
    expect(onOpenCountry).toHaveBeenCalledWith('CL');
  });

  it('in English, shows translated text with the original as a tooltip and a translated-page link', async () => {
    const rep = article({ title: 'Le budget adopté', description: 'Les députés ont voté.' });
    renderStory(cluster(rep), true);

    const link = await screen.findByRole('link', { name: '[en] Le budget adopté' });
    expect(link.getAttribute('href')).toBe(rep.url);
    expect(link.getAttribute('lang')).toBe('en');
    expect(link.getAttribute('title')).toBe('Le budget adopté');
    expect((await screen.findByText('[en] Les députés ont voté.')).getAttribute('lang')).toBe('en');
    expect(screen.getByRole('link', { name: 'Read in English ↗' }).getAttribute('href')).toContain('sl=fr');
  });

  it('keeps the original when no translator is available', async () => {
    translator.missing.add('fr');
    renderStory(cluster(article({ title: 'Le budget adopté' })), true);
    await Promise.resolve();
    const link = screen.getByRole('link', { name: 'Le budget adopté' });
    expect(link.getAttribute('title')).toBeNull();
    // The publisher's page can still be read through the web translator.
    expect(screen.getByRole('link', { name: 'Read in English ↗' })).toBeTruthy();
  });

  it('never offers to translate English', () => {
    renderStory(cluster(article({ language: 'en', title: 'Budget passes' })), true);
    expect(screen.getByRole('link', { name: 'Budget passes' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Read in English/ })).toBeNull();
  });
});
