import { expect, type Page } from '@playwright/test';
import { waitForBlockingOverlay } from '../core/waits';

export interface SaveOutcome { ucid: string; status: string; }

export class SaveFlow {
  constructor(private readonly page: Page) {}

  async save(): Promise<SaveOutcome> {
    await waitForBlockingOverlay(this.page);
    await this.page.locator('#save_icon').click();
    await this.page.getByText('Save OCA Config', { exact: false }).filter({ visible: true }).first().click();
    const dialog = this.page.locator('.ui-dialog, [role="dialog"]').filter({ visible: true, hasText: /Save|CLIC Status|Acknowledge/i }).last();
    await expect(dialog).toBeVisible({ timeout: 60_000 });
    const save = dialog.locator('#save_btn').or(dialog.getByRole('button', { name: 'Save', exact: true })).filter({ visible: true }).last();
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await this.acknowledge(dialog);
      await save.click({ force: true });
      await Promise.race([
        dialog.waitFor({ state: 'hidden', timeout: 60_000 }).catch(() => undefined),
        this.page.getByText(/\(OCA\) has encountered a problem/).waitFor({ state: 'visible', timeout: 60_000 }).catch(() => undefined),
      ]);
      if (await this.page.getByText(/\(OCA\) has encountered a problem/).isVisible({ timeout: 500 }).catch(() => false)) {
        throw new Error('OCA reported an application error after Save');
      }
      if (!(await dialog.isVisible({ timeout: 1_000 }).catch(() => false))) {
        await waitForBlockingOverlay(this.page);
        return { ucid: await this.readUcid(), status: 'Saved' };
      }
    }
    throw new Error('Save dialog remained open after acknowledgement and save retries');
  }

  private async acknowledge(dialog: ReturnType<Page['locator']>): Promise<void> {
    const ack = dialog.locator('#ack_flag, input[type="checkbox"]').filter({ visible: true }).first();
    if (await ack.isVisible({ timeout: 1_000 }).catch(() => false) && !(await ack.isChecked().catch(() => false))) {
      await ack.check({ force: true }).catch(async () => dialog.locator('#ack_checkbox, label[for="ack_flag"]').first().click({ force: true }));
    }
    const clic = dialog.locator('#clicStatus').filter({ visible: true });
    if (await clic.isVisible({ timeout: 500 }).catch(() => false)) console.log('[INFO] CLIC Status:', (await clic.innerText()).trim());
  }

  private async readUcid(): Promise<string> {
    const body = (await this.page.locator('body').innerText()).replace(/\s+/g, ' ');
    return body.match(/\bUCID\s*[:#-]?\s*([A-Za-z0-9_-]{4,})/i)?.[1] ?? '';
  }
}
