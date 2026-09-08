import { test, expect } from '@playwright/test';
import { ComponentEngine } from '../../src/automation/component-engine';
import { QuantityHandler } from '../../src/components/quantity-handler';

function memoryRows(secondAvailable: boolean): string {
  return `<div id="choice_column_titles_memory_memorySlotsChoice">Memory</div><table>${['FIRST', 'SECOND'].map((part, index) => `
    <tr class="item_tr" id="item_tr_${part}_memory_memorySlotsChoice">
      <td class="_pid">${part}</td><td class="item_desc">Memory DIMM</td>
      <td class="item_qty"><div class="item_qty_div">0</div><select><option>0</option>
        ${index === 1 && secondAvailable ? '<option>1</option><option>2</option>' : ''}
      </select></td></tr>`).join('')}</table>`;
}

test('tries the next memory candidate when the first quantity option is unavailable', async ({ page }) => {
  await page.setContent(memoryRows(true));
  const random = Math.random;
  Math.random = () => 0;
  try {
    const result = await new ComponentEngine(page, 'DL360').selectRandomMemory();
    expect(result).toEqual({ productNumber: 'SECOND', quantity: 1 });
    await expect(page.locator('#item_tr_FIRST_memory_memorySlotsChoice select')).toHaveValue('0');
    await expect(page.locator('#item_tr_SECOND_memory_memorySlotsChoice select')).toHaveValue('1');
  } finally { Math.random = random; }
});

test('stops with both candidate failures when all choices are unavailable', async ({ page }) => {
  await page.setContent(memoryRows(false));
  await expect(new ComponentEngine(page, 'DL360').selectRandomMemory()).rejects.toThrow(/All Memory candidates failed:(?=.*FIRST)(?=.*SECOND)/);
  await expect(page.locator('select').nth(0)).toHaveValue('0');
  await expect(page.locator('select').nth(1)).toHaveValue('0');
});

test('restores a partially changed candidate before selecting the next memory', async ({ page }) => {
  await page.setContent(memoryRows(true));
  const original = QuantityHandler.prototype.set;
  const random = Math.random;
  const attempts: string[] = [];
  Math.random = () => 0;
  QuantityHandler.prototype.set = async function (row, part, quantity, stable) {
    attempts.push(`${part}:${quantity}`);
    if (part === 'FIRST' && quantity === 1) {
      await row.locator('select').evaluate((select) => {
        select.append(new Option('1', '1'));
        (select as HTMLSelectElement).value = '1';
      });
      throw new Error('Simulated failure after a partial change');
    }
    return original.call(this, row, part, quantity, stable);
  };
  try {
    expect(await new ComponentEngine(page, 'DL360').selectRandomMemory()).toEqual({ productNumber: 'SECOND', quantity: 1 });
    expect(attempts).toEqual(['FIRST:1', 'FIRST:0', 'SECOND:1']);
    await expect(page.locator('#item_tr_FIRST_memory_memorySlotsChoice select')).toHaveValue('0');
  } finally {
    QuantityHandler.prototype.set = original;
    Math.random = random;
  }
});
