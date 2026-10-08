import { expect, test, type Page } from '@playwright/test';
import { serveData } from './data';

const tooltip = (page: Page) => page.locator('.globe-tip');

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
    await page.getByRole('button', { name: 'Close headlines' }).click();
    await expect(page.locator('.panel')).toHaveCount(0);
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
    await page.getByRole('button', { name: 'Close headlines' }).click();
    await expect(page.locator('.panel')).toHaveCount(0);
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

    // Lifting the first finger used to spin the globe to the South Pole, when the tap
    // clean-up's far-off pointer move reached the controls. After a small zoom the United
    // States is still in view (find throws if it is not).
    await find(page, 'United States', canvas.y + canvas.height);
  });
});
