// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HeatLegend } from '../src/components/HeatLegend';
import { CHANGE_STEPS, COUNTRY_HEAT, HEAT_STEPS } from '../src/lib/heat';

describe('HeatLegend', () => {
  it('keys each heat step to its globe colour', () => {
    render(<HeatLegend />);
    expect(screen.getByRole('figure', { name: /Shading/ })).toBeTruthy();
    const steps = screen.getAllByRole('listitem');
    expect(steps.map((li) => li.textContent)).toEqual([...HEAT_STEPS]);
    // jsdom normalises colours to rgb(); compare through a probe element.
    const probe = document.createElement('span');
    expect(steps.map((li) => (li.querySelector('.swatch') as HTMLElement).style.background)).toEqual(
      COUNTRY_HEAT.map((c) => {
        probe.style.background = c;
        return probe.style.background;
      }),
    );
  });
});

describe('HeatLegend shading switch', () => {
  it('switches the key between coverage and change', async () => {
    const { fireEvent } = await import('@testing-library/react');
    const onShadingChange = vi.fn();
    const { rerender } = render(<HeatLegend shading="coverage" onShadingChange={onShadingChange} />);
    expect(screen.getByRole('button', { name: 'Coverage' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    expect(onShadingChange).toHaveBeenCalledWith('change');

    rerender(<HeatLegend shading="change" onShadingChange={onShadingChange} />);
    expect(screen.getByText('New or rising in the top 5')).toBeTruthy();
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual([...CHANGE_STEPS]);
  });

  it('has no switch without a handler', () => {
    render(<HeatLegend />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
