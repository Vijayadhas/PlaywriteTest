import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { env } from '../src/config/env';
import { launchOcaContext } from '../src/core/browser';
import { readBomUcid, updateEndBomWorkbook, type EndBomResult } from '../src/core/excel';
import { safeClick } from '../src/core/interactions';
import { selectOcaMenuQuantity, expectOcaMenuQuantity, waitForSmartChassisMenuReady } from '../src/core/menu-quantity';
import { installOcaShim } from '../src/core/shim';
import { escapeRegex, waitBeforeAction, waitForBlockingOverlay } from '../src/core/waits';

const BASE_MODEL_PART = 'P72176-B21';
const PROCESSOR_ROW = '#item_tr_P73829-B21_ProcessorSection_ProcessorChoice';
const MEMORY_ROW = '#item_tr_P69727-B21_memory_memorySlotsChoice';
const POWER_ROW = '#item_tr_P44712-B21_power_powerSlots';
const HEATSINK_KIT_PART = 'P74787-B21';

const SELECTED_PROCESSOR = 'P73829-B21 Intel Xeon 6740P 2.1GHz 48-core 270W Processor for HPE';
const SELECTED_MEMORY = 'P69727-B21';
const SMART_CHASSIS_CONFIG = 'Config # 3-38';

function newP72176B21Result(): EndBomResult {
  return {
    modelNo: BASE_MODEL_PART,
    processor: SELECTED_PROCESSOR,
    memory: SELECTED_MEMORY,
    service: 'Default',
    startBomUcid: '',
    endBomUcid: '',
    associateEndBom: 'No',
    status: 'Fail',
  };
}

class OcaConfig2P72176B21Flow {
  private page: Page;

  constructor(
    private readonly context: BrowserContext,
    private readonly result: EndBomResult,
  ) {
    this.page = context.pages()[0] ?? (undefined as unknown as Page);
  }

  async run() {
    await this.openOca();
    await this.searchAndOpenModel(BASE_MODEL_PART);
    await waitForSmartChassisMenuReady(this.page);
    await this.selectSmartChassis();

    await this.clickText('Processor Processor 0 0');
    await this.setStableRowQuantity(this.page.locator(PROCESSOR_ROW), '2', 'Processor P73829-B21');
    await this.ensureHeatsinkStable();

    await this.dismissAutoUpdatesWidget();
    await this.selectRecommendedOnly();

    await this.clickText('Memory Memory Capacity 0 0');
    await this.setStableRowQuantity(this.page.locator(MEMORY_ROW), '4', 'Memory P69727-B21');
    await this.ensureHeatsinkStable();

    await this.selectComponentSection('Power Supplies', '#section_header_power');
    await this.setStableRowQuantity(this.page.locator(POWER_ROW), '1', 'Power Supply P44712-B21');
    await this.ensureHeatsinkStable();

    await this.clickText('SaveQuoteExportAdd');
    await this.selectDefaultService();
    await this.openBomAndSetBillingTier();
    await this.saveOcaConfig();
    await this.generateAndAssociateEndBom();
  }

  private async openOca() {
    const page = this.context.pages()[0] ?? (await this.context.newPage());
    page.setDefaultTimeout(30_000);
    page.setDefaultNavigationTimeout(90_000);
    this.page = page;
    await installOcaShim(this.page);
    await this.page.goto(env.baseUrl, { waitUntil: 'domcontentloaded' });
    console.log('[INFO] Waiting for manual authentication:', env.authWaitMs, 'ms');
    await this.page.waitForTimeout(env.authWaitMs);
    await waitForBlockingOverlay(this.page);

    const aaSOption = this.page.getByText(/^aaS$/i).filter({ visible: true }).first();
    const searchReady = this.page
      .getByRole('textbox', { name: /Search to open UCID or create|Search config/i })
      .or(this.page.locator('#search-config'))
      .first();

    await expect
      .poll(
        async () => {
          if (await aaSOption.isVisible({ timeout: 1_000 }).catch(() => false)) {
            return 'aaS';
          }
          if (await searchReady.isVisible({ timeout: 1_000 }).catch(() => false)) {
            return 'ready';
          }
          return '';
        },
        { message: 'OCA landing page should be ready after authentication', timeout: 180_000 },
      )
      .not.toBe('');

    if (await aaSOption.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await safeClick(aaSOption);
    }
    await waitForBlockingOverlay(this.page);
  }

  private async searchAndOpenModel(partNumber: string) {
    const search = this.page
      .getByRole('textbox', { name: /Search to open UCID or create|Search config/i })
      .or(this.page.locator('#search-config'))
      .first();
    await expect(search).toBeVisible({ timeout: 60_000 });
    await search.fill(partNumber);

    const autocompleteOption = this.page
      .locator('ul.ui-autocomplete:not([style*="display: none"]) li.ui-menu-item, [role="option"]')
      .filter({ hasText: partNumber })
      .first();
    await safeClick(autocompleteOption);

    await this.page.locator('#dqe_cards_container').waitFor({ state: 'visible', timeout: 60_000 });
    const ctoCard = await this.findCtoCard(partNumber);
    await expect(ctoCard, `CTO card for ${partNumber} should be visible`).toBeVisible({ timeout: 60_000 });

    const newPagePromise = this.context.waitForEvent('page', { timeout: 15_000 }).catch(() => null);
    const customizeButton = ctoCard
      .getByRole('button', { name: /Customize|Build|Configure/i })
      .or(ctoCard.locator('button.dqe-customize-btn, .dqe-customize-btn'))
      .first();
    await safeClick(customizeButton);

    const newPage = await newPagePromise;
    this.page = newPage ?? this.page;
    await this.page.waitForLoadState('domcontentloaded').catch(() => undefined);
    await expect(this.page.getByText(env.expectedPageText, { exact: false }).first()).toBeVisible({ timeout: 60_000 });
  }

  private async selectSmartChassis() {
    const smartChassisButton = this.page.getByRole('button', { name: /Smart Chassis/i }).first();
    if (await smartChassisButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await safeClick(smartChassisButton);
    }
    await selectOcaMenuQuantity(this.page, 'Select Defaults for Smart Chassis', '1', 'Smart Chassis');
    await expectOcaMenuQuantity(this.page, 'Select Defaults for Smart Chassis', '1');
    await selectOcaMenuQuantity(this.page, SMART_CHASSIS_CONFIG, '1', 'Smart Chassis Configuration');
    await expectOcaMenuQuantity(this.page, SMART_CHASSIS_CONFIG, '1');
  }

  private async ensureHeatsinkStable() {
    console.log(`[STEP] Ensuring Processor Choice Heatsink Kit ${HEATSINK_KIT_PART} remains quantity 1`);
    await waitForBlockingOverlay(this.page);

    let row = await this.findHeatsinkRow();
    if (!row) {
      await this.openProcessorSectionIfVisible();
      await this.expandHeatsinkChoiceArea();
      row = await this.findHeatsinkRow();
    }
    if (!row) {
      await this.searchConfigPart(HEATSINK_KIT_PART);
      row = await this.findHeatsinkRow();
    }
    if (!row) {
      throw new Error(`Required Processor Choice Heatsink Kit ${HEATSINK_KIT_PART} was not visible after restore attempts`);
    }

    await this.setStableRowQuantity(row, '1', `Choice Heatsink Kit ${HEATSINK_KIT_PART}`);
  }

  private async setStableRowQuantity(row: Locator, quantity: string, label: string) {
    await row.waitFor({ state: 'visible', timeout: 60_000 });
    await row.scrollIntoViewIfNeeded();

    const radio = row.locator('input[type="radio"]').first();
    if (await radio.isVisible({ timeout: 2_000 }).catch(() => false)) {
      const checked = await radio.isChecked().catch(() => false);
      if (!checked) {
        await radio.check({ force: true }).catch(async () => {
          await radio.click({ force: true });
        });
        await waitForBlockingOverlay(this.page);
      }
    }

    const current = await this.readRowQuantity(row);
    if (current !== quantity) {
      await this.setRowQuantityOnce(row, quantity, label);
    }

    await waitForBlockingOverlay(this.page);
    let consecutiveMatches = 0;
    let lastValue = '';
    await expect
      .poll(
        async () => {
          const value = await this.readRowQuantity(row);
          const blockingOverlayCount = await this.page
            .locator('.blockUI.blockOverlay:visible, .ui-widget-overlay:visible, .maui-loading-div:visible')
            .count();
          if (value !== lastValue) {
            console.log(`[INFO] ${label} quantity observed as ${value || '<empty>'}`);
            lastValue = value;
          }
          consecutiveMatches = value === quantity && blockingOverlayCount === 0 ? consecutiveMatches + 1 : 0;
          return consecutiveMatches;
        },
        {
          message: `${label} quantity must remain ${quantity} after OCA recalculation`,
          timeout: 90_000,
          intervals: [1_000, 1_000, 1_500, 2_000],
        },
      )
      .toBeGreaterThanOrEqual(4);
  }

  private async setRowQuantityOnce(row: Locator, quantity: string, label: string) {
    const select = row.locator('select').first();
    if ((await select.count()) > 0) {
      const optionValues = await select.locator('option').evaluateAll((options) =>
        options.map((option) => ({
          text: (option.textContent ?? '').trim(),
          value: (option as HTMLOptionElement).value.trim(),
        })),
      );
      const option = optionValues.find((candidate) => candidate.value === quantity || candidate.text === quantity);
      if (!option) {
        throw new Error(`${label} does not provide quantity option ${quantity}`);
      }
      await select.selectOption(option.value);
      return;
    }

    const input = row.locator('input[type="number"], input[type="text"]').filter({ visible: true }).first();
    if (await input.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await input.fill(quantity);
      await input.press('Tab');
      return;
    }

    const qtyTarget = row.locator('.item_qty_div, td.item_qty, [class*="qty"]').filter({ visible: true }).first();
    await qtyTarget.waitFor({ state: 'visible', timeout: 10_000 });
    await qtyTarget.click({ force: true }).catch(async () => {
      await qtyTarget.evaluate((element) => (element as HTMLElement).click());
    });
    const option = this.page
      .locator(`.selecter-options .selecter-item[data-value="${quantity}"], [role="option"][data-value="${quantity}"], [id="${quantity}"], li`)
      .filter({ visible: true, hasText: new RegExp(`^\\s*${escapeRegex(quantity)}\\s*$`) })
      .first();
    if (await option.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await option.click({ force: true });
      return;
    }
    throw new Error(`${label} quantity option ${quantity} was not available`);
  }

  private async saveOcaConfig() {
    await waitForBlockingOverlay(this.page);
    await waitBeforeAction(this.page);
    await this.page.locator('#save_icon').click();
    await waitForBlockingOverlay(this.page);
    await waitBeforeAction(this.page);
    await this.page.getByText('Save OCA Config').click();
    await waitForBlockingOverlay(this.page);

    const saveDialog = this.page
      .locator('.ui-dialog, [role="dialog"]')
      .filter({ hasText: /Save|Acknowledge Errors before Saving/i })
      .last();
    await saveDialog.waitFor({ state: 'visible', timeout: 60_000 });

    const saveButton = saveDialog.locator('#save_btn').filter({ hasText: /^Save$/ }).last();
    await saveButton.waitFor({ state: 'visible', timeout: 60_000 });

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      console.log(`[STEP] Save dialog acknowledge/save attempt ${attempt}`);
      await this.acknowledgeErrorsBeforeSaving(saveDialog);
      await saveButton.click({ force: true }).catch(async () => {
        await saveButton.evaluate((element) => (element as HTMLElement).click());
      });

      await Promise.race([
        saveDialog.waitFor({ state: 'hidden', timeout: 60_000 }).catch(() => undefined),
        this.page.getByText(/\(OCA\) has encountered a problem/).waitFor({ state: 'visible', timeout: 60_000 }).catch(() => undefined),
      ]);

      if (await this.page.getByText(/\(OCA\) has encountered a problem/).isVisible({ timeout: 1_000 }).catch(() => false)) {
        const problemText = (await this.page.locator('body').textContent().catch(() => ''))?.replace(/\s+/g, ' ').trim();
        throw new Error(`OCA application error after Save: ${problemText?.slice(0, 500)}`);
      }
      if (!(await saveDialog.isVisible({ timeout: 2_000 }).catch(() => false))) {
        await waitForBlockingOverlay(this.page);
        return;
      }
      console.log('[WARN] Save dialog still visible after Save click:', await this.debugSaveDialogState(saveDialog));
    }

    throw new Error('Save dialog remained open after acknowledging and clicking Save');
  }

  private async acknowledgeErrorsBeforeSaving(saveDialog: Locator) {
    const acknowledgeText = saveDialog.getByText(/Acknowledge Errors before Saving as Action-Required/i).first();
    if (!(await acknowledgeText.isVisible({ timeout: 5_000 }).catch(() => false))) {
      return;
    }

    await saveDialog.evaluate((dialogElement) => {
      const input = dialogElement.querySelector<HTMLInputElement>('#ack_flag, input[type="checkbox"]');
      const icon = dialogElement.querySelector<HTMLElement>('#ack_checkbox');

      if (input && !input.checked) {
        input.checked = true;
        input.value = input.value || 'Y';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      }

      if (icon) {
        icon.classList.remove('checkbox_default');
        icon.classList.add('checkbox_active');
        icon.setAttribute('aria-checked', 'true');
        icon.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
        icon.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
        icon.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      }
    });

    const state = await this.debugSaveDialogState(saveDialog);
    if (state.ackFlagChecked || /checkbox_active|active|checked/i.test(state.ackIconClass ?? '')) {
      return;
    }

    const ackIcon = saveDialog.locator('#ack_checkbox').first();
    const ackLabel = saveDialog.locator('label[for="ack_flag"]').first();
    if (await ackIcon.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await ackIcon.click({ force: true });
    } else if (await ackLabel.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await ackLabel.click({ force: true });
    }
  }

  private async generateAndAssociateEndBom() {
    await this.page.getByText('End BOM').click();
    await waitForBlockingOverlay(this.page);
    await this.page.getByRole('button', { name: 'Auto-generate' }).click();
    await waitForBlockingOverlay(this.page);
    await this.page.getByRole('button', { name: 'Generate End BOM' }).click();
    await waitForBlockingOverlay(this.page);
    this.result.startBomUcid = await readBomUcid(this.page, 'Start BOM UCID');
    this.result.endBomUcid = await readBomUcid(this.page, 'End BOM UCID');
    await this.page.getByRole('button', { name: 'Associate End BOM' }).click();
    await waitForBlockingOverlay(this.page);
    this.result.associateEndBom = 'Yes';
    await this.page.getByRole('button', { name: 'Done' }).click();
    await waitForBlockingOverlay(this.page);
  }

  private async openBomAndSetBillingTier() {
    await this.page.getByRole('link', { name: 'BOM' }).click();
    await waitForBlockingOverlay(this.page);
    await this.selectOcaConfigFromBomDropdown();
    await waitForBlockingOverlay(this.page);
    await waitBeforeAction(this.page);
    await this.page.locator('#obw_billingtier_bot').click();
    await waitBeforeAction(this.page);
    const okButton = this.page.getByRole('button', { name: 'OK' });
    if (await okButton.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await okButton.click();
    }
    await waitForBlockingOverlay(this.page);
  }

  private async selectOcaConfigFromBomDropdown() {
    const navDropdown = this.page.locator('#show_full_nav');
    await navDropdown.waitFor({ state: 'visible', timeout: 30_000 });
    await navDropdown.click();
    const popupRoot = this.page.locator('#item_label_root').filter({ hasText: /OCA Config/i }).first();
    if (await popupRoot.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await popupRoot.click({ force: true });
      return;
    }
    await this.page.locator('li.eo_nav_li').filter({ hasText: /OCA Config/i }).first().click({ force: true });
  }

  private async selectDefaultService() {
    await this.page.getByRole('link', { name: 'Services', exact: true }).click();
    await waitForBlockingOverlay(this.page);
    await waitBeforeAction(this.page);
    await this.page.locator('.radio_default').first().click();
    await waitForBlockingOverlay(this.page);
  }

  private async clickText(text: string) {
    await waitBeforeAction(this.page);
    await waitForBlockingOverlay(this.page);
    await this.page.getByText(text).click();
    await waitForBlockingOverlay(this.page);
  }

  private async selectComponentSection(label: string, sectionSelector: string) {
    await waitForBlockingOverlay(this.page);
    const section = this.page.locator(sectionSelector).getByText(label, { exact: true }).first();
    await safeClick(section);
    await waitForBlockingOverlay(this.page);
  }

  private async selectRecommendedOnly() {
    const recommended = this.page.getByText('View HPE Recommended only', { exact: true }).filter({ visible: true }).first();
    if (await recommended.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await safeClick(recommended);
    }
  }

  private async dismissAutoUpdatesWidget() {
    const close = this.page
      .locator('[aria-label="Close"], .ui-dialog-titlebar-close, button')
      .filter({ hasText: /^Close$|^x$/i })
      .filter({ visible: true })
      .first();
    if (await close.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await close.click({ force: true }).catch(() => undefined);
    }
  }

  private async findCtoCard(partNumber: string) {
    const cardRoot = this.page.locator('#dqe_cards_container');
    const exactCtoCard = cardRoot.locator('div').filter({ hasText: new RegExp(`"${escapeRegex(partNumber)}"\\s*[—-]\\s*CTO`) }).first();
    if (await exactCtoCard.isVisible({ timeout: 5_000 }).catch(() => false)) {
      return exactCtoCard;
    }
    return cardRoot.locator('div').filter({ hasText: partNumber }).filter({ hasText: /CTO/i }).first();
  }

  private async findHeatsinkRow(): Promise<Locator | null> {
    const selectors = [
      `#item_tr_${HEATSINK_KIT_PART}_processor_HeatsinkKitChoice`,
      `#item_tr_${HEATSINK_KIT_PART}_ProcessorSection_HeatsinkKitChoice`,
      `tr[id*="${HEATSINK_KIT_PART}"][id*="Heatsink" i]`,
      `tr[id*="${HEATSINK_KIT_PART}"]`,
    ];
    for (const selector of selectors) {
      const row = this.page.locator(selector).filter({ visible: true }).first();
      if (await row.isVisible({ timeout: 1_500 }).catch(() => false)) {
        return row;
      }
    }
    const row = this.page.locator('tr.item_tr, tr').filter({ hasText: HEATSINK_KIT_PART }).filter({ visible: true }).first();
    return (await row.isVisible({ timeout: 2_000 }).catch(() => false)) ? row : null;
  }

  private async openProcessorSectionIfVisible() {
    const processorHeader = this.page
      .locator('#section_header_processor, #section_header_processorSection, [id*="section_header" i][id*="processor" i]')
      .filter({ visible: true })
      .first();
    if (await processorHeader.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await processorHeader.click({ force: true });
      await waitForBlockingOverlay(this.page);
    }
  }

  private async expandHeatsinkChoiceArea() {
    const candidates = this.page
      .locator('[id*="HeatsinkKitChoice" i], [id*="heatsink" i], tr, td, div, span, a')
      .filter({ hasText: /Choice Heatsink Kit|Heatsink Kit|Heatsink/i })
      .filter({ visible: true });
    const count = Math.min(await candidates.count().catch(() => 0), 8);
    for (let index = 0; index < count; index += 1) {
      const candidate = candidates.nth(index);
      await candidate.click({ force: true }).catch(async () => {
        await candidate.evaluate((element) => (element as HTMLElement).click());
      });
      await waitForBlockingOverlay(this.page);
      if (await this.findHeatsinkRow()) {
        return;
      }
    }
  }

  private async searchConfigPart(partNumber: string) {
    const search = this.page
      .getByRole('textbox', { name: /Search config for:/i })
      .or(this.page.locator('input[placeholder*="Search config" i], input[aria-label*="Search config" i]'))
      .filter({ visible: true })
      .first();
    if (!(await search.isVisible({ timeout: 8_000 }).catch(() => false))) {
      return;
    }
    await search.clear().catch(() => undefined);
    await search.fill(partNumber);
    await waitForBlockingOverlay(this.page);
    const productEntry = this.page.getByText(partNumber, { exact: false }).filter({ visible: true }).first();
    if (await productEntry.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await productEntry.click({ force: true });
      await waitForBlockingOverlay(this.page);
    }
    await search.clear().catch(() => undefined);
  }

  private async readRowQuantity(row: Locator) {
    const select = row.locator('select').first();
    if ((await select.count()) > 0) {
      return (await select.inputValue().catch(() => '')).trim();
    }
    const input = row.locator('input[type="number"], input[type="text"]').filter({ visible: true }).first();
    if (await input.isVisible({ timeout: 1_000 }).catch(() => false)) {
      return (await input.inputValue().catch(() => '')).trim();
    }
    const text = await row.locator('.item_qty_div, .item_qty').first().textContent({ timeout: 5_000 }).catch(() => '');
    return text?.replace(/\s+/g, ' ').trim() ?? '';
  }

  private async debugSaveDialogState(saveDialog: Locator) {
    return saveDialog.evaluate((dialogElement) => {
      const ackFlag = dialogElement.querySelector<HTMLInputElement>('#ack_flag, input[type="checkbox"]');
      const ackIcon = dialogElement.querySelector<HTMLElement>('#ack_checkbox');
      const saveButton = dialogElement.querySelector<HTMLElement>('#save_btn');
      return {
        ackFlagChecked: ackFlag?.checked ?? null,
        ackFlagValue: ackFlag?.value ?? null,
        ackIconClass: ackIcon?.className.toString() ?? null,
        saveButtonClass: saveButton?.className.toString() ?? null,
      };
    });
  }
}

test('OCA Config 2 P72176-B21 fresh recording', async ({ playwright }) => {
  test.setTimeout(20 * 60_000);

  const context = await launchOcaContext(playwright);
  const result = newP72176B21Result();

  try {
    const flow = new OcaConfig2P72176B21Flow(context, result);
    await flow.run();
    result.status = 'Pass';
    updateEndBomWorkbook(result);
  } catch (error) {
    result.status = 'Fail';
    updateEndBomWorkbook(result);
    throw error;
  } finally {
    await context.close().catch(() => undefined);
  }
});
