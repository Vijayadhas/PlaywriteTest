import { expect, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { env } from '../config/env';
import { installOcaShim } from '../core/shim';
import { waitBeforeAction, waitForBlockingOverlay, escapeRegex } from '../core/waits';
import { safeClick, clickByText } from '../core/interactions';
import {
  selectOcaMenuQuantity,
  expectOcaMenuQuantity,
  ensureRecommendedOnly,
  dismissOcaProblemDialogs,
  dismissAutoUpdatesWidget,
  waitForPowerSupplyRowToSettle,
  waitForSmartChassisMenuReady,
  waitForOcaMenuRow,
} from '../core/menu-quantity';
import { readBomUcid, updateEndBomWorkbook, type EndBomResult } from '../core/excel';
import type { ModelSpec } from '../models/model.types';

type ChoiceItemOptions = {
  sectionName: string;
  sectionSelector: string;
  choiceName: string;
  partNumber: string;
  quantity?: string;
};

export class OcaConfigPage {
  private page: Page;
  private readonly confirmedNetworkingParts = new Set<string>();

  constructor(
    private readonly context: BrowserContext,
    private readonly spec: ModelSpec,
    private readonly result: EndBomResult,
  ) {
    this.page = context.pages()[0] ?? (undefined as unknown as Page);
  }

  /** Direct access to the active page (config page after customize). */
  get activePage(): Page {
    return this.page;
  }

  private async useConfigPage(page: Page) {
    this.page = page;
    this.page.setDefaultTimeout(30_000);
    this.page.setDefaultNavigationTimeout(90_000);
    await expect(this.page.getByText(env.expectedPageText, { exact: false }).first()).toBeVisible({ timeout: 60_000 });
  }

  async openOca() {
    const page = this.context.pages()[0] ?? (await this.context.newPage());
    page.setDefaultTimeout(30_000);
    page.setDefaultNavigationTimeout(90_000);
    this.page = page;
    await installOcaShim(this.page);
    console.log('[INFO] Launching URL:', env.baseUrl);
    await this.page.goto(env.baseUrl, { waitUntil: 'domcontentloaded' });
    console.log('[INFO] Waiting for manual authentication:', env.authWaitMs, 'ms');
    await this.page.waitForTimeout(env.authWaitMs);
    console.log('[INFO] Manual authentication wait completed');

    if (this.spec.navPath) {
      for (const segment of this.spec.navPath) {
        console.log('[STEP] Clicking menu segment:', String(segment));
        await clickByText(this.page, segment);
      }
      return;
    }

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
        { message: 'OCA authenticated landing page should be ready', timeout: 180_000 },
      )
      .not.toBe('');
    if (await aaSOption.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await safeClick(aaSOption);
    }
  }

  async searchAndOpenModel(partNumber: string): Promise<Page> {
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
    await this.selectProductNumberIfAvailable(ctoCard, partNumber);
    const newPagePromise = this.context.waitForEvent('page', { timeout: 15_000 }).catch(() => null);
    await this.clickCtoCustomizeButton(ctoCard);
    const newPage = await newPagePromise;
    const configPage = newPage ?? this.page;
    await configPage.waitForLoadState('domcontentloaded').catch(() => undefined);
    await this.useConfigPage(configPage);
    return configPage;
  }

  async selectSmartChassis(defaultsLabel: string, configLabel: string) {
    await waitForBlockingOverlay(this.page);
    const smartChassisButton = this.page.getByRole('button', { name: /Smart Chassis/i }).first();
    if (await smartChassisButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await safeClick(smartChassisButton);
    }
    await this.ensureSmartChassisExpanded(defaultsLabel);
    await selectOcaMenuQuantity(this.page, defaultsLabel, '1', 'Smart Chassis');
    await expectOcaMenuQuantity(this.page, defaultsLabel, '1');
    await waitForOcaMenuRow(this.page, configLabel);
    await selectOcaMenuQuantity(this.page, configLabel, '1', 'Smart Chassis Configuration');
    await expectOcaMenuQuantity(this.page, configLabel, '1');
  }

  private async ensureSmartChassisExpanded(defaultsLabel: string) {
    const defaultRow = this.page
      .locator('tr.item_tr, tr')
      .filter({ hasText: defaultsLabel })
      .filter({ visible: true })
      .first();
    if (await defaultRow.isVisible({ timeout: 5_000 }).catch(() => false)) {
      return;
    }
    const smartChassisHeader = this.page
      .getByRole('button', { name: /Smart Chassis/i })
      .or(
        this.page
          .locator('[id*="smartChassis" i], [id*="smart_chassis" i], .section_header')
          .filter({ hasText: /Smart Chassis/i }),
      )
      .or(this.page.getByText(/Smart Chassis/i))
      .filter({ visible: true })
      .last();
    await expect(smartChassisHeader, 'Smart Chassis section header should be visible').toBeVisible({ timeout: 60_000 });
    await safeClick(smartChassisHeader);
    await waitForBlockingOverlay(this.page);
    await expect(defaultRow, 'Smart Chassis default row should be visible after expanding the section').toBeVisible({
      timeout: 60_000,
    });
  }

  async waitForSmartChassisMenuReady() {
    await waitForSmartChassisMenuReady(this.page);
  }

  async selectRecommendedOnly(once = false) {
    if (once) {
      await waitForBlockingOverlay(this.page);
      const recommended = this.page.getByText('View HPE Recommended only', { exact: true }).filter({ visible: true }).first();
      if (await recommended.isVisible({ timeout: 10_000 }).catch(() => false)) {
        await safeClick(recommended);
        await waitForBlockingOverlay(this.page);
      }
      return;
    }
    await ensureRecommendedOnly(this.page, true);
  }

  /**
   * Generalized replacement for model 1's selectProcessorQuantity / selectMemoryQuantity /
   * selectPowerSupplyQuantity. Takes the row CSS id and a target quantity, and runs the robust
   * fallback chain: radio check -> select.selectOption -> DOM event dispatch by value ->
   * .item_qty_div click -> [id="<qty>"] option click.
   */
  async setRowQuantity(rowId: string, quantity: string) {
    await waitForBlockingOverlay(this.page);
    const row = this.page.locator(rowId);
    await row.waitFor({ state: 'visible', timeout: 30_000 });
    await this.setAndConfirmStableRowQuantity(row, quantity, rowId);
  }

  async ensureChoiceItemStable(options: ChoiceItemOptions) {
    const quantity = options.quantity ?? '1';
    const label = `${options.sectionName} ${options.choiceName} ${options.partNumber}`;
    console.log(`[STEP] Ensuring ${label} remains quantity ${quantity}`);
    await waitForBlockingOverlay(this.page);

    let row = await this.findChoiceItemRow(options);

    if (!row) {
      await this.expandChoiceAreaIfPossible(options);
      row = await this.findChoiceItemRow(options);
    }

    if (!row) {
      await this.openConfigSectionIfVisible(options.sectionName, options.sectionSelector);
      await this.expandChoiceAreaIfPossible(options);
      row = await this.findChoiceItemRow(options);
    }

    if (!row) {
      await this.searchAndSelectChoiceItem(options.partNumber);
      row = await this.findChoiceItemRow(options);
    }

    if (!row) {
      throw new Error(`Required choice item ${options.partNumber} was not visible after restore attempts`);
    }

    await this.setAndConfirmStableRowQuantity(row, quantity, label);
  }

  async reapplyChoiceItemAfterRecalculation(options: ChoiceItemOptions, reason: string) {
    console.log(`[STEP] Re-applying ${options.partNumber} after recalculation: ${reason}`);
    await waitForBlockingOverlay(this.page);
    await this.page.waitForTimeout(1_500);
    await this.ensureChoiceItemStable(options);
  }

  /**
   * Generalized section opener. With sectionSelector it scopes the click (model 2's
   * openConfigSection); without it, it does model 1's plain text-based section click.
   */
  async selectComponentSection(label: string, sectionSelector?: string) {
    await waitForBlockingOverlay(this.page);
    if (sectionSelector) {
      const section = this.page.locator(sectionSelector).getByText(label, { exact: true }).first();
      await safeClick(section);
      await waitForBlockingOverlay(this.page);
      return;
    }
    const section = this.page.getByText(new RegExp(`^${escapeRegex(label)}$`, 'i')).filter({ visible: true }).first();
    await section.waitFor({ state: 'visible', timeout: 60_000 });
    await section.scrollIntoViewIfNeeded();
    await section.click().catch(async () => {
      await section.evaluate((element) => (element as HTMLElement).click());
    });
    await waitForBlockingOverlay(this.page);
  }

  /** Click an arbitrary element by exact/regex visible text (model 1 step driver). */
  async clickText(text: RegExp | string) {
    await waitForBlockingOverlay(this.page);
    await waitBeforeAction(this.page);
    if (typeof text === 'string') {
      await this.page.getByText(text).click();
    } else {
      await this.page.getByText(text).click();
    }
    await waitForBlockingOverlay(this.page);
  }

  async dismissAutoUpdatesWidget() {
    await dismissAutoUpdatesWidget(this.page);
  }

  async dismissOcaProblemDialogs() {
    await dismissOcaProblemDialogs(this.page);
  }

  async waitForPowerSupplyRowToSettle(rowId: string) {
    await waitForPowerSupplyRowToSettle(this.page, rowId);
  }

  async configureNetworkingCard(partNumber: string) {
    console.log(`[INFO] Networking card add started for reference part: ${partNumber}`);
    await this.openConfigSection('Networking', '#section_header_networkController');
    await waitForBlockingOverlay(this.page);
    let row = this.networkingCardRow(partNumber);
    if (!(await row.isVisible({ timeout: 5_000 }).catch(() => false))) {
      const ocpUpgrades = this.page
        .getByText(/^OCP (Upgrades|Ethernet)/i)
        .filter({ visible: true })
        .first();
      await safeClick(ocpUpgrades);
      await waitForBlockingOverlay(this.page);
      row = this.networkingCardRow(partNumber);
    }
    await expect(row, `Networking product row for ${partNumber} should be visible`).toBeVisible({ timeout: 60_000 });
    console.log(`[INFO] Networking card row found for reference part: ${partNumber}; setting quantity to 1`);
    await this.setAndConfirmStableRowQuantity(row, '1', `Networking card ${partNumber}`);
    await expect(row).toContainText(partNumber);
    this.confirmedNetworkingParts.add(partNumber);
    console.log(`[INFO] Networking card added successfully for reference part: ${partNumber}`);
  }

  async selectService(level: string) {
    await waitForBlockingOverlay(this.page);
    await waitBeforeAction(this.page);
    await this.page.getByRole('link', { name: 'Services', exact: true }).click();
    await waitForBlockingOverlay(this.page);
    await waitBeforeAction(this.page);
    await this.page.locator('.radio_default').first().click();
    await waitForBlockingOverlay(this.page);
    console.log(`[INFO] Selected ${level} service`);
  }

  async runBillingTierSetup() {
    await waitForBlockingOverlay(this.page);
    await waitBeforeAction(this.page);
    await this.page.locator('#eo_nav_li_0').click();
    await waitForBlockingOverlay(this.page);
    await this.page.getByRole('link', { name: 'BOM' }).click();
    await waitForBlockingOverlay(this.page);
    await this.page.getByText('Billing Tier Setup').click();
    await this.closeBillingTierDialogIfVisible();
    await waitForBlockingOverlay(this.page);
  }

  /** Model 1's BOM-dropdown + billing tier sequence (verbatim from selectRecordedProcessorAndMemory tail). */
  async openBomAndSetBillingTier() {
    await waitBeforeAction(this.page);
    await this.page.getByRole('link', { name: 'BOM' }).click();
    await waitForBlockingOverlay(this.page);
    await this.selectOcaConfigFromBomDropdown();
    await waitForBlockingOverlay(this.page);
    await waitBeforeAction(this.page);
    await this.page.locator('#obw_billingtier_bot').click();
    await waitBeforeAction(this.page);
    await this.page.getByRole('button', { name: 'OK' }).click();
    await waitForBlockingOverlay(this.page);
  }

  private async selectOcaConfigFromBomDropdown() {
    await waitForBlockingOverlay(this.page);
    const navDropdown = this.page.locator('#show_full_nav');
    await navDropdown.waitFor({ state: 'visible', timeout: 30_000 });
    await navDropdown.click();
    const popupRoot = this.page.locator('#item_label_root').filter({ hasText: /OCA Config/i }).first();
    if (await popupRoot.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await popupRoot.click({ force: true });
      await waitForBlockingOverlay(this.page);
      return;
    }
    const ocaConfigItem = this.page.locator('li.eo_nav_li').filter({ hasText: /OCA Config/i }).first();
    await ocaConfigItem.waitFor({ state: 'visible', timeout: 30_000 });
    await ocaConfigItem.click({ force: true });
    await waitForBlockingOverlay(this.page);
  }

  async saveOcaConfig() {
    await waitForBlockingOverlay(this.page);
    await this.closeBillingTierDialogIfVisible();
    await this.waitForModalOverlayHidden();
    await waitBeforeAction(this.page);
    await this.page.locator('#save_icon').click();
    await waitForBlockingOverlay(this.page);
    await waitBeforeAction(this.page);
    await this.page.getByText('Save OCA Config').click();
    await waitForBlockingOverlay(this.page);
    await this.saveOcaConfigDialog();
  }

  /** model 1's robust Save dialog handling. */
  private async saveOcaConfigDialog() {
    const saveDialog = this.page
      .locator('.ui-dialog')
      .filter({ has: this.page.locator('.ui-dialog-title', { hasText: /^Save/ }) })
      .last();
    await saveDialog.waitFor({ state: 'visible', timeout: 30_000 });
    const saveButton = saveDialog.locator('#save_btn').filter({ hasText: /^Save$/ }).last();
    await saveButton.waitFor({ state: 'visible', timeout: 60_000 });
    await expect(saveButton).toHaveText('Save');
    await saveButton.scrollIntoViewIfNeeded();
    const ocaProblem = this.page.getByText(/\(OCA\) has encountered a problem/);

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      console.log(`[STEP] Save dialog acknowledge/save attempt ${attempt}`);
      await this.acknowledgeErrorsBeforeSaving(saveDialog);
      await waitBeforeAction(this.page);
      await saveButton.click({ force: true, timeout: 10_000 }).catch(async () => {
        await saveButton.evaluate((element: HTMLElement) => element.click());
      });
      await Promise.race([
        saveDialog.waitFor({ state: 'hidden', timeout: 60_000 }).catch(() => undefined),
        ocaProblem.waitFor({ state: 'visible', timeout: 60_000 }).catch(() => undefined),
      ]);
      if (await ocaProblem.isVisible({ timeout: 1_000 }).catch(() => false)) {
        const problemText = (await this.page.locator('body').textContent().catch(() => ''))?.replace(/\s+/g, ' ').trim();
        throw new Error(`OCA application error after Save: ${problemText?.slice(0, 500)}`);
      }
      if (!(await saveDialog.isVisible({ timeout: 2_000 }).catch(() => false))) {
        await waitForBlockingOverlay(this.page);
        return;
      }
      const clicStatus = await saveDialog.locator('#clicStatus').textContent().catch(() => '');
      console.log(`[WARN] Save dialog still open. CLIC Status: ${(clicStatus ?? '').trim() || 'not available'}`);
      console.log('[DEBUG] Save dialog state:', await this.debugSaveDialogState(saveDialog));
    }

    throw new Error('Save dialog remained open after acknowledging and clicking Save');
  }

  async generateAndAssociateEndBom() {
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
    this.result.status = 'Pass';
    updateEndBomWorkbook(this.result);
  }

  async captureSelectedProcessorAndMemory() {
    const processor = await this.readSelectedProductFromSection('ProcessorSection', 'Processor');
    const memory = await this.readSelectedProductFromSection('MemorySection', 'Memory');
    this.result.processor = processor;
    this.result.memory = memory;
    console.log(`[INFO] Selected processor recorded for Excel: ${processor}`);
    console.log(`[INFO] Selected memory recorded for Excel: ${memory}`);
  }

  // ----- private helpers ported from model 2 (calling shared core helpers) -----

  private async findChoiceItemRow(options: ChoiceItemOptions): Promise<Locator | null> {
    const escapedPart = escapeRegex(options.partNumber);
    const exactSelectors = [
      `#item_tr_${options.partNumber}_processor_HeatsinkKitChoice`,
      `#item_tr_${options.partNumber}_ProcessorSection_HeatsinkKitChoice`,
      `tr[id*="${options.partNumber}"][id*="Heatsink" i]`,
      `tr[id*="${options.partNumber}"]`,
    ];

    for (const selector of exactSelectors) {
      const row = this.page.locator(selector).filter({ visible: true }).first();
      if (await row.isVisible({ timeout: 1_500 }).catch(() => false)) {
        return row;
      }
    }

    const rowByPart = this.page
      .locator('tr.item_tr, tr')
      .filter({ hasText: new RegExp(`\\b${escapedPart}\\b`) })
      .filter({ visible: true })
      .first();
    if (await rowByPart.isVisible({ timeout: 2_000 }).catch(() => false)) {
      return rowByPart;
    }

    return null;
  }

  private async expandChoiceAreaIfPossible(options: ChoiceItemOptions) {
    const candidates = this.page
      .locator(
        [
          `[id*="${options.choiceName.replace(/\s+/g, '')}" i]`,
          '[id*="HeatsinkKitChoice" i]',
          '[id*="heatsink" i]',
          'tr',
          'td',
          'div',
          'span',
          'a',
        ].join(', '),
      )
      .filter({ hasText: new RegExp(`${escapeRegex(options.choiceName)}|Heatsink Kit|Heatsink`, 'i') })
      .filter({ visible: true });

    const count = Math.min(await candidates.count().catch(() => 0), 8);
    for (let index = 0; index < count; index += 1) {
      const candidate = candidates.nth(index);
      const text = ((await candidate.textContent().catch(() => '')) ?? '').replace(/\s+/g, ' ').trim();
      if (!text || !new RegExp(`${escapeRegex(options.choiceName)}|Heatsink Kit|Heatsink`, 'i').test(text)) {
        continue;
      }
      await candidate.scrollIntoViewIfNeeded().catch(() => undefined);
      await candidate.click({ force: true }).catch(async () => {
        await candidate.evaluate((element) => (element as HTMLElement).click());
      });
      await waitForBlockingOverlay(this.page);
      await this.page.waitForTimeout(1_000);
      if (await this.findChoiceItemRow(options)) {
        return;
      }
    }
  }

  private async openConfigSectionIfVisible(sectionName: string, sectionSelector: string) {
    const section = this.page
      .locator(sectionSelector)
      .filter({ hasText: new RegExp(`^\\s*${escapeRegex(sectionName)}\\b`, 'i') })
      .filter({ visible: true })
      .first();
    if (!(await section.isVisible({ timeout: 8_000 }).catch(() => false))) {
      return;
    }
    await section.scrollIntoViewIfNeeded().catch(() => undefined);
    await section.click({ force: true }).catch(async () => {
      await section.evaluate((element) => (element as HTMLElement).click());
    });
    await waitForBlockingOverlay(this.page);
    await this.page.waitForTimeout(1_000);
  }

  private async searchAndSelectChoiceItem(partNumber: string) {
    const search = this.page
      .getByRole('textbox', { name: /Search config for:/i })
      .or(this.page.locator('input[placeholder*="Search config" i], input[aria-label*="Search config" i]'))
      .filter({ visible: true })
      .first();

    if (!(await search.isVisible({ timeout: 8_000 }).catch(() => false))) {
      console.log(`[WARN] Search Config box is not visible; cannot restore ${partNumber}`);
      return;
    }

    await search.click().catch(() => undefined);
    await search.clear().catch(() => undefined);
    await search.fill(partNumber);
    await waitForBlockingOverlay(this.page);
    await this.page.waitForTimeout(1_000);

    const productEntry = this.page.getByText(partNumber, { exact: false }).filter({ visible: true }).first();
    if (await productEntry.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await productEntry.click({ force: true }).catch(async () => {
        await productEntry.evaluate((element) => (element as HTMLElement).click());
      });
      await waitForBlockingOverlay(this.page);
      await this.page.waitForTimeout(1_500);
    }

    await search.clear().catch(() => undefined);
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
    }).catch((error) => {
      console.log('[WARN] DOM acknowledge sync failed:', String(error).split('\n')[0]);
    });

    const state = await this.debugSaveDialogState(saveDialog);
    const ackFlagChecked = Boolean((state as { ackFlagChecked?: boolean | null }).ackFlagChecked);
    const ackIconClass = String((state as { ackIconClass?: string | null }).ackIconClass ?? '');
    if (ackFlagChecked || /checkbox_active|active|checked/i.test(ackIconClass)) {
      return;
    }

    const ackIcon = saveDialog.locator('#ack_checkbox').first();
    const ackLabel = saveDialog.locator('label[for="ack_flag"]').first();
    if (await ackIcon.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await ackIcon.click({ force: true }).catch(async () => {
        await ackIcon.evaluate((element) => (element as HTMLElement).click());
      });
      return;
    }
    if (await ackLabel.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await ackLabel.click({ force: true }).catch(async () => {
        await ackLabel.evaluate((element) => (element as HTMLElement).click());
      });
    }
  }

  private async debugSaveDialogState(saveDialog: Locator) {
    return saveDialog.evaluate((dialogElement) => {
      const normalize = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim();
      const ackFlag = dialogElement.querySelector<HTMLInputElement>('#ack_flag, input[type="checkbox"]');
      const ackIcon = dialogElement.querySelector<HTMLElement>('#ack_checkbox');
      const saveButton = dialogElement.querySelector<HTMLElement>('#save_btn');
      return {
        ackFlagChecked: ackFlag?.checked ?? null,
        ackFlagValue: ackFlag?.value ?? null,
        ackIconClass: ackIcon?.className.toString() ?? null,
        saveButtonClass: saveButton?.className.toString() ?? null,
        saveButtonText: normalize(saveButton?.textContent),
      };
    }).catch((error) => ({ error: String(error) }));
  }

  private async findCtoCard(partNumber: string) {
    const cardRoot = this.page.locator('#dqe_cards_container');
    const exactCtoCard = cardRoot.locator('div').filter({ hasText: new RegExp(`"${escapeRegex(partNumber)}"\\s*[—-]\\s*CTO`) }).first();
    if (await exactCtoCard.isVisible({ timeout: 5_000 }).catch(() => false)) {
      return exactCtoCard;
    }
    const typedCard = cardRoot
      .locator('.dqe-card[data-type="cto"], .dqe-card.cto-card, .dqe-card')
      .filter({ hasText: partNumber })
      .filter({ hasText: /CTO/i })
      .first();
    if (await typedCard.isVisible({ timeout: 5_000 }).catch(() => false)) {
      return typedCard;
    }
    return cardRoot.locator('div').filter({ hasText: partNumber }).filter({ hasText: /CTO/i }).first();
  }

  private async selectProductNumberIfAvailable(card: Locator, partNumber: string) {
    const productSelect = card.locator('select.dqe-products, select').first();
    if (!(await productSelect.isVisible({ timeout: 5_000 }).catch(() => false))) {
      return;
    }
    await productSelect.selectOption(partNumber).catch(async () => {
      const selected = await productSelect.evaluate(
        (select, partNumber) => {
          const option = Array.from((select as HTMLSelectElement).options).find(
            (item) => item.value.trim() === partNumber || (item.textContent ?? '').includes(partNumber),
          );
          if (!option) {
            return false;
          }
          (select as HTMLSelectElement).value = option.value;
          select.dispatchEvent(new Event('input', { bubbles: true }));
          select.dispatchEvent(new Event('change', { bubbles: true }));
          select.dispatchEvent(new Event('blur', { bubbles: true }));
          return true;
        },
        partNumber,
      );
      if (!selected) {
        throw new Error(`Product number option was not available for ${partNumber}`);
      }
    });
    await expect(productSelect).toHaveValue(/.+/);
  }

  private async clickCtoCustomizeButton(card: Locator) {
    const customizeButton = card
      .getByRole('button', { name: /Customize|Build|Configure/i })
      .or(card.locator('button.dqe-customize-btn, .dqe-customize-btn'))
      .first();
    await safeClick(customizeButton);
  }

  private async openConfigSection(sectionName: string, sectionSelector: string) {
    await waitForBlockingOverlay(this.page);
    const section = this.page.locator(sectionSelector).getByText(sectionName, { exact: true }).first();
    await safeClick(section);
    await waitForBlockingOverlay(this.page);
  }

  private networkingCardRow(partNumber: string) {
    return this.page
      .locator('td.item_prod span._pid')
      .filter({ hasText: new RegExp(`^\\s*${escapeRegex(partNumber)}\\s*$`) })
      .filter({ visible: true })
      .first()
      .locator('xpath=ancestor::tr[1]');
  }

  private async readSelectedProductFromSection(sectionId: string, label: string) {
    const sectionHeader = this.page
      .locator('[id^="section_header_"], .section_header')
      .filter({ hasText: new RegExp(`^\\s*${escapeRegex(label)}\\b`, 'i') })
      .filter({ visible: true })
      .first();
    if (await sectionHeader.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await safeClick(sectionHeader);
    }
    await waitForBlockingOverlay(this.page);
    const selectedProduct = await this.page.evaluate(
      ({ sectionId, label }) => {
        const normalize = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim();
        const readQuantity = (row: HTMLTableRowElement) => {
          const select = row.querySelector<HTMLSelectElement>('select');
          if (select) {
            return normalize(select.value);
          }
          const input = row.querySelector<HTMLInputElement>('input[type="number"], input[type="text"]');
          if (input) {
            return normalize(input.value);
          }
          return normalize(row.querySelector('.item_qty_div, .item_qty')?.textContent);
        };
        const rows = Array.from(
          document.querySelectorAll<HTMLTableRowElement>(`tr[id*="${sectionId}"], tr.item_tr`),
        ).filter((row) => row.id.includes(sectionId));
        for (const row of rows) {
          const quantity = Number(readQuantity(row));
          if (!Number.isFinite(quantity) || quantity <= 0) {
            continue;
          }
          const partNumber = normalize(row.querySelector('span._pid, ._pid, .item_prod')?.textContent);
          if (!partNumber || !/^P[A-Z0-9-]+$/i.test(partNumber)) {
            continue;
          }
          const description = normalize(
            row.querySelector('.item_desc, td.item_desc, [class*="description"]')?.textContent,
          );
          return description && !description.includes(partNumber)
            ? `${partNumber} ${description}`
            : partNumber;
        }
        throw new Error(`No selected ${label.toLowerCase()} product with quantity greater than zero was found`);
      },
      { sectionId, label },
    );
    if (!selectedProduct) {
      throw new Error(`Selected ${label.toLowerCase()} product details were empty`);
    }
    return selectedProduct;
  }

  private async setAndConfirmStableRowQuantity(row: Locator, quantity: string, label: string) {
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
    const initialValue = await this.readRowQuantity(row);
    if (initialValue === quantity) {
      console.log(`[INFO] ${label} is already quantity ${quantity}; waiting for recalculation to settle`);
    } else {
      const select = row.locator('select').first();
      const input = row.locator('input[type="number"], input[type="text"]').filter({ visible: true }).first();
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
      } else if (await input.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await input.fill(quantity);
        await input.press('Tab');
      } else {
        await this.selectCustomRowQuantity(row, quantity);
      }
    }
    await waitForBlockingOverlay(this.page);
    let consecutiveMatches = 0;
    let lastValue = '';
    try {
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
            message: `${label} quantity must remain ${quantity} after UI recalculation`,
            timeout: 90_000,
            intervals: [1_000, 1_000, 1_500, 2_000],
          },
        )
        .toBeGreaterThanOrEqual(4);
    } catch (error) {
      const finalValue = await this.readRowQuantity(row);
      const rowText = (await row.textContent().catch(() => ''))?.replace(/\s+/g, ' ').trim();
      console.error(`[ERROR] ${label} quantity reverted to ${finalValue || '<empty>'}. Row: ${rowText}`);
      throw new Error(
        `${label} quantity did not remain ${quantity} after UI recalculation; final value was ${finalValue || '<empty>'}`,
        { cause: error },
      );
    }
    console.log(`[INFO] ${label} quantity remained stable at ${quantity}`);
  }

  private async selectCustomRowQuantity(row: Locator, quantity: string) {
    const exactQuantity = new RegExp(`^\\s*${escapeRegex(quantity)}\\s*$`);
    const quantityTargets = [
      row.locator('.item_qty_div').first(),
      row.locator('td.item_qty').first(),
      row.locator('[class*="qty"]').filter({ visible: true }).last(),
    ];
    for (const target of quantityTargets) {
      if (!(await target.isVisible({ timeout: 2_000 }).catch(() => false))) {
        continue;
      }
      await target.scrollIntoViewIfNeeded();
      const box = await target.boundingBox();
      if (box) {
        await this.page.mouse.click(box.x + Math.max(4, box.width - 8), box.y + box.height / 2);
      } else {
        await safeClick(target);
      }
      const option = this.page
        .locator(
          [
            `.selecter.open .selecter-options .selecter-item[data-value="${quantity}"]`,
            `.selecter-options .selecter-item[data-value="${quantity}"]`,
            `[role="option"][data-value="${quantity}"]`,
            `.ui-menu-item`,
            `[id="${quantity}"]`,
            `li`,
          ].join(', '),
        )
        .filter({ visible: true, hasText: exactQuantity })
        .first();
      if (await option.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await safeClick(option);
        await waitForBlockingOverlay(this.page);
        if (await this.rowQuantityMatches(row, quantity)) {
          return;
        }
      }
      await target.dblclick({ force: true }).catch(() => undefined);
      await this.page.keyboard.press('Control+A').catch(() => undefined);
      await this.page.keyboard.type(quantity).catch(() => undefined);
      await this.page.keyboard.press('Enter').catch(() => undefined);
      await this.page.keyboard.press('Tab').catch(() => undefined);
      await waitForBlockingOverlay(this.page);
      if (await this.rowQuantityMatches(row, quantity)) {
        return;
      }
    }
    await this.page.keyboard.press('ArrowDown').catch(() => undefined);
    await this.page.keyboard.press('Enter').catch(() => undefined);
  }

  private async rowQuantityMatches(row: Locator, quantity: string) {
    return (await this.readRowQuantity(row)) === quantity;
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

  private async closeBillingTierDialogIfVisible() {
    const dialog = this.page
      .locator('.ui-dialog, [role="dialog"]')
      .filter({ hasText: /Billing Tier Setup/i })
      .last();
    if (!(await dialog.isVisible({ timeout: 30_000 }).catch(() => false))) {
      return;
    }
    const okButton = dialog
      .getByRole('button', { name: /^OK$/i })
      .or(dialog.locator('button, input[type="button"], .s-btn').filter({ hasText: /^OK$/i }))
      .first();
    await okButton.click({ force: true });
    await dialog.waitFor({ state: 'hidden', timeout: 60_000 }).catch(() => undefined);
    await this.waitForModalOverlayHidden();
  }

  private async waitForModalOverlayHidden() {
    await this.page
      .locator('.ui-widget-overlay.ui-front, .ui-widget-overlay')
      .waitFor({ state: 'hidden', timeout: 120_000 })
      .catch(() => {
        console.log('[INFO] Modal overlay did not disappear within 120 seconds; continuing with next visible check');
      });
  }
}
