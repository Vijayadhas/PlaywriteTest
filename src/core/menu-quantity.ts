import { expect, type Page } from '@playwright/test';
import { escapeRegex, waitForBlockingOverlay, waitForOcaLoading } from './waits';

export async function selectOcaMenuQuantity(page: Page, descriptionText: string, quantity: string, sectionText?: string) {
  await waitForBlockingOverlay(page);
  let selected = await selectOcaRadioGridRow(page, descriptionText);
  if (selected) {
    await waitForOcaLoading(page);
  }
  if (selected && !(await ocaMenuQuantityMatches(page, descriptionText, quantity))) {
    selected = await selectRenderedOcaQuantity(page, descriptionText, quantity, false);
  }
  if (!selected) {
    selected = await selectRenderedOcaQuantity(page, descriptionText, quantity, false);
  }
  if (!selected) {
    selected = await setVisibleOcaMenuQuantity(page, descriptionText, quantity, sectionText);
  }
  if (!selected) {
    await expandOcaMenuSection(page, sectionText);
    selected =
      (await selectOcaRadioGridRow(page, descriptionText)) ||
      (await selectRenderedOcaQuantity(page, descriptionText, quantity, false)) ||
      (await setVisibleOcaMenuQuantity(page, descriptionText, quantity, sectionText)) ||
      (await clickOcaMenuQuantityCell(page, descriptionText));
  }
  if (!selected) {
    await selectNearestQuantity(page, descriptionText, quantity, sectionText);
  }
  await waitForBlockingOverlay(page);
}

export async function selectOcaRadioGridRow(page: Page, descriptionText: string) {
  const row = page.locator('tr.item_tr, tr').filter({ hasText: descriptionText }).first();
  if (!(await row.isVisible({ timeout: 5_000 }).catch(() => false))) {
    return false;
  }
  await row.scrollIntoViewIfNeeded();
  const radio = row.locator('input[type="radio"], .radio-btn input').first();
  if (await radio.isVisible().catch(() => false)) {
    await radio.check({ force: true }).catch(async () => {
      await radio.click({ force: true });
    });
    return true;
  }
  const descriptionCell = row.locator('.item_desc, td').filter({ hasText: descriptionText }).first();
  if (await descriptionCell.isVisible().catch(() => false)) {
    await descriptionCell.click().catch(async () => {
      await descriptionCell.evaluate((element) => (element as HTMLElement).click());
    });
    return true;
  }
  await row.click().catch(async () => {
    await row.evaluate((element) => (element as HTMLElement).click());
  });
  return true;
}

export async function selectRenderedOcaQuantity(page: Page, descriptionText: string, quantity: string, shouldAssert = true) {
  const row = page.locator('tr.item_tr, tr').filter({ hasText: descriptionText }).first();
  if (!(await row.isVisible({ timeout: 5_000 }).catch(() => false))) {
    return false;
  }
  const nativeSelect = row.locator('select').first();
  if (await nativeSelect.isVisible().catch(() => false)) {
    await nativeSelect.selectOption(quantity);
    await nativeSelect.evaluate((select) => {
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
      select.dispatchEvent(new Event('blur', { bubbles: true }));
    });
    await waitForOcaLoading(page);
    if (shouldAssert) {
      await expectOcaMenuQuantity(page, descriptionText, quantity);
    }
    return true;
  }
  const quantityControl = row.locator('.item_qty_div, .item_qty').first();
  if (!(await quantityControl.isVisible().catch(() => false))) {
    return false;
  }
  await quantityControl.scrollIntoViewIfNeeded();
  await quantityControl.hover().catch(() => undefined);
  await quantityControl.click({ delay: 150 }).catch(async () => {
    const box = await quantityControl.boundingBox();
    if (box) {
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    } else {
      await quantityControl.evaluate((element) => (element as HTMLElement).click());
    }
  });
  await page.waitForTimeout(750);
  await page.keyboard.press('ArrowDown').catch(() => undefined);
  await page.keyboard.press('Enter').catch(() => undefined);
  await waitForOcaLoading(page);
  if (shouldAssert) {
    await expectOcaMenuQuantity(page, descriptionText, quantity);
  }
  return true;
}

export async function expectOcaMenuQuantity(page: Page, descriptionText: string, quantity: string) {
  const row = page.locator('tr.item_tr, tr').filter({ hasText: descriptionText }).first();
  const nativeSelect = row.locator('select').first();
  if (await nativeSelect.isVisible().catch(() => false)) {
    await expect(nativeSelect).toHaveValue(quantity, { timeout: 30_000 });
    return;
  }
  await expect(row.locator('.item_qty_div, .item_qty').first()).toContainText(quantity, { timeout: 30_000 });
}

export async function ocaMenuQuantityMatches(page: Page, descriptionText: string, quantity: string) {
  const row = page.locator('tr.item_tr, tr').filter({ hasText: descriptionText }).first();
  const nativeSelect = row.locator('select').first();
  if (await nativeSelect.isVisible().catch(() => false)) {
    return (await nativeSelect.inputValue().catch(() => '')) === quantity;
  }
  const text = await row.locator('.item_qty_div, .item_qty').first().textContent({ timeout: 5_000 }).catch(() => '');
  return text?.replace(/\s+/g, ' ').trim() === quantity;
}

export async function clickOcaMenuQuantityCell(page: Page, descriptionText: string) {
  const row = page.locator('tr.item_tr, tr').filter({ hasText: descriptionText }).first();
  if (await row.isVisible({ timeout: 5_000 }).catch(() => false)) {
    const quantityCell = row.locator('.item_qty').first();
    if (await quantityCell.isVisible().catch(() => false)) {
      await quantityCell.scrollIntoViewIfNeeded();
      await quantityCell.click().catch(async () => {
        await quantityCell.evaluate((element) => (element as HTMLElement).click());
      });
      await waitForOcaLoading(page);
      return true;
    }
  }
  const descriptionCell = page.getByRole('cell', { name: descriptionText, exact: true }).first();
  if (await descriptionCell.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await descriptionCell.scrollIntoViewIfNeeded();
    await descriptionCell.click().catch(async () => {
      await descriptionCell.evaluate((element) => (element as HTMLElement).click());
    });
    await waitForOcaLoading(page);
    return true;
  }
  return false;
}

export async function setVisibleOcaMenuQuantity(page: Page, descriptionText: string, quantity: string, sectionText?: string) {
  return page.evaluate(
    ({ descriptionText, quantity, sectionText }) => {
      const normalize = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim();
      const descriptionNeedle = normalize(descriptionText).toLowerCase();
      const sectionNeedle = sectionText ? normalize(sectionText).toLowerCase() : '';
      const visible = (element: Element) => {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
      };
      const setSelect = (select: HTMLSelectElement) => {
        const option = Array.from(select.options).find((item) => normalize(item.value) === quantity || normalize(item.textContent) === quantity);
        if (!option) {
          return false;
        }
        select.scrollIntoView({ block: 'center' });
        select.value = option.value;
        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
        select.dispatchEvent(new Event('blur', { bubbles: true }));
        return true;
      };
      const sectionMatches = (element: Element) => {
        if (!sectionNeedle) {
          return true;
        }
        let container: Element | null = element;
        for (let depth = 0; container && depth < 16; depth += 1, container = container.parentElement) {
          if (normalize(container.textContent).toLowerCase().includes(sectionNeedle)) {
            return true;
          }
        }
        return false;
      };
      const anchors = Array.from(document.querySelectorAll('td, th, label, span, div, p, a')).filter(
        (element) => visible(element) && normalize(element.textContent).toLowerCase().includes(descriptionNeedle) && sectionMatches(element),
      );
      for (const anchor of anchors) {
        const anchorRect = anchor.getBoundingClientRect();
        const containers = [
          anchor.closest('tr'),
          anchor.closest('[role="row"]'),
          anchor.closest('.ag-row'),
          anchor.closest('.ui-grid-row'),
          anchor.closest('[class*="row"]'),
          anchor.parentElement,
        ].filter((element): element is Element => Boolean(element));
        for (const container of containers) {
          const select = Array.from(container.querySelectorAll<HTMLSelectElement>('select')).find(
            (candidate) =>
              visible(candidate) &&
              Array.from(candidate.options).some((option) => normalize(option.value) === quantity || normalize(option.textContent) === quantity),
          );
          if (select && setSelect(select)) {
            return true;
          }
        }
        const alignedSelect = Array.from(document.querySelectorAll<HTMLSelectElement>('select'))
          .filter(
            (select) =>
              visible(select) &&
              Array.from(select.options).some((option) => normalize(option.value) === quantity || normalize(option.textContent) === quantity),
          )
          .map((select) => {
            const rect = select.getBoundingClientRect();
            return {
              select,
              yDistance: Math.abs(rect.top + rect.height / 2 - (anchorRect.top + anchorRect.height / 2)),
              xDistance: Math.max(0, rect.left - anchorRect.right),
            };
          })
          .filter((candidate) => candidate.yDistance < 40 && candidate.xDistance < window.innerWidth)
          .sort((left, right) => left.yDistance - right.yDistance || left.xDistance - right.xDistance)[0]?.select;
        if (alignedSelect && setSelect(alignedSelect)) {
          return true;
        }
      }
      return false;
    },
    { descriptionText, quantity, sectionText },
  );
}

export async function expandOcaMenuSection(page: Page, sectionText?: string) {
  if (!sectionText) {
    return;
  }
  const section = page.getByText(new RegExp(`^${escapeRegex(sectionText)}$`, 'i')).filter({ visible: true }).first();
  if (!(await section.isVisible({ timeout: 5_000 }).catch(() => false))) {
    return;
  }
  await section.scrollIntoViewIfNeeded();
  await section.click().catch(async () => {
    await section.evaluate((element) => (element as HTMLElement).click());
  });
  await waitForBlockingOverlay(page);
}

export async function selectNearestQuantity(page: Page, anchorText: string, quantity: string, sectionText?: string) {
  await waitForBlockingOverlay(page);
  const selected = await page.evaluate(
    ({ anchorText, quantity, sectionText }) => {
      const normalize = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim();
      const anchorNeedle = normalize(anchorText).toLowerCase();
      const sectionNeedle = sectionText ? normalize(sectionText).toLowerCase() : '';
      const visible = (element: Element) => {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
      };
      const setSelect = (select: HTMLSelectElement) => {
        const option = Array.from(select.options).find((item) => normalize(item.value) === quantity || normalize(item.textContent) === quantity);
        if (!option) {
          return false;
        }
        select.value = option.value;
        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
        select.dispatchEvent(new Event('blur', { bubbles: true }));
        return true;
      };
      const anchorCandidates = Array.from(document.querySelectorAll('td, th, label, span, div, p, a')).filter((element) => {
        if (!visible(element)) {
          return false;
        }
        const text = normalize(element.textContent).toLowerCase();
        if (!text.includes(anchorNeedle)) {
          return false;
        }
        if (!sectionNeedle) {
          return true;
        }
        let container: Element | null = element;
        for (let depth = 0; container && depth < 12; depth += 1, container = container.parentElement) {
          if (normalize(container.textContent).toLowerCase().includes(sectionNeedle)) {
            return true;
          }
        }
        return false;
      });
      for (const anchor of anchorCandidates) {
        let container: Element | null = anchor.closest('tr, li, .row, [class*="row"], [class*="line"], [class*="option"], [class*="product"]') ?? anchor;
        for (let depth = 0; container && depth < 8; depth += 1, container = container.parentElement) {
          const selects = Array.from(container.querySelectorAll<HTMLSelectElement>('select')).filter(visible);
          const quantitySelect = selects.find((select) => Array.from(select.options).some((option) => normalize(option.value) === quantity || normalize(option.textContent) === quantity));
          if (quantitySelect && setSelect(quantitySelect)) {
            quantitySelect.scrollIntoView({ block: 'center' });
            return true;
          }
        }
        const anchorRect = anchor.getBoundingClientRect();
        const alignedSelect = Array.from(document.querySelectorAll<HTMLSelectElement>('select'))
          .filter((select) => visible(select) && Array.from(select.options).some((option) => normalize(option.value) === quantity || normalize(option.textContent) === quantity))
          .map((select) => {
            const rect = select.getBoundingClientRect();
            const yDistance = Math.abs(rect.top + rect.height / 2 - (anchorRect.top + anchorRect.height / 2));
            const xPenalty = rect.left >= anchorRect.left ? 0 : 500;
            return { select, score: yDistance + xPenalty };
          })
          .filter((candidate) => candidate.score < 220)
          .sort((left, right) => left.score - right.score)[0]?.select;
        if (alignedSelect && setSelect(alignedSelect)) {
          alignedSelect.scrollIntoView({ block: 'center' });
          return true;
        }
      }
      return false;
    },
    { anchorText, quantity, sectionText },
  );
  if (!selected) {
    const selectedViaGrid = await selectGridQuantity(page, anchorText, quantity);
    if (!selectedViaGrid) {
      throw new Error(`Quantity dropdown not found for "${anchorText}" with quantity "${quantity}"${sectionText ? ` in ${sectionText}` : ''}`);
    }
  }
  await waitForBlockingOverlay(page);
}

export async function selectGridQuantity(page: Page, anchorText: string, quantity: string) {
  const row = page.locator('tr.item_tr, tr').filter({ hasText: anchorText }).first();
  if (!(await row.isVisible().catch(() => false))) {
    return false;
  }
  const nativeSelect = row.locator('select').first();
  if (await nativeSelect.isVisible().catch(() => false)) {
    await nativeSelect.selectOption(quantity);
    return true;
  }
  const quantityCell = row.locator('.item_qty, [class*="qty"], td').filter({ hasText: /^\s*\d+\s*$/ }).first();
  if (!(await quantityCell.isVisible().catch(() => false))) {
    return false;
  }
  await quantityCell.scrollIntoViewIfNeeded();
  await quantityCell.click().catch(async () => {
    await quantityCell.evaluate((element) => (element as HTMLElement).click());
  });
  const quantityOption = page
    .locator('.selecter-options .selecter-item, .ui-menu-item, li, span, div')
    .filter({ visible: true, hasText: new RegExp(`^\\s*${escapeRegex(quantity)}\\s*$`) })
    .first();
  if (await quantityOption.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await quantityOption.click().catch(async () => {
      await quantityOption.evaluate((element) => (element as HTMLElement).click());
    });
    return true;
  }
  return false;
}

export async function trySelectQuantityOrLogReadOnly(page: Page, anchorText: string, quantity: string, sectionText?: string) {
  try {
    await selectNearestQuantity(page, anchorText, quantity, sectionText);
    return;
  } catch (error) {
    const rowText = await page.locator('tr.item_tr, tr').filter({ hasText: anchorText }).first().textContent().catch(() => '');
    if (rowText) {
      console.log(
        `[INFO] "${anchorText}" is present, but no editable quantity control was available. Row text: ${rowText.replace(/\s+/g, ' ').trim()}`,
      );
      return;
    }
    throw error;
  }
}

export async function clickRadioNearText(page: Page, labelText: string, sectionText?: string) {
  await waitForBlockingOverlay(page);
  const clicked = await page.evaluate(
    ({ labelText, sectionText }) => {
      const normalize = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim();
      const labelNeedle = normalize(labelText).toLowerCase();
      const sectionNeedle = sectionText ? normalize(sectionText).toLowerCase() : '';
      const visible = (element: Element) => {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
      };
      const textMatches = (element: Element) => normalize(element.textContent).toLowerCase().includes(labelNeedle);
      const sectionMatches = (element: Element) => !sectionNeedle || normalize(element.textContent).toLowerCase().includes(sectionNeedle);
      const candidates = Array.from(document.querySelectorAll('label, span, div, td, th, p')).filter(
        (element) => visible(element) && textMatches(element) && sectionMatches(element.closest('section, fieldset, form, div, table, tbody, tr') ?? element),
      );
      for (const candidate of candidates) {
        const label = candidate.closest('label');
        const labelRadio = label?.querySelector<HTMLInputElement>('input[type="radio"]');
        if (labelRadio) {
          labelRadio.click();
          return true;
        }
        const id = candidate.getAttribute('for');
        const forRadio = id ? document.getElementById(id) : null;
        if (forRadio instanceof HTMLInputElement && forRadio.type === 'radio') {
          forRadio.click();
          return true;
        }
        let container: Element | null = candidate;
        for (let depth = 0; container && depth < 8; depth += 1, container = container.parentElement) {
          const radio = container.querySelector<HTMLInputElement>('input[type="radio"]');
          if (radio) {
            radio.click();
            return true;
          }
        }
        (candidate as HTMLElement).click();
        return true;
      }
      return false;
    },
    { labelText, sectionText },
  );
  if (!clicked) {
    throw new Error(`Radio option not found: ${labelText}${sectionText ? ` under ${sectionText}` : ''}`);
  }
  await waitForBlockingOverlay(page);
}

export async function clickRecommendedOnlyAndConfirm(page: Page) {
  await waitForBlockingOverlay(page);
  const dialogPromise = page.waitForEvent('dialog', { timeout: 5_000 }).catch(() => null);
  await clickRadioNearText(page, 'View HPE Recommended only');
  const dialog = await dialogPromise;
  if (dialog) {
    console.log('[INFO] Confirm dialog appeared, accepting');
    await dialog.accept();
  } else {
    const yesButton = page.getByText(/^Yes$/i).filter({ visible: true }).first();
    if (await yesButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      console.log('[INFO] Confirmation popup appeared, clicking Yes');
      await yesButton.click();
    } else {
      console.log('[INFO] No confirmation popup appeared after selecting View HPE Recommended only');
    }
  }
  await waitForBlockingOverlay(page);
}

export async function ensureRecommendedOnly(page: Page, desired: boolean) {
  await waitForBlockingOverlay(page);
  const current = await page.evaluate(() => {
    const normalize = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim();
    const label = Array.from(document.querySelectorAll<HTMLElement>('span, label, div')).find((element) =>
      /View HPE Recommended only/i.test(normalize(element.textContent)),
    );
    if (!label) {
      return null;
    }
    const container = label.closest<HTMLElement>('div, span, label') ?? label;
    const checkbox = container.querySelector<HTMLInputElement>('input[type="checkbox"]') ?? label.parentElement?.querySelector<HTMLInputElement>('input[type="checkbox"]');
    if (checkbox) {
      return checkbox.checked;
    }
    const toggle = container.querySelector<HTMLElement>('[aria-checked], [role="switch"], .switch, .toggle, .slider') ?? container;
    const ariaChecked = toggle.getAttribute('aria-checked');
    if (ariaChecked === 'true') {
      return true;
    }
    if (ariaChecked === 'false') {
      return false;
    }
    const style = window.getComputedStyle(toggle);
    const className = toggle.className.toString();
    const text = normalize(toggle.textContent);
    if (/active|checked|selected|on/i.test(className) || /^on$/i.test(text) || /rgb\(0,\s*150,\s*120\)|rgb\(0,\s*169,\s*130\)/i.test(style.backgroundColor)) {
      return true;
    }
    return false;
  });
  if (current === desired) {
    return;
  }
  const dialogPromise = page.waitForEvent('dialog', { timeout: 5_000 }).catch(() => null);
  await page.locator('span').filter({ hasText: 'View HPE Recommended only' }).locator('label').click();
  const dialog = await dialogPromise;
  if (dialog) {
    await dialog.accept();
  } else {
    const yesButton = page.getByRole('button', { name: 'Yes' });
    if (await yesButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await yesButton.click();
    }
  }
  await waitForBlockingOverlay(page);
}

export async function dismissOcaProblemDialogs(page: Page) {
  for (let index = 0; index < 5; index += 1) {
    const problemDialog = page
      .locator('.ui-dialog')
      .filter({ has: page.locator('.ui-dialog-title', { hasText: /\(OCA\) has encountered a problem/ }) })
      .last();
    if (!(await problemDialog.isVisible({ timeout: 1_000 }).catch(() => false))) {
      return;
    }
    const text = (await problemDialog.textContent().catch(() => ''))?.replace(/\s+/g, ' ').trim();
    console.log(`[INFO] Dismissing OCA problem dialog: ${text?.slice(0, 300)}`);
    const okButton = problemDialog.getByRole('button', { name: 'OK' }).last();
    if (await okButton.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await okButton.click({ force: true });
    } else {
      await problemDialog.locator('.ui-dialog-titlebar-close').click({ force: true });
    }
    await problemDialog.waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => undefined);
    await page.waitForTimeout(500);
  }
  throw new Error('OCA problem dialog kept reappearing after power supply selection');
}

export async function waitForPowerSupplyRowToSettle(page: Page, rowId: string) {
  const row = page.locator(rowId);
  await expect(row).not.toContainText(/Loading/i, { timeout: 120_000 }).catch(() => {
    console.log('[INFO] Power supply row still showed Loading after 120 seconds; continuing after OCA dialog cleanup');
  });
}

export async function waitForSmartChassisMenuReady(page: Page) {
  await waitForBlockingOverlay(page);
  await page.getByText(/^Menu$/i).filter({ visible: true }).first().waitFor({ state: 'visible', timeout: 60_000 });
  await page.locator('tr.item_tr').filter({ hasText: 'Select Defaults for Smart Chassis' }).first().waitFor({ state: 'visible', timeout: 60_000 });
  await page
    .waitForFunction(
      () =>
        Array.from(document.querySelectorAll('tr.item_tr .item_qty_div')).some((element) => element.textContent?.trim() === '0') &&
        !document.querySelector('.blockUI.blockMsg:not([style*="display: none"])'),
      undefined,
      { timeout: 60_000 },
    )
    .catch(() => undefined);
  await page.waitForTimeout(1_000);
}

export async function waitForOcaMenuRow(page: Page, rowText: string) {
  await waitForBlockingOverlay(page);
  await page.locator('tr.item_tr').filter({ hasText: rowText }).first().waitFor({ state: 'visible', timeout: 60_000 });
  await page.waitForTimeout(500);
}

export async function clickConfigSection(page: Page, sectionName: string) {
  await waitForBlockingOverlay(page);
  const section = page.getByText(new RegExp(`^${escapeRegex(sectionName)}$`, 'i')).filter({ visible: true }).first();
  await section.waitFor({ state: 'visible', timeout: 60_000 });
  await section.scrollIntoViewIfNeeded();
  await section.click().catch(async () => {
    await section.evaluate((element) => (element as HTMLElement).click());
  });
  await waitForBlockingOverlay(page);
}

export async function dismissAutoUpdatesWidget(page: Page) {
  const widget = page.locator('#auto_updates_widget');
  if (!(await widget.isVisible({ timeout: 10_000 }).catch(() => false))) {
    return;
  }
  const closeControl = widget
    .locator('[aria-label*="close" i], [title*="close" i], .close, .ui-icon-closethick, .fa-times')
    .first();
  if (await closeControl.isVisible({ timeout: 1_000 }).catch(() => false)) {
    await closeControl.click({ force: true }).catch(async () => {
      await closeControl.evaluate((element) => (element as HTMLElement).click());
    });
  } else {
    const box = await widget.boundingBox();
    if (box) {
      await page.mouse.click(box.x + box.width - 28, box.y + 28);
    }
  }
  await widget.waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => undefined);
}
