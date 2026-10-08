// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ArchiveStory } from '@news-globe/shared';
import { clock, dayLabel, HistoryBar, type HistoryBarProps } from '../src/components/HistoryBar';
import { HistoryPanel, type HistoryPanelProps } from '../src/components/HistoryPanel';

const RUNS = ['2026-10-07T08:00:00.000Z', '2026-10-07T09:00:00.000Z', '2026-10-07T10:00:00.000Z'];

function renderBar(props: Partial<HistoryBarProps> = {}) {
  const handlers = { onShiftDay: vi.fn(), onRun: vi.fn(), onLive: vi.fn() };
  render(<HistoryBar date="2026-10-07" runs={RUNS} runAt={RUNS[1]!} status="ready" canGoForward {...handlers} {...props} />);
  return handlers;
}

describe('HistoryBar', () => {
  it('formats a UTC day whatever the viewer’s time zone', () => {
    expect(dayLabel('2026-10-07')).toBe(
      new Date(Date.UTC(2026, 9, 7, 12)).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }),
    );
  });

  it('steps through the day’s runs with a slider', () => {
    const { onRun } = renderBar();
    const slider = screen.getByRole('slider');
    expect(slider.getAttribute('max')).toBe('2');
    expect((slider as HTMLInputElement).value).toBe('1');
    expect(slider.getAttribute('aria-valuetext')).toBe(clock(RUNS[1]!));
    expect(screen.getByText(dayLabel('2026-10-07'))).toBeTruthy();

    fireEvent.change(slider, { target: { value: '2' } });
    expect(onRun).toHaveBeenCalledWith(RUNS[2]);
  });

  it('starts the slider at the first run when none is picked yet', () => {
    renderBar({ runAt: null });
    expect((screen.getByRole('slider') as HTMLInputElement).value).toBe('0');
    expect(screen.getByRole('slider').getAttribute('aria-valuetext')).toBeNull();
  });

  it('moves between days, but not past today, and goes back to live', async () => {
    const { onShiftDay, onLive } = renderBar({ canGoForward: false });
    await userEvent.click(screen.getByRole('button', { name: 'Previous day' }));
    expect(onShiftDay).toHaveBeenCalledWith(-1);
    expect((screen.getByRole('button', { name: 'Next day' }) as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Live' }));
    expect(onLive).toHaveBeenCalledOnce();
  });

  it('moves forward a day when it can', async () => {
    const { onShiftDay } = renderBar();
    await userEvent.click(screen.getByRole('button', { name: 'Next day' }));
    expect(onShiftDay).toHaveBeenCalledWith(1);
  });

  it.each([
    ['loading', 'Loading…'],
    ['error', 'Couldn’t load this day'],
    ['empty', 'No history for this day'],
  ] as const)('shows %s instead of a slider', (status, note) => {
    renderBar({ status, runs: [] });
    expect(screen.queryByRole('slider')).toBeNull();
    expect(screen.getByText(note)).toBeTruthy();
  });
});

const archived = (title: string, extra: Partial<ArchiveStory> = {}): ArchiveStory => ({
  unit: 'FR',
  title,
  url: `https://example.com/${encodeURIComponent(title)}`,
  sources: ['lemonde', 'figaro'],
  articleIds: [title],
  firstSeen: RUNS[0]!,
  lastSeen: RUNS[2]!,
  bestRank: 1,
  peakOutlets: 2,
  ...extra,
});

function renderHistoryPanel(props: Partial<HistoryPanelProps> = {}) {
  const onClose = vi.fn();
  render(
    <HistoryPanel
      unit={{ code: 'FR', name: 'France' }}
      stories={[]}
      date="2026-10-07"
      runAt={RUNS[1]!}
      isMobile={false}
      onClose={onClose}
      onSheetChange={vi.fn()}
      {...props}
    />,
  );
  return { onClose };
}

describe('HistoryPanel', () => {
  it('lists the stories ranked at that run', () => {
    renderHistoryPanel({ stories: [archived('Budget adopté'), archived('Grève SNCF', { sources: ['lemonde'], bestRank: 3 })] });
    expect(screen.getByText(`Top stories at ${clock(RUNS[1]!)} · ${dayLabel('2026-10-07')}`)).toBeTruthy();
    const link = screen.getByRole('link', { name: 'Budget adopté' });
    expect(link.getAttribute('href')).toBe('https://example.com/Budget%20adopt%C3%A9');
    expect(link.getAttribute('target')).toBe('_blank');
    const metas = [...document.querySelectorAll('.story-meta')].map((m) => m.textContent);
    expect(metas).toEqual([
      `2 outlets · in the top list ${clock(RUNS[0]!)}–${clock(RUNS[2]!)} · best #1`,
      `1 outlet · in the top list ${clock(RUNS[0]!)}–${clock(RUNS[2]!)} · best #3`,
    ]);
  });

  it('says when the unit had nothing at that time', () => {
    renderHistoryPanel();
    expect(screen.getByText('No headlines for France at this time.')).toBeTruthy();
  });

  it('shows a crumb back to the country for a region', async () => {
    const onBackToCountry = vi.fn();
    renderHistoryPanel({ unit: { code: 'FR-BRE', name: 'Brittany' }, countryName: 'France', onBackToCountry });
    expect(screen.getByRole('heading', { name: 'Brittany' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: '‹ France' }));
    expect(onBackToCountry).toHaveBeenCalledOnce();
  });
});
