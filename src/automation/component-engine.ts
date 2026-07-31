import { expect, type Locator, type Page } from '@playwright/test';
import type { ComponentInstruction } from '../models/component-instruction';
import { escapeRegex, waitForBlockingOverlay } from '../core/waits';
import { QuantityHandler } from '../components/quantity-handler';
import { RadioHandler } from '../components/radio-handler';
import { ConfigurationHandler } from '../components/configuration-handler';
import { AutomaticDependencyHandler } from '../components/automatic-dependency-handler';

export class UnsupportedComponentError extends Error {
  constructor(message: string) { super(message); this.name = 'UnsupportedComponentError'; }
}

export class ComponentEngine {
  private readonly quantities: QuantityHandler;
  private readonly radios = new RadioHandler();
  private readonly configurations: ConfigurationHandler;
  private readonly dependencies: AutomaticDependencyHandler;

  constructor(private readonly page: Page) {
    this.quantities = new QuantityHandler(page);
    this.configurations = new ConfigurationHandler(page);
    this.dependencies = new AutomaticDependencyHandler(this.quantities);
  }

  async openSection(sectionName: string): Promise<void> {
    await waitForBlockingOverlay(this.page);
    const exact = new RegExp(`^\\s*${escapeRegex(sectionName)}\\s*$`, 'i');
    const section = this.page.locator('[id*="section_header" i], .section_header, button, a')
      .filter({ visible: true, hasText: exact }).first();
    await expect(section, `Section ${sectionName}`).toBeVisible({ timeout: 60_000 });
    await section.scrollIntoViewIfNeeded();
    await section.click({ force: true });
    await waitForBlockingOverlay(this.page);
  }

  async findProductRow(productNumber: string, description?: string): Promise<Locator> {
    const escaped = escapeRegex(productNumber);
    const rows = this.page.locator('tr.item_tr, tr, [role="row"]').filter({ visible: true })
      .filter({ hasText: new RegExp(`\\b${escaped}\\b`, 'i') });
    const scoped = description ? rows.filter({ hasText: description }) : rows;
    const exactRows: Locator[] = [];
    const count = await scoped.count();
    for (let index = 0; index < count; index += 1) {
      const row = scoped.nth(index);
      const visibleText = (await row.innerText()).replace(/\s+/g, ' ').trim();
      if (new RegExp(`(^|\\s)${escaped}(?=\\s|$)`, 'i').test(visibleText)) exactRows.push(row);
    }
    if (exactRows.length !== 1) {
      throw new UnsupportedComponentError(`Expected one visible exact row for ${productNumber}; found ${exactRows.length}`);
    }
    return exactRows[0];
  }

  async selectRadioProduct(productNumber: string, description?: string): Promise<void> {
    await this.radios.select(await this.findProductRow(productNumber, description), productNumber);
    await waitForBlockingOverlay(this.page);
  }

  async setProductQuantity(productNumber: string, quantity: number, description?: string): Promise<void> {
    await this.quantities.set(await this.findProductRow(productNumber, description), productNumber, quantity);
  }

  async selectConfiguration(configurationText: string): Promise<void> {
    await this.configurations.select(configurationText);
  }

  async verifySelectedQuantity(productNumber: string, expectedQuantity: number, description?: string): Promise<void> {
    await this.dependencies.verify(await this.findProductRow(productNumber, description), productNumber, expectedQuantity);
  }

  async executeGeneric(instruction: ComponentInstruction): Promise<void> {
    await this.openSection(instruction.section);
    const product = instruction.productNumber;
    switch (instruction.selectionType) {
      case 'radio': await this.selectRadioProduct(product!, instruction.description); break;
      case 'quantity': await this.setProductQuantity(product!, instruction.quantity!, instruction.description); break;
      case 'automatic': await this.verifySelectedQuantity(product!, instruction.quantity ?? 1, instruction.description); break;
      case 'configuration': await this.selectConfiguration(instruction.configurationText!); break;
      case 'checkbox': {
        const row = await this.findProductRow(product!, instruction.description);
        const checkbox = row.locator('input[type="checkbox"]').filter({ visible: true }).first();
        await expect(checkbox).toBeVisible(); if (!(await checkbox.isChecked())) await checkbox.check({ force: true });
        await expect(checkbox).toBeChecked(); break;
      }
      case 'default': break;
      default: throw new UnsupportedComponentError(`Unsupported selection type for ${product ?? instruction.section}`);
    }
    await waitForBlockingOverlay(this.page);
  }
}
