import { expect, type Locator, type Page } from '@playwright/test';
import { waitBeforeAction, waitForBlockingOverlay } from './waits';

export async function safeClick(locator: Locator) {
  const page = locator.page();
  await waitBeforeAction(page);
  await waitForBlockingOverlay(page);
  await locator.waitFor({ state: 'visible', timeout: 60_000 });
  await expect(locator).toBeEnabled({ timeout: 60_000 });
  await locator.scrollIntoViewIfNeeded();
  await locator.click().catch(async () => {
    await locator.evaluate((element) => (element as HTMLElement).click());
  });
  await waitForBlockingOverlay(page);
}

export async function clickByText(page: Page, text: RegExp) {
  await waitBeforeAction(page);
  await waitForBlockingOverlay(page);
  const locator = page.getByText(text).filter({ visible: true }).first();
  await locator.waitFor({ state: 'visible' });
  await locator.scrollIntoViewIfNeeded();
  await locator.click().catch(async (error) => {
    console.log('[INFO] Regular click was blocked, waiting for overlay and retrying:', String(error).split('\n')[0]);
    await waitForBlockingOverlay(page);
    await locator.click();
  });
  await waitForBlockingOverlay(page);
}

export async function clickVisibleText(page: Page, text: RegExp) {
  await waitForBlockingOverlay(page);
  const locator = page.getByText(text).filter({ visible: true }).first();
  await locator.waitFor({ state: 'visible', timeout: 60_000 });
  await locator.scrollIntoViewIfNeeded();
  await locator.click().catch(async () => {
    await locator.evaluate((element) => (element as HTMLElement).click());
  });
  await waitForBlockingOverlay(page);
}
