import { expect, test, type Page } from '@playwright/test';
import { serveData } from './data';

const tooltip = (page: Page) => page.locator('.globe-tip');

/** Close the open country, then the world briefing it returns to: the bare globe. */
async function closePanels(page: Page) {
  await page.getByRole('button', { name: 'Close headlines' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'World' })).toBeVisible();
  await page.getByRole('button', { name: 'Close headlines' }).click();
  await expect(page.locator('.panel')).toHaveCount(0);
}

/**
 * Where `name` is on screen: scans up the globe's vertical centre line from
 * `bottom`, hovering, and returns the middle of the stretch globe.gl's tooltip
 * names it (away from its borders, as the closed globe slowly rotates).
 */
async function find(page: Page, name: string, bottom: number) {
  const box = (await page.locator('.globe canvas').boundingBox())!;
  const x = box.x + box.width / 2;
  const hits: number[] = [];
  for (let y = bottom - 10; y > box.y; y -= 12) {
    await page.mouse.move(x, y);
    await page.waitForTimeout(60); // a frame or two for the hit test
    const over = (await tooltip(page).count()) > 0 && (await tooltip(page).textContent())?.includes(name);
    if (over) hits.push(y);
    else if (hits.length) break;
  }
  if (!hits.length) throw new Error(`${name} not found on the globe`);
  return { x, y: hits[Math.floor(hits.length / 2)]! };
}

test.describe('globe on a phone', () => {
  // A still globe: scans for a country (find) are slow on CI, and a spinning globe moves it off the scan line.
  test.use({ reducedMotion: 'reduce' });

  test('opens on the world briefing in a low sheet, the globe in view above it', async ({ page }) => {
    await serveData(page, { countries: { US: 3, FR: 1 } });
    await page.goto('/');
    const sheet = page.locator('.panel');
    await expect(sheet.getByRole('heading', { level: 2, name: 'World' })).toBeVisible();
    await expect(sheet.getByRole('region', { name: 'Top stories' }).getByRole('listitem')).toHaveCount(2);
    await page.waitForTimeout(500); // the sheet's slide-in
    const viewport = page.viewportSize()!;
    const { y, height } = (await sheet.boundingBox())!;
    expect(height / viewport.height).toBeCloseTo(0.36, 1);
    expect(y + height).toBeCloseTo(viewport.height, 0);

    // A tap on a story opens its page, and the globe flies to its country above the sheet.
    await sheet.getByRole('button', { name: 'Top story in United States' }).click();
    await expect(sheet.getByRole('heading', { level: 2, name: 'Top story in United States' })).toBeVisible();
    await expect(page).toHaveURL(/#US\/US$/);
    await page.waitForTimeout(2_500); // globe load and camera flight
    const sheetTop = (await sheet.boundingBox())!.y;
    expect((await find(page, 'United States', sheetTop)).y).toBeLessThan(sheetTop);
  });

  test('keeps the open country in view above the bottom sheet', async ({ page }) => {
    await serveData(page, { countries: { US: 1, FR: 1 } });
    await page.goto('/#US');
    const sheet = page.locator('.panel');
    await expect(sheet.getByRole('heading', { name: 'United States' })).toBeVisible();
    await page.waitForTimeout(2_500); // globe load and camera flight

    const sheetTop = (await sheet.boundingBox())!.y;
    const { y } = await find(page, 'United States', sheetTop);
    expect(y).toBeLessThan(sheetTop);
  });

  test('opens a tapped country, without lighting up others as the camera flies', async ({ page }) => {
    await serveData(page, { countries: { US: 1, FR: 1 } });
    await page.goto('/#US');
    await expect(page.getByRole('heading', { name: 'United States' })).toBeVisible();
    await page.waitForTimeout(2_500);
    await closePanels(page);
    await page.waitForTimeout(1_000);

    const canvas = (await page.locator('.globe canvas').boundingBox())!;
    const spot = await find(page, 'United States', canvas.y + canvas.height);
    // Off the globe, so the scan's hover can't pass for one the tap left behind.
    await page.mouse.move(0, 0);
    await page.touchscreen.tap(spot.x, spot.y);

    await expect(page.getByRole('heading', { name: 'United States' })).toBeVisible();
    await expect(page).toHaveURL(/#US$/);
    // The camera flies for a second: nothing passing under the lifted finger lights up.
    for (let i = 0; i < 6; i++) {
      await page.waitForTimeout(200);
      await expect(tooltip(page)).toBeHidden({ timeout: 0 });
    }
  });

  test('stays put when a pinch ends one finger at a time', async ({ page }) => {
    test.setTimeout(60_000); // two scans of the globe
    await serveData(page, { countries: { US: 1, FR: 1 } });
    await page.goto('/#US');
    await expect(page.getByRole('heading', { name: 'United States' })).toBeVisible();
    await page.waitForTimeout(2_500);
    await closePanels(page);
    await page.waitForTimeout(1_000);

    const canvas = (await page.locator('.globe canvas').boundingBox())!;
    const spot = await find(page, 'United States', canvas.y + canvas.height);
    await page.mouse.move(0, 0);

    // Two fingers spread apart around the spot (zoom in), then lift one before the other,
    // as fingers do: real touch events, so the globe's controls see a genuine pinch.
    const cdp = await page.context().newCDPSession(page);
    const fingers = (gap: number) => [
      { x: spot.x - gap, y: spot.y, id: 1 },
      { x: spot.x + gap, y: spot.y, id: 2 },
    ];
    // A small zoom, so the United States stays in view.
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: fingers(30) });
    for (let gap = 31; gap <= 36; gap++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: fingers(gap) });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [fingers(36)[1]!] });
    await page.waitForTimeout(100);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(1_000); // let damping settle

    // The release is not a tap: nothing opens, and the camera doesn't fly off to the
    // country under the fingers (it used to: globe.gl took the pinch's end for a tap).
    await expect(page.locator('.panel')).toHaveCount(0);
    await expect(page).not.toHaveURL(/#[A-Z]/);
    // Lifting the first finger used to spin the globe to the South Pole, when the tap
    // clean-up's far-off pointer move reached the controls. After a small zoom the United
    // States is still in view (find throws if it is not).
    await find(page, 'United States', canvas.y + canvas.height);
  });

  test('opens nothing when a pinch zoom ends over a country', async ({ page }) => {
    test.setTimeout(90_000); // each touch move waits for a (software-rendered) frame
    await serveData(page, { countries: { US: 1, CA: 1, FR: 1 } });
    await page.goto('/');
    await page.getByRole('button', { name: 'Close headlines' }).click(); // the world briefing
    await page.waitForTimeout(4_000); // globe load
    await expect(page.locator('.panel')).toHaveCount(0);

    // A zoom as a thumb and finger make it: diagonal, four times wider, over half a second,
    // above-left of the centre, over North America on the opening view. Both lift together.
    const cdp = await page.context().newCDPSession(page);
    const c = { x: 120, y: 250 };
    const fingers = (gap: number) => [
      { x: c.x - gap * 0.6, y: c.y - gap * 0.8, id: 1 },
      { x: c.x + gap * 0.6, y: c.y + gap * 0.8, id: 2 },
    ];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: fingers(40) });
    for (let i = 1; i <= 60; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: fingers(40 + i * 2) });
      await page.waitForTimeout(16);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(1_000);

    // globe.gl used to take the end of the pinch for a tap, opening the country under the
    // fingers and flying the camera to it: the globe seemed to spin on every zoom.
    await expect(page.locator('.panel')).toHaveCount(0);
    await expect(page).not.toHaveURL(/#[A-Z]/);
  });

  test('opens nothing when a one-finger drag ends over a country', async ({ page }) => {
    test.setTimeout(60_000);
    await serveData(page, { countries: { US: 1, FR: 1 } });
    await page.goto('/#US');
    await expect(page.getByRole('heading', { name: 'United States' })).toBeVisible();
    await page.waitForTimeout(2_500);
    await closePanels(page);
    await page.waitForTimeout(1_000);

    const canvas = (await page.locator('.globe canvas').boundingBox())!;
    const spot = await find(page, 'United States', canvas.y + canvas.height);
    await page.mouse.move(0, 0);

    // A short sideways drag that starts and ends on the United States.
    const cdp = await page.context().newCDPSession(page);
    const at = (dx: number) => [{ x: spot.x + dx, y: spot.y, id: 1 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(-30) });
    for (let dx = -25; dx <= 30; dx += 5) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(dx) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(800);

    await expect(page.locator('.panel')).toHaveCount(0);
    await expect(page).not.toHaveURL(/#[A-Z]/);
  });
});
