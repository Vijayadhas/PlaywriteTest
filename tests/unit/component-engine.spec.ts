import { expect, test } from '@playwright/test';
import { ComponentEngine, isMemoryBlankProduct } from '../../src/automation/component-engine';

test('distinguishes memory blank kits from usable memory products', () => {
  expect(isMemoryBlankProduct('HPE ProLiant Compute Gen12 Memory Blank Kit')).toBe(true);
  expect(isMemoryBlankProduct('Memory Blank')).toBe(true);
  expect(isMemoryBlankProduct('HPE 32GB DDR5 Registered Smart Memory Kit')).toBe(false);
});

test('opens collapsed Power Supplies before checking the committed selection', async ({ page }) => {
  await page.setContent(`<button id="section_header_power" onclick="document.querySelector('table').style.display = 'table'">Power Supplies</button>
    <table style="display:none"><tr class="item_tr" id="item_tr_P48908-B21_power_powerSlots">
      <td class="_pid">P48908-B21</td><td class="item_desc">Power Supply</td>
      <td class="item_qty"><div class="item_qty_div">1</div></td>
    </tr></table>`);
  const instruction = { jobId: 'test', section: 'Power Supplies', selectionType: 'random' as const, sequence: 40 };
  await new ComponentEngine(page, 'DL360').executeGeneric(instruction);
  await expect(page.locator('table')).toBeVisible();
  expect(instruction).toMatchObject({ productNumber: 'P48908-B21', quantity: 1 });
});

test('required Power Supplies recovery does not collapse visible choices', async ({ page }) => {
  await page.setContent(`<button id="section_header_power" onclick="document.querySelector('table').style.display = 'none'">Power Supplies</button>
    <table><tr class="item_tr" id="item_tr_P48908-B21_power_powerSlots">
      <td class="_pid">P48908-B21</td><td class="item_desc">Power Supply</td>
      <td class="item_qty"><div class="item_qty_div">1</div></td>
    </tr></table>`);
  await new ComponentEngine(page, 'DL360').satisfyRequiredSection('Power Supplies');
  await expect(page.locator('table')).toBeVisible();
});

test('does not mistake hidden menu digits for a committed power quantity', async ({ page }) => {
  await page.setContent(`<table><tr class="item_tr" id="item_tr_P48908-B21_power_powerSlots">
    <td class="_pid">P48908-B21</td><td class="item_desc">Power Supply</td>
    <td class="item_qty"><span style="display:none">1 2</span><div class="item_qty_div">0</div>
      <select onchange="document.querySelector('.item_qty_div').textContent = this.value"><option>0</option><option>1</option></select>
    </td></tr></table>`);
  await new ComponentEngine(page, 'DL360').executeGeneric({ jobId: 'test', section: 'Power Supplies', selectionType: 'random', sequence: 40 });
  await expect(page.locator('select')).toHaveValue('1');
});
