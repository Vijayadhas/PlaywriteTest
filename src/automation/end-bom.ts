import { type Page } from '@playwright/test';
import { readBomUcid } from '../core/excel';
import { waitForBlockingOverlay } from '../core/waits';

export interface EndBomOutcome { status: string; endBomId: string; }

export class EndBom {
  constructor(private readonly page: Page) {}
  async generateAndAssociate(): Promise<EndBomOutcome> {
    await this.page.getByText('End BOM', { exact: true }).filter({ visible: true }).first().click(); await waitForBlockingOverlay(this.page);
    await this.page.getByRole('button', { name: 'Auto-generate', exact: false }).click(); await waitForBlockingOverlay(this.page);
    await this.page.getByRole('button', { name: 'Generate End BOM', exact: false }).click(); await waitForBlockingOverlay(this.page);
    const endBomId = await readBomUcid(this.page, 'End BOM UCID');
    if (!endBomId) throw new Error('End BOM generated but its UCID was not visible');
    await this.page.getByRole('button', { name: 'Associate End BOM', exact: false }).click(); await waitForBlockingOverlay(this.page);
    await this.page.getByRole('button', { name: 'Done', exact: true }).click(); await waitForBlockingOverlay(this.page);
    return { status: 'Generated and associated', endBomId };
  }
}
