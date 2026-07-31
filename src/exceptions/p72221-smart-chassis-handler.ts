import { expect } from '@playwright/test';
import type { OcaEngine } from '../automation/oca-engine';
import type { ComponentInstruction } from '../models/component-instruction';
import type { ComponentExceptionHandler } from './exception-registry';
import { expectOcaMenuQuantity, selectOcaMenuQuantity, waitForSmartChassisMenuReady } from '../core/menu-quantity';
import { waitForBlockingOverlay } from '../core/waits';

/** Isolated exception for the known P72221-B21 Smart Chassis menu interaction. */
export class P72221SmartChassisHandler implements ComponentExceptionHandler {
  supports(instruction: ComponentInstruction): boolean {
    return instruction.productNumber?.toUpperCase() === 'P72221-B21' ||
      (instruction.section.toLowerCase() === 'smart chassis' && instruction.configurationText?.includes('P72221-B21') === true);
  }

  async execute(engine: OcaEngine, instruction: ComponentInstruction): Promise<void> {
    const page = engine.activePage;
    await waitForSmartChassisMenuReady(page);
    const wrongProduct = page.locator('tr.item_tr, tr').filter({ visible: true, hasText: 'P72227-B21' });
    const selectedWrong = wrongProduct.locator('input:checked, .checkbox_active, .radio_active');
    await expect(selectedWrong, 'P72227-B21 must not be selected in the P72221-B21 flow').toHaveCount(0);
    const label = instruction.configurationText || instruction.description || 'P72221-B21';
    const quantity = String(instruction.quantity ?? 1);
    await selectOcaMenuQuantity(page, label, quantity, 'P72221-B21 Smart Chassis');
    await expectOcaMenuQuantity(page, label, quantity);
    await waitForBlockingOverlay(page);
  }
}
