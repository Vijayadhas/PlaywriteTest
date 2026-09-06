import { test, expect } from '@playwright/test';
import { QuantityHandler } from '../../src/components/quantity-handler';

test('keeps the selected product identity when recalculation reorders rows', async ({ page }) => {
  await page.setContent(`<table><tbody>
    <tr id="memory" class="item_tr"><td class="_pid">P69727-F21</td><td>
      <select onchange="this.closest('tbody').append(this.closest('tr'))">
        <option>0</option><option>1</option><option>2</option>
      </select></td></tr>
    <tr id="other" class="item_tr"><td>OTHER-PART</td><td><input type="number" value="1"></td></tr>
  </tbody></table>`);
  await new QuantityHandler(page).set(page.locator('tr').nth(0), 'P69727-F21', 2);
  await expect(page.locator('#memory select')).toHaveValue('2');
  await expect(page.locator('#other input')).toHaveValue('1');
});

test('waits for a real dropdown option instead of clicking a nearby quantity', async ({ page }) => {
  await page.setContent(`<table><tr id="memory" class="item_tr">
    <td>P69727-F21</td><td class="item_qty"><div class="item_qty_div"
      onclick="setTimeout(() => document.querySelector('.selecter-options').style.display = 'block', 1200)">0</div></td>
    <td><span onclick="document.body.dataset.wrongClick = 'yes'">2</span></td>
  </tr></table>
  <div class="selecter-options" style="display:none; margin-top:80px">
    <span class="selecter-item" data-value="2" onclick="document.querySelector('.item_qty_div').textContent = '2'; this.parentElement.style.display = 'none'">2</span>
  </div>`);
  await new QuantityHandler(page).set(page.locator('#memory'), 'P69727-F21', 2);
  await expect(page.locator('.item_qty_div')).toHaveText('2');
  await expect(page.locator('body')).not.toHaveAttribute('data-wrong-click', 'yes');
});

test('reads the quantity display without surrounding cell text', async ({ page }) => {
  await page.setContent(`<table><tr id="memory"><td>P69727-F21</td>
    <td class="item_qty">Quantity: <div class="item_qty_div">2</div></td>
  </tr></table>`);
  await new QuantityHandler(page).set(page.locator('#memory'), 'P69727-F21', 2);
});

test('verifies the displayed quantity when option values are internal identifiers', async ({ page }) => {
  await page.setContent(`<table><tr id="memory"><td>P69727-F21</td><td>
    <select><option value="qty-zero">0</option><option value="qty-two">2</option></select>
  </td></tr></table>`);
  await new QuantityHandler(page).set(page.locator('#memory'), 'P69727-F21', 2);
  await expect(page.locator('select')).toHaveValue('qty-two');
});
