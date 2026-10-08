import { describe, expect, it } from 'vitest';
import { COUNTRY_HEAT, HEAT_STEPS, heatStep, REGION_HEAT } from '../src/lib/heat';

describe('heatStep', () => {
  it('maps outlet counts to the five steps, 5+ in the top one', () => {
    expect([0, 1, 2, 3, 4, 5, 9].map(heatStep)).toEqual([0, 0, 1, 2, 3, 4, 4]);
  });

  it('puts an index without counts in the first step', () => {
    expect(heatStep(undefined)).toBe(0);
  });

  it('has a colour for every step', () => {
    expect(COUNTRY_HEAT).toHaveLength(HEAT_STEPS.length);
    expect(REGION_HEAT).toHaveLength(HEAT_STEPS.length);
  });
});
