import { expect, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { safeClick } from '../core/interactions';
import { escapeRegex, waitForBlockingOverlay } from '../core/waits';

export class ModelSearch {
  constructor(private readonly context: BrowserContext) {}

  async searchAndOpen(page: Page, modelNumber: string): Promise<Page> {
    const search = page.getByRole('textbox', { name: /Search to open UCID or create|Search config/i })
      .or(page.locator('#search-config')).first();
    await expect(search).toBeVisible({ timeout: 60_000 });
    await search.fill(modelNumber);
    const option = page.locator('ul.ui-autocomplete:not([style*="display: none"]) li.ui-menu-item, [role="option"]')
      .filter({ hasText: new RegExp(`\\b${escapeRegex(modelNumber)}\\b`, 'i') }).filter({ visible: true }).first();
    await safeClick(option);
    await page.locator('#dqe_cards_container').waitFor({ state: 'visible', timeout: 60_000 });
    const card = await this.findExactCard(page, modelNumber);
    await expect(card, `Exact CTO card for ${modelNumber} should be visible`).toBeVisible({ timeout: 60_000 });
    const cardText = (await card.innerText()).replace(/\s+/g, ' ');
    if (!new RegExp(`\\b${escapeRegex(modelNumber)}\\b`, 'i').test(cardText) || !/CTO/i.test(cardText)) {
      throw new Error(`Search result did not resolve to exact CTO model ${modelNumber}`);
    }
    const popup = this.context.waitForEvent('page', { timeout: 15_000 }).catch(() => null);
    const customize = card.getByRole('button', { name: /Customize|Build|Configure/i })
      .or(card.locator('button.dqe-customize-btn, .dqe-customize-btn')).filter({ visible: true }).first();
    await safeClick(customize);
    const configPage = (await popup) ?? page;
    await configPage.waitForLoadState('domcontentloaded').catch(() => undefined);
    await waitForBlockingOverlay(configPage);
    return configPage;
  }

  private async findExactCard(page: Page, modelNumber: string): Promise<Locator> {
    const cards = page.locator('#dqe_cards_container').locator('div').filter({ visible: true });
    const exact = cards.filter({ hasText: new RegExp(`\\b${escapeRegex(modelNumber)}\\b[\\s\\S]*\\bCTO\\b`, 'i') }).first();
    if (await exact.isVisible({ timeout: 5_000 }).catch(() => false)) return exact;
    return cards.filter({ hasText: modelNumber }).filter({ hasText: /CTO/i }).first();
  }
}
