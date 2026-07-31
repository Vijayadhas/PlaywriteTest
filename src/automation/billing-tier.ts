import { expect, type Page } from '@playwright/test';
import { waitForBlockingOverlay } from '../core/waits';

export class BillingTier {
  constructor(private readonly page: Page) {}
  async run(): Promise<void> {
    const bom = this.page.getByRole('link', { name: 'BOM', exact: true }).filter({ visible: true }).first();
    await expect(bom).toBeVisible({ timeout: 60_000 }); await bom.click(); await waitForBlockingOverlay(this.page);
    const setup = this.page.getByText('Billing Tier Setup', { exact: false }).filter({ visible: true }).first()
      .or(this.page.locator('#obw_billingtier_bot').filter({ visible: true })).first();
    await expect(setup).toBeVisible({ timeout: 60_000 }); await setup.click();
    const ok = this.page.getByRole('button', { name: 'OK', exact: true }).filter({ visible: true }).first();
    if (await ok.isVisible({ timeout: 10_000 }).catch(() => false)) await ok.click();
    await waitForBlockingOverlay(this.page);
  }
}
