// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HeatLegend } from '../src/components/HeatLegend';
import { COUNTRY_HEAT, HEAT_STEPS } from '../src/lib/heat';

describe('HeatLegend', () => {
  it('keys each heat step to its globe colour', () => {
    render(<HeatLegend />);
    expect(screen.getByRole('figure', { name: /Shading/ })).toBeTruthy();
    const steps = screen.getAllByRole('listitem');
    expect(steps.map((li) => li.textContent)).toEqual([...HEAT_STEPS]);
    // jsdom normalises colours to rgb(); compare through a probe element.
    const probe = document.createElement('span');
    expect(steps.map((li) => (li.querySelector('.swatch') as HTMLElement).style.background)).toEqual(
      COUNTRY_HEAT.map((c) => ((probe.style.background = c), probe.style.background)),
    );
  });
});
