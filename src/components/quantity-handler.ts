import { expect, type Locator, type Page } from '@playwright/test';
import { escapeRegex, waitForBlockingOverlay } from '../core/waits';

export class QuantityHandler {
  constructor(private readonly page: Page) {}

  async set(row: Locator, productNumber: string, quantity: number): Promise<void> {
    await row.scrollIntoViewIfNeeded();
    const radio = row.locator('input[type="radio"]').filter({ visible: true }).first();
    if (await radio.isVisible({ timeout: 1_000 }).catch(() => false)) {
      if (!(await radio.isChecked().catch(() => false))) await radio.check({ force: true });
    }
    if ((await this.read(row)) !== String(quantity)) await this.write(row, quantity);
    await waitForBlockingOverlay(this.page);
    let stable = 0;
    await expect.poll(async () => {
      stable = (await this.read(row)) === String(quantity) ? stable + 1 : 0;
      return stable;
    }, { timeout: 90_000, intervals: [750, 1000, 1500], message: `${productNumber} quantity must remain ${quantity}` })
      .toBeGreaterThanOrEqual(3);
  }

  async verify(row: Locator, productNumber: string, quantity: number): Promise<void> {
    await expect.poll(() => this.read(row), { timeout: 30_000, message: `${productNumber} committed quantity` }).toBe(String(quantity));
  }

  private async write(row: Locator, quantity: number): Promise<void> {
    const value = String(quantity);
    const select = row.locator('select').filter({ visible: true }).first();
    if (await select.isVisible({ timeout: 1_000 }).catch(() => false)) {
      const option = select.locator('option').filter({ hasText: new RegExp(`^\\s*${escapeRegex(value)}\\s*$`) }).first();
      if (!(await option.count())) throw new Error(`Quantity option ${value} is unavailable`);
      await select.selectOption(await option.getAttribute('value') ?? value);
      return;
    }
    const input = row.locator('input[type="number"], input[type="text"]').filter({ visible: true }).first();
    if (await input.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await input.fill(value); await input.press('Tab'); return;
    }
    const target = row.locator('.item_qty_div, td.item_qty, [class*="qty"]').filter({ visible: true }).first();
    await target.click({ force: true });
    const menuOption = this.page.locator(`[role="option"][data-value="${value}"], .selecter-item[data-value="${value}"], li`)
      .filter({ visible: true, hasText: new RegExp(`^\\s*${escapeRegex(value)}\\s*$`) }).first();
    await menuOption.click({ force: true });
  }

  private async read(row: Locator): Promise<string> {
    const select = row.locator('select').filter({ visible: true }).first();
    if (await select.isVisible({ timeout: 500 }).catch(() => false)) return (await select.inputValue()).trim();
    const input = row.locator('input[type="number"], input[type="text"]').filter({ visible: true }).first();
    if (await input.isVisible({ timeout: 500 }).catch(() => false)) return (await input.inputValue()).trim();
    return ((await row.locator('.item_qty_div, .item_qty').filter({ visible: true }).first().textContent().catch(() => '')) ?? '').trim();
  }
}
