import { CHANGE_STEPS, COUNTRY_HEAT, HEAT_STEPS } from '../lib/heat';

/** What the globe's shading shows: coverage of the top story, or how much changed this hour. */
export type Shading = 'coverage' | 'change';

const KEYS: Record<Shading, { caption: string; label: string; steps: readonly string[] }> = {
  coverage: {
    caption: 'Outlets on the top story',
    label: 'Shading: outlets covering each country’s top story in the last 24 hours',
    steps: HEAT_STEPS,
  },
  change: {
    caption: 'New or rising in the top 5',
    label: 'Shading: how many of each country’s top 5 stories are new or rising since the previous hour',
    steps: CHANGE_STEPS,
  },
};

/** Key for the globe's shading, with a switch between the two when `onShadingChange` is given, and for its pulses. */
export function HeatLegend({
  shading = 'coverage',
  onShadingChange,
  pulsing = false,
}: {
  shading?: Shading;
  onShadingChange?: (shading: Shading) => void;
  /** Some countries pulse: explain the rings. */
  pulsing?: boolean;
}) {
  const key = KEYS[shading];
  return (
    <figure className="heat-legend" aria-label={key.label}>
      {onShadingChange && (
        <div className="legend-modes" role="group" aria-label="Shade the globe by">
          <button type="button" aria-pressed={shading === 'coverage'} onClick={() => onShadingChange('coverage')}>
            Coverage
          </button>
          <button type="button" aria-pressed={shading === 'change'} onClick={() => onShadingChange('change')}>
            Change
          </button>
        </div>
      )}
      <figcaption>{key.caption}</figcaption>
      <ol>
        {key.steps.map((label, i) => (
          <li key={label}>
            <span className="swatch" style={{ background: COUNTRY_HEAT[i] }} />
            {label}
          </li>
        ))}
      </ol>
      {pulsing && <p className="legend-pulse">New #1 story this hour</p>}
    </figure>
  );
}
