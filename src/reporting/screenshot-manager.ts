import fs from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';

const safeName = (value: string) => value.replace(/[^A-Za-z0-9_.-]+/g, '_');

export class ScreenshotManager {
  private readonly directory: string;
  constructor(outputDirectory: string) {
    this.directory = path.join(outputDirectory, 'screenshots');
    fs.mkdirSync(this.directory, { recursive: true });
  }
  async capture(page: Page, jobId: string): Promise<string> {
    const file = path.resolve(this.directory, `${safeName(jobId)}-${Date.now()}.png`);
    await page.screenshot({ path: file, fullPage: true }).catch(() => undefined);
    return fs.existsSync(file) ? file : '';
  }
}
