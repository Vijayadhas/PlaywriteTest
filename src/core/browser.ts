import { type BrowserContext, type PlaywrightWorkerArgs } from '@playwright/test';
import { env } from '../config/env';

export async function launchOcaContext(playwright: PlaywrightWorkerArgs['playwright']): Promise<BrowserContext> {
  console.log('[INFO] Launching headed Chromium with persistent profile:', env.chromeProfileDir);
  const context = await playwright.chromium.launchPersistentContext(env.chromeProfileDir, {
    headless: false,
    viewport: { width: 1920, height: 1080 },
    ignoreHTTPSErrors: true,
    args: [
      '--ignore-certificate-errors',
      '--allow-running-insecure-content',
      '--disable-web-security',
      '--disable-notifications',
      '--no-first-run',
      '--no-default-browser-check',
      '--auto-select-certificate-for-urls=["https://ngc-itg-oca-internal.its.hpecorp.net:443","https://hpe-itg.mtls.oktapreview.com:443"]',
    ],
  });
  return context;
}
