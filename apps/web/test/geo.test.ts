import { describe, expect, it } from 'vitest';
import { middleOf } from '../src/lib/geo';

describe('middleOf', () => {
  it('aims between countries close enough to show together', () => {
    const { lat, lng } = middleOf(['FR', 'DE'])!;
    expect(lat).toBeCloseTo(49, 0);
    expect(lng).toBeCloseTo(6.2, 0);
    // France and the United States: over the Atlantic.
    expect(middleOf(['FR', 'US'])!.lng).toBeCloseTo(-52, 0);
  });

  it('aims at the best-covered country when the countries are spread around the globe', () => {
    // Almost antipodes: between them is anywhere.
    expect(middleOf(['ES', 'NZ'])).toEqual({ lat: 40.2, lng: -3.7 });
    // Their middle would be in the Pacific, France out of view.
    expect(middleOf(['FR', 'US', 'AU', 'JP'])).toEqual({ lat: 46.6, lng: 2.4 });
  });

  it('skips unknown countries, and has nowhere to aim without a known one', () => {
    expect(middleOf(['XX', 'ES', 'NZ'])).toEqual({ lat: 40.2, lng: -3.7 });
    expect(middleOf(['XX'])).toBeNull();
    expect(middleOf([])).toBeNull();
  });
});
