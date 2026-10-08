/**
 * How big a place's top story is, as one of five steps: the number of outlets
 * that covered it in the last 24 h, with 5 or more in the top step.
 */
export const HEAT_STEPS = ['≤1', '2', '3', '4', '5+'] as const;

/**
 * Countries on the globe, from the usual blue to near-white. Most countries' top story has
 * one outlet (about 3 in 4 on a real run), so the first step stays close to the old flat blue
 * and only the busier ones light up.
 */
export const COUNTRY_HEAT = ['#2f86d6', '#52b2ff', '#8ccdff', '#bfe4ff', '#eef8ff'] as const;

/** Regions of the open country, in the selection's amber. */
export const REGION_HEAT = ['#d98f2e', '#ffb547', '#ffcb7d', '#ffdfad', '#fff3de'] as const;

/** Step (0–4) for an outlet count. A missing count (an older index) gets the first step, so the globe is evenly blue. */
export function heatStep(outlets: number | undefined): number {
  if (outlets === undefined) return 0;
  return Math.min(Math.max(Math.floor(outlets), 1), 5) - 1;
}

/** The globe's other shading: how many of a place's top 5 stories are new or rising this hour. */
export const CHANGE_STEPS = ['0', '1', '2', '3', '4+'] as const;

/** Step (0–4) for a change count. */
export const changeStep = (count: number) => Math.min(Math.max(Math.floor(count), 0), 4);
