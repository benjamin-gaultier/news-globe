import { expect, test, type Page } from '@playwright/test';
import { serveData, topTitle } from './data';

/** The globe's on-screen centre: where the camera points after it flies to a place. */
async function globeCenter(page: Page) {
  const box = (await page.locator('.globe canvas').boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

const tooltip = (page: Page) => page.locator('.globe-tip');
const briefing = (page: Page) => page.getByRole('heading', { level: 2, name: 'World' });

/** Hover the globe's centre until globe.gl reports a shape there (it hit-tests once per frame). */
async function hoverCenter(page: Page) {
  const { x, y } = await globeCenter(page);
  await page.mouse.move(x - 2, y - 2);
  await page.mouse.move(x, y);
  await expect(tooltip(page)).toBeVisible();
}

/** Wait for the camera to fly to `name`: until it is under the globe's centre, then for the flight (1 s) to end. */
async function arriveAt(page: Page, name: string) {
  await expect(async () => {
    await hoverCenter(page);
    await expect(tooltip(page)).toContainText(name, { timeout: 100 });
  }).toPass({ timeout: 15_000 });
  await page.waitForTimeout(1_000);
}

/** Open a country by its link, let the camera arrive, then close it and the briefing it returns to: the globe stays over it. */
async function centerOn(page: Page, hash: string, name: string) {
  await page.goto(`/${hash}`);
  await expect(page.getByRole('heading', { name })).toBeVisible();
  await arriveAt(page, name);
  await page.keyboard.press('Escape');
  await expect(briefing(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.panel')).toHaveCount(0);
  await page.waitForTimeout(1_000); // zoom out while the globe re-fills the width
}

test.describe('world briefing', () => {
  test('opens first, with the top stories worldwide and their countries; old Today and Across borders links open it too', async ({
    page,
  }) => {
    await serveData(page, { countries: { FR: 5, DE: 2, US: 3 }, world: [['DE', 'FR']] });
    await page.goto('/');
    await expect(briefing(page)).toBeVisible();
    const top = page.getByRole('region', { name: 'Top stories' }).getByRole('listitem');
    // France's story runs in Germany too: one line, both countries, the outlets added up.
    await expect(top).toHaveCount(2);
    await expect(top.nth(0)).toContainText(topTitle('DE'));
    await expect(top.nth(0)).toContainText('7 outlets in 2 countries');
    await expect(top.nth(0).getByRole('button', { name: 'France', exact: true })).toBeVisible();
    await expect(top.nth(0).getByRole('button', { name: 'Germany', exact: true })).toBeVisible();
    await expect(top.nth(1)).toContainText(topTitle('US'));
    await expect(page.locator('.hint')).toHaveCount(0);

    // A story's country opens its page there.
    await top.nth(0).getByRole('button', { name: 'France', exact: true }).click();
    await expect(page.getByRole('heading', { level: 2, name: topTitle('FR') })).toBeVisible();
    await expect(page).toHaveURL(/#FR\/FR$/);

    for (const hash of ['#today', '#world']) {
      await page.goto(`/${hash}`);
      await expect(briefing(page)).toBeVisible();
      await expect(page).toHaveURL(/\/$/);
    }
  });

  test('turns the globe to a story’s countries while it is pointed at', async ({ page }) => {
    await serveData(page, { countries: { FR: 5, US: 3 } });
    await page.goto('/');
    await expect(briefing(page)).toBeVisible();
    await page.waitForTimeout(2_000); // globe load

    for (const [code, name] of [
      ['US', 'United States'],
      ['FR', 'France'],
    ] as const) {
      await page.getByRole('button', { name: topTitle(code) }).hover();
      await page.waitForTimeout(1_500); // the turn waits a moment, then takes a second
      await hoverCenter(page);
      await expect(tooltip(page)).toContainText(name);
    }
  });
});

test.describe('globe', () => {
  test('describes a country on hover, with its top story and coverage', async ({ page }) => {
    await serveData(page, { countries: { FR: 5, US: 1 } });
    await centerOn(page, '#FR', 'France');

    await hoverCenter(page);
    await expect(tooltip(page)).toContainText('France');
    await expect(tooltip(page)).toContainText(topTitle('FR'));
    await expect(tooltip(page)).toContainText('5 outlets on this story · Tap for top headlines');
    await expect(page.locator('.globe')).toHaveCSS('cursor', 'pointer');
  });

  test('pulses a country whose #1 story is new this hour, and says so', async ({ page }) => {
    await serveData(page, { countries: { FR: 5, US: 1 }, pulses: ['FR'] });
    await centerOn(page, '#FR', 'France');
    await expect(page.getByText('New or rising #1 story')).toBeVisible();

    await hoverCenter(page);
    await expect(tooltip(page)).toContainText('New #1 this hour');
  });

  test('opens a country’s headlines when it is clicked', async ({ page }) => {
    await serveData(page, { countries: { FR: 1, US: 1 } });
    await centerOn(page, '#FR', 'France');

    const { x, y } = await globeCenter(page);
    await page.mouse.click(x, y);

    await expect(page.getByRole('heading', { name: 'France' })).toBeVisible();
    await expect(page.getByRole('link', { name: topTitle('FR') })).toBeVisible();
    await expect(page).toHaveURL(/#FR$/);
  });

  test('flies to a country picked from the list and opens its regions from the globe', async ({ page }) => {
    await serveData(page, { countries: { FR: 1, US: 2 }, regions: ['US-KS'] });
    await page.goto('/');
    await page.getByRole('navigation', { name: 'Countries' }).getByRole('button', { name: 'United States' }).click();
    await expect(page.getByRole('heading', { name: 'United States' })).toBeVisible();

    // The camera flies to the middle of the country: Kansas, whose outline has loaded.
    await arriveAt(page, 'Kansas');
    await expect(tooltip(page)).toContainText('Tap for regional headlines');

    const { x, y } = await globeCenter(page);
    await page.mouse.click(x, y);
    await expect(page.getByRole('heading', { name: 'Kansas' })).toBeVisible();
    await expect(page.getByRole('link', { name: topTitle('US-KS') })).toBeVisible();
    await expect(page).toHaveURL(/#US-KS$/);
  });

  test('says a region without headlines is coming soon', async ({ page }) => {
    // France has regional headlines, but only for Corsica: the mainland regions are outlines only.
    await serveData(page, { countries: { FR: 1 }, regions: ['FR-20R'] });
    await page.goto('/#FR');
    await expect(page.getByRole('heading', { name: 'France' })).toBeVisible();

    // A shared link flies the camera to the country too (the middle of France is Centre-Val de Loire).
    await arriveAt(page, 'Centre-Val de Loire');
    await expect(tooltip(page)).toContainText('Coming soon');
    await expect(tooltip(page)).not.toContainText(topTitle('FR'));

    const { x, y } = await globeCenter(page);
    await page.mouse.click(x, y);
    await expect(page.getByRole('status')).toHaveText(/ — coming soon$/);
    await expect(page.getByRole('heading', { name: 'France' })).toBeVisible();
    await expect(page).toHaveURL(/#FR$/);
  });
});
