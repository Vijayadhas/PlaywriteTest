import { type Page } from '@playwright/test';
import { env } from '../config/env';

export async function waitBeforeAction(page: Page) {
  await page.waitForTimeout(env.actionDelayMs);
}

export async function waitForBlockingOverlay(page: Page) {
  const overlayStartedAt = Date.now();
  await page
    .locator('.blockUI.blockOverlay')
    .waitFor({ state: 'hidden', timeout: 60_000 })
    .catch(() => {
      console.log('[INFO] Blocking overlay did not become hidden within 60 seconds; continuing with visible element checks');
    });
  const overlayElapsed = Date.now() - overlayStartedAt;
  if (overlayElapsed >= 1_000) console.log(`[TIME] Blocking overlay wait: ${(overlayElapsed / 1_000).toFixed(1)} s`);
  await waitForOcaLoading(page);
}

export async function waitForOcaLoading(page: Page) {
  const loadingStartedAt = Date.now();
  await page
    .waitForFunction(
      () =>
        Array.from(document.querySelectorAll<HTMLElement>('.blockUI.blockMsg, .maui-loading-div, .maui-loading-label')).every((element) => {
          const style = window.getComputedStyle(element);
          const container = element.closest<HTMLElement>('.blockUI.blockMsg') ?? element;
          const containerStyle = window.getComputedStyle(container);
          return (
            style.display === 'none' ||
            style.visibility === 'hidden' ||
            containerStyle.display === 'none' ||
            containerStyle.visibility === 'hidden' ||
            Number(containerStyle.opacity || '1') <= 0.01
          );
        }),
      undefined,
      { timeout: 90_000 },
    )
    .catch(() => {
      console.log('[INFO] OCA loading message did not disappear within 90 seconds; continuing');
    });
  const loadingElapsed = Date.now() - loadingStartedAt;
  if (loadingElapsed >= 1_000) console.log(`[TIME] OCA loading-message wait: ${(loadingElapsed / 1_000).toFixed(1)} s`);
}

export function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
