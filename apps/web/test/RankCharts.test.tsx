// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RankChart, RankSparkline } from '../src/components/RankCharts';

const runs = ['2026-10-08T08:00:00Z', '2026-10-08T09:00:00Z', '2026-10-08T10:00:00Z', '2026-10-08T11:00:00Z'];

describe('RankSparkline', () => {
  it('draws a line per unbroken stretch and a dot for a lone ranked run', () => {
    const { container } = render(<RankSparkline ranks={[3, 2, null, 1]} />);
    expect(container.querySelectorAll('polyline')).toHaveLength(1);
    expect(container.querySelectorAll('.rank-dot')).toHaveLength(1);
    expect(container.querySelectorAll('.rank-now')).toHaveLength(1);
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe("Rank over today's runs: #3, #2, unranked, #1");
  });

  it('draws nothing with fewer than two ranks', () => {
    const { container } = render(<RankSparkline ranks={[null, 4, null]} />);
    expect(container.firstChild).toBeNull();
  });

  it('marks no current rank when the story dropped out', () => {
    const { container } = render(<RankSparkline ranks={[1, 2, null]} />);
    expect(container.querySelector('.rank-now')).toBeNull();
  });
});

describe('RankChart', () => {
  it('labels the gridlines down to the worst rank shown', () => {
    render(<RankChart ranks={[1, 2, 2, 1]} runs={runs} />);
    // At least #5 deep, so a story that stays near the top doesn't look like it swings wildly.
    expect(screen.getByText('#5')).toBeTruthy();
    expect(screen.getByText('#1')).toBeTruthy();
  });

  it('draws nothing when the run times don’t match the ranks', () => {
    const { container } = render(<RankChart ranks={[1, 2]} runs={runs} />);
    expect(container.firstChild).toBeNull();
  });
});
