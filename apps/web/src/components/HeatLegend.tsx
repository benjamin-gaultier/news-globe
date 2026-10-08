import { COUNTRY_HEAT, HEAT_STEPS } from '../lib/heat';

/** Key for the globe's shading: how many outlets cover each country's top story. */
export function HeatLegend() {
  return (
    <figure className="heat-legend" aria-label="Shading: outlets covering each country’s top story in the last 24 hours">
      <figcaption>Outlets on the top story</figcaption>
      <ol>
        {HEAT_STEPS.map((label, i) => (
          <li key={label}>
            <span className="swatch" style={{ background: COUNTRY_HEAT[i] }} />
            {label}
          </li>
        ))}
      </ol>
    </figure>
  );
}
