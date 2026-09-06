import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test';
import * as XLSX from 'xlsx';

const BASE_URL = 'https://ngc-itg-oca-internal.its.hpecorp.net/ocaPreForkM1/OCAInternalLogin';
const AUTH_WAIT_MS = 40_000;
const ACTION_DELAY_MS = 2_000;
const CHROME_PROFILE_DIR = 'C:\\selenium\\oca-profile';
const END_BOM_WORKBOOK_PATH = 'C:\\workspace\\Playwright\\EndBomModelValidation.xlsx';
const BASE_MODEL_PART = 'P72297-B21';
const SELECTED_PROCESSOR = 'P74506-B21 Intel Xeon 6515P 2.3GHz 16-core 150W Processor for HPE';
const SELECTED_MEMORY =
     'P69727-F21 HPE 32GB (1x32GB) Dual Rank x8 DDR5-6400 CAS-52-52-52 EC8 Registered Smart FIO Memory Kit';
const NETWORK_CARD_PART = 'P72203-B21';
const SERVICE_LEVEL = 'Lite';
const EXPECTED_PAGE_TEXT = 'OCA Config 2';

type SecondModelExcelResult = {
     modelNo: string;
     processor: string;
     memory: string;
     networkCard: string;
     service: string;
     startBomUcid: string;
     endBomUcid: string;
     associateEndBom: 'Yes' | 'No';
     status: 'Pass' | 'Fail';
};

test('configure OCA Config 2 second CTO model with Lite service and End BOM association', async ({ playwright }) => {
     test.setTimeout(15 * 60_000);

     let context: BrowserContext | undefined;
     const result: SecondModelExcelResult = {
          modelNo: BASE_MODEL_PART,
          processor: SELECTED_PROCESSOR,
          memory: SELECTED_MEMORY,
          networkCard: NETWORK_CARD_PART,
          service: SERVICE_LEVEL,
          startBomUcid: '',
          endBomUcid: '',
          associateEndBom: 'No',
          status: 'Fail',
     };

     try {
          console.log('[START] Second model test started');
          context = await playwright.chromium.launchPersistentContext(CHROME_PROFILE_DIR, {
               headless: false,
               viewport: { width: 1920, height: 1080 },
               ignoreHTTPSErrors: true,
               args: [
                    '--ignore-certificate-errors',
                    '--allow-running-insecure-content',
                    '--disable-web-security',
                    '--disable-notifications',
                    '--no-first-run',
                    '--no-default-browser-check',
                    '--auto-select-certificate-for-urls=["https://ngc-itg-oca-internal.its.hpecorp.net:443","https://hpe-itg.mtls.oktapreview.com:443"]',
               ],
          });

          const page = context.pages()[0] ?? await context.newPage();
          page.setDefaultTimeout(30_000);
          page.setDefaultNavigationTimeout(90_000);

          const flow = new SecondModelOcaConfigFlow(page, context, result);

          await test.step('Open OCA and complete manual authentication window', async () => {
               await flow.openOca();
          });

          let configPage: Page;
          await test.step(`Search base model ${BASE_MODEL_PART} and open CTO customize flow`, async () => {
               configPage = await flow.searchAndOpenBaseModel(BASE_MODEL_PART);
          });

          await test.step('Select Smart Chassis defaults and Config 65', async () => {
               await flow.useConfigPage(configPage);
               await flow.selectSmartChassisDefaults();
          });

          await test.step('Select View HPE Recommended only once', async () => {
               await flow.selectRecommendedOnlyOnce();
          });

          await test.step(`Configure Networking card ${NETWORK_CARD_PART}`, async () => {
               console.log(`[STEP] Configure Networking card reference: ${NETWORK_CARD_PART}`);
               await flow.configureNetworkingCard(NETWORK_CARD_PART);
          });

          await test.step(`Select ${SERVICE_LEVEL} service`, async () => {
               await flow.selectLiteService();
          });

          await test.step('Run Billing Tier Setup', async () => {
               await flow.runBillingTierSetup();
          });

          await test.step('Save OCA Config', async () => {
               await flow.saveOcaConfig();
          });

          await test.step('Generate and associate End BOM', async () => {
               await flow.generateAndAssociateEndBom();
          });

          result.status = 'Pass';
          updateEndBomWorkbook(result);
          console.log('[PASS] Second model test completed successfully');
     } catch (error) {
          console.error('[FAIL] Second model test failed:', error);
          updateEndBomWorkbook({ ...result, status: 'Fail' });
          throw error;
     } finally {
          await context?.close().catch(() => undefined);
     }
});

class SecondModelOcaConfigFlow {
     private page: Page;
     private readonly confirmedNetworkingParts = new Set<string>();

     constructor(
          page: Page,
          private readonly context: BrowserContext,
          private readonly result: SecondModelExcelResult,
     ) {
          this.page = page;
     }

     async useConfigPage(page: Page) {
          this.page = page;
          this.page.setDefaultTimeout(30_000);
          this.page.setDefaultNavigationTimeout(90_000);
          await expect(this.page.getByText(EXPECTED_PAGE_TEXT, { exact: false }).first()).toBeVisible({ timeout: 60_000 });
     }

     async openOca() {
          await installOcaShim(this.page);
          await this.page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
          console.log('[INFO] Waiting for manual authentication:', AUTH_WAIT_MS, 'ms');
          await this.page.waitForTimeout(AUTH_WAIT_MS);
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

     async searchAndOpenBaseModel(partNumber: string): Promise<Page> {
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
          await expect(configPage.getByText(EXPECTED_PAGE_TEXT, { exact: false }).first()).toBeVisible({ timeout: 60_000 });
          return configPage;
     }

     async selectSmartChassisDefaults() {
          await waitForBlockingOverlay(this.page);
          const smartChassisButton = this.page.getByRole('button', { name: /Smart Chassis/i }).first();
          if (await smartChassisButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
               await safeClick(smartChassisButton);
          }
          await this.ensureSmartChassisExpanded();
          await this.selectOcaMenuQuantity('Select Defaults for Smart Chassis', '1', 'Smart Chassis');
          await this.expectOcaMenuQuantity('Select Defaults for Smart Chassis', '1');
          await this.selectOcaMenuQuantity('Config 65', '1', 'Smart Chassis');
          await this.expectOcaMenuQuantity('Config 65', '1');
     }

     private async ensureSmartChassisExpanded() {
          const defaultRow = this.page
               .locator('tr.item_tr, tr')
               .filter({ hasText: 'Select Defaults for Smart Chassis' })
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

     async selectRecommendedOnlyOnce() {
          await waitForBlockingOverlay(this.page);
          const recommended = this.page.getByText('View HPE Recommended only', { exact: true }).filter({ visible: true }).first();
          if (await recommended.isVisible({ timeout: 10_000 }).catch(() => false)) {
               await safeClick(recommended);
               await waitForBlockingOverlay(this.page);
          }
     }

     async captureSelectedProcessorAndMemory() {
          const processor = await this.readSelectedProductFromSection('ProcessorSection', 'Processor');
          const memory = await this.readSelectedProductFromSection('MemorySection', 'Memory');

          this.result.processor = processor;
          this.result.memory = memory;
          console.log(`[INFO] Selected processor recorded for Excel: ${processor}`);
          console.log(`[INFO] Selected memory recorded for Excel: ${memory}`);
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

     async ensureNetworkingCardAdded(partNumber: string) {
          console.log(`[INFO] Verifying Networking card remains added: ${partNumber}`);
          await this.openConfigSection('Networking', '#section_header_networkController');
          const row = this.productRow(partNumber);
          if (!(await row.isVisible({ timeout: 10_000 }).catch(() => false)) && this.confirmedNetworkingParts.has(partNumber)) {
               console.log(`[INFO] Networking card ${partNumber} was already selected and confirmed; proceeding without re-searching`);
               return;
          }
          await expect(row, `Networking card ${partNumber} should remain visible`).toBeVisible({ timeout: 60_000 });
          if (!(await this.rowQuantityMatches(row, '1'))) {
               console.log(`[WARN] Networking card ${partNumber} was not quantity 1; selecting it again`);
               await this.selectRowQuantity(row, '1');
               await waitForBlockingOverlay(this.page);
          }
          await this.expectRowQuantity(row, '1', `Networking card ${partNumber}`);
     }

     async addRequiredPart(partNumber: string) {
          await waitForBlockingOverlay(this.page);
          await waitBeforeAction(this.page);
          const search = this.page
               .getByRole('textbox', { name: /Search config for:/i })
               .or(this.page.locator('input[placeholder*="Search config" i], input[aria-label*="Search config" i]'))
               .filter({ visible: true })
               .first();
          await expect(search).toBeVisible({ timeout: 60_000 });
          await search.clear().catch(() => undefined);
          await search.fill(partNumber);
          await waitForBlockingOverlay(this.page);

          const productEntry = this.page.getByText(partNumber, { exact: false }).filter({ visible: true }).first();
          if (await productEntry.isVisible({ timeout: 10_000 }).catch(() => false)) {
               await safeClick(productEntry);
          } else {
               console.log(`[INFO] ${partNumber} was not visible in Menu search; using Add Product flow`);
               await this.addProductFromToolbar(partNumber);
          }
          const row = this.productRow(partNumber);
          await expect(row, `Required product row for ${partNumber} should be visible`).toBeVisible({ timeout: 60_000 });
          await this.selectRowQuantity(row, '1');
          await waitForBlockingOverlay(this.page);
          await expect(row).toContainText(partNumber);
          await this.expectRowQuantity(row, '1', `Required part ${partNumber}`);
     }

     private async addProductFromToolbar(partNumber: string) {
          await waitForBlockingOverlay(this.page);
          const addProduct = this.page.getByText(/^Add Product$/i).filter({ visible: true }).first();
          await safeClick(addProduct);
          await waitForBlockingOverlay(this.page);

          const fromCatalog = this.page.getByText(/^From Catalog$/i).filter({ visible: true }).first();
          if (await fromCatalog.isVisible({ timeout: 10_000 }).catch(() => false)) {
               await safeClick(fromCatalog);
               await waitForBlockingOverlay(this.page);
          }

          const searchInputs = this.page
               .locator('input[type="text"], input[type="search"], input:not([type])')
               .filter({ visible: true });
          const inputCount = await searchInputs.count();
          if (inputCount === 0) {
               throw new Error('Add Product search input was not visible');
          }
          const addProductSearch = searchInputs.nth(inputCount - 1);
          await addProductSearch.fill(partNumber);
          await addProductSearch.press('Enter').catch(() => undefined);
          const searchBox = await addProductSearch.boundingBox();
          if (searchBox) {
               await this.page.mouse.click(searchBox.x + searchBox.width - 12, searchBox.y + searchBox.height / 2);
          }
          await waitForBlockingOverlay(this.page);

          const productResult = this.page.getByText(partNumber, { exact: false }).filter({ visible: true }).first();
          await safeClick(productResult);
          await waitForBlockingOverlay(this.page);

          const confirmButton = this.page
               .getByRole('button', { name: /^(Add|OK|Ok|Apply|Done|Select)$/i })
               .or(this.page.locator('button, span.s-btn, input[type="button"]').filter({ hasText: /^(Add|OK|Ok|Apply|Done|Select)$/i }))
               .filter({ visible: true })
               .first();
          if (await confirmButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
               await safeClick(confirmButton);
               await waitForBlockingOverlay(this.page);
          }
     }

   async selectLiteService() {
      await waitForBlockingOverlay(this.page);
      await waitBeforeAction(this.page);

      console.log('[STEP] Opening Services tab');

      await this.page.getByRole('link', { name: 'Services', exact: true }).click();

      await waitForBlockingOverlay(this.page);
      await waitBeforeAction(this.page);

      console.log('[STEP] Selecting Lite service');

      const liteLabel = this.page
         .locator('label')
         .filter({ hasText: /^Lite$/ })
         .first();

      if (await liteLabel.isVisible({ timeout: 10_000 }).catch(() => false)) {
         const liteSpan = liteLabel.locator('span').first();

         if (await liteSpan.isVisible({ timeout: 2_000 }).catch(() => false)) {
            await liteSpan.click({ force: true });
         } else {
            await liteLabel.click({ force: true });
         }

         await waitForBlockingOverlay(this.page);
         return;
      }

      const liteText = this.page.getByText(/^Lite$/i).filter({ visible: true }).first();

      if (await liteText.isVisible({ timeout: 5_000 }).catch(() => false)) {
         await liteText.click({ force: true }).catch(async () => {
            await liteText.evaluate((element) => (element as HTMLElement).click());
         });

         await waitForBlockingOverlay(this.page);
         return;
      }

      const radioDefault = this.page.locator('.radio_default').first();

      if (await radioDefault.isVisible({ timeout: 5_000 }).catch(() => false)) {
         await radioDefault.click({ force: true }).catch(async () => {
            await radioDefault.evaluate((element) => (element as HTMLElement).click());
         });

         await waitForBlockingOverlay(this.page);
         return;
      }

      const selectedByDom = await this.page.evaluate(() => {
         const normalize = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim();
         const visible = (element: Element) => {
            const style = window.getComputedStyle(element);
            const rect = element.getBoundingClientRect();

            return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
         };

         const candidates = Array.from(document.querySelectorAll<HTMLElement>('label, span, div, td, li')).filter(
            (element) => visible(element) && /^Lite$/i.test(normalize(element.textContent)),
         );

         for (const candidate of candidates) {
            const label = candidate.closest('label');

            if (label) {
               label.scrollIntoView({ block: 'center', inline: 'center' });
               label.click();
               return true;
            }

            candidate.scrollIntoView({ block: 'center', inline: 'center' });
            candidate.click();
            return true;
         }

         const radio = document.querySelector<HTMLElement>('.radio_default');

         if (radio && visible(radio)) {
            radio.scrollIntoView({ block: 'center', inline: 'center' });
            radio.click();
            return true;
         }

         return false;
      });

      if (!selectedByDom) {
         const bodyText = (await this.page.locator('body').textContent().catch(() => ''))?.replace(/\s+/g, ' ').trim();
         throw new Error(`Lite service option was not visible. Page text: ${bodyText?.slice(0, 500)}`);
      }

      await waitForBlockingOverlay(this.page);
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

     async runClicCheck() {
          const clicCheck = this.page.getByTitle('CLIC Check').or(this.page.getByText(/^CLIC Check$/i)).first();
          await safeClick(clicCheck);
          const done = this.page.getByRole('button', { name: /^Done$/ }).first();
          await safeClick(done);
          await waitForBlockingOverlay(this.page);
     }

     async saveOcaConfig() {
    await waitForBlockingOverlay(this.page);
    await this.closeBillingTierDialogIfVisible();
    await this.waitForModalOverlayHidden();

    await waitBeforeAction(this.page);

    await this.page.locator('#save #save_icon, [title="Save"] #save_icon').first().click();

    await waitForBlockingOverlay(this.page);
    await waitBeforeAction(this.page);

    await this.page.getByText('Save OCA Config').first().click();

    await waitForBlockingOverlay(this.page);

    const saveDialog = this.page
      .locator('.ui-dialog, [role="dialog"]')
      .filter({ hasText: /Save|Acknowledge Errors before Saving/i })
      .last();

    await saveDialog.waitFor({ state: 'visible', timeout: 60_000 });

    await this.acknowledgeErrorsBeforeSaving(saveDialog);

    const saveButton = saveDialog
      .locator('#save_btn')
      .filter({ hasText: /^Save$/ })
      .or(saveDialog.getByText(/^Save$/))
      .or(saveDialog.getByRole('button', { name: /^Save$/ }))
      .last();

    await saveButton.waitFor({ state: 'visible', timeout: 60_000 });

    await saveButton.click({ force: true }).catch(async () => {
      await saveButton.evaluate((element) => (element as HTMLElement).click());
    });

    await Promise.race([
      saveDialog.waitFor({ state: 'hidden', timeout: 60_000 }).catch(() => undefined),
      this.page
        .getByText(/\(OCA\) has encountered a problem/)
        .waitFor({ state: 'visible', timeout: 60_000 })
        .catch(() => undefined),
    ]);

    if (
      await this.page
        .getByText(/\(OCA\) has encountered a problem/)
        .isVisible({ timeout: 1_000 })
        .catch(() => false)
    ) {
      const problemText = (await this.page.locator('body').textContent().catch(() => ''))
        ?.replace(/\s+/g, ' ')
        .trim();

      throw new Error(`OCA application error after Save: ${problemText?.slice(0, 500)}`);
    }

    await waitForBlockingOverlay(this.page);
  }

  private async acknowledgeErrorsBeforeSaving(saveDialog: Locator) {
    const acknowledgeText = saveDialog.getByText(/Acknowledge Errors before Saving as Action-Required/i).first();

    if (!(await acknowledgeText.isVisible({ timeout: 10_000 }).catch(() => false))) {
      console.log('[INFO] Acknowledge Errors checkbox was not visible in Save dialog; continuing');
      return;
    }

    console.log('[STEP] Selecting Acknowledge Errors before Saving as Action-Required');

    const checkbox = saveDialog
      .locator('input[type="checkbox"]')
      .filter({ visible: true })
      .first();

    if (await checkbox.isVisible({ timeout: 5_000 }).catch(() => false)) {
      const checked = await checkbox.isChecked().catch(() => false);

      if (!checked) {
        await checkbox.check({ force: true }).catch(async () => {
          await checkbox.click({ force: true });
        });
      }

      return;
    }

    const label = saveDialog
      .locator('label')
      .filter({ hasText: /Acknowledge Errors before Saving as Action-Required/i })
      .first();

    if (await label.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await label.click({ force: true }).catch(async () => {
        await label.evaluate((element) => (element as HTMLElement).click());
      });

      return;
    }

    const clicked = await saveDialog.evaluate(() => {
      const normalize = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim();

      const candidates = Array.from(document.querySelectorAll<HTMLElement>('label, span, div, td, p')).filter((element) =>
        /Acknowledge Errors before Saving as Action-Required/i.test(normalize(element.textContent)),
      );

      for (const candidate of candidates) {
        const label = candidate.closest('label');

        if (label) {
          label.click();
          return true;
        }

        const id = candidate.getAttribute('for');
        const inputByFor = id ? document.getElementById(id) : null;

        if (inputByFor instanceof HTMLInputElement && inputByFor.type === 'checkbox') {
          inputByFor.click();
          return true;
        }

        let container: Element | null = candidate;

        for (let depth = 0; container && depth < 8; depth += 1, container = container.parentElement) {
          const input = container.querySelector<HTMLInputElement>('input[type="checkbox"]');

          if (input) {
            input.click();
            return true;
          }
        }

        candidate.click();
        return true;
      }

      return false;
    });

    if (!clicked) {
      throw new Error('Acknowledge Errors checkbox was visible but could not be selected');
    }
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

     async generateAndAssociateEndBom() {
          await this.page.locator('#obw_endbom_bot').click();
          await waitForBlockingOverlay(this.page);
          await this.page.getByRole('button', { name: 'Auto-generate' }).first().click();
          await waitForBlockingOverlay(this.page);
          await this.page.getByRole('button', { name: 'Generate End BOM' }).first().click();
          await waitForBlockingOverlay(this.page);

          this.result.startBomUcid = await this.readBomUcid('Start BOM UCID');
          this.result.endBomUcid = await this.readBomUcid('End BOM UCID');

          await this.page.getByRole('button', { name: 'Associate End BOM' }).first().click();
          await waitForBlockingOverlay(this.page);
          this.result.associateEndBom = 'Yes';
          await this.page.getByRole('button', { name: 'Done' }).first().click();
          await waitForBlockingOverlay(this.page);
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

     private async openTab(tabName: string) {
          await waitForBlockingOverlay(this.page);
          await safeClick(this.page.getByRole('link', { name: new RegExp(`^${escapeRegex(tabName)}$`, 'i') }).first());
          await waitForBlockingOverlay(this.page);
          if (/^BOM$/i.test(tabName)) {
               await expect(this.page.getByText(/^BOM Details for OCA Config/i).first()).toBeVisible({ timeout: 60_000 });
               return;
          }
          await expect(this.page.getByRole('link', { name: new RegExp(`^${escapeRegex(tabName)}$`, 'i') }).first()).toBeVisible({
               timeout: 60_000,
          });
     }

     private async openConfigSection(sectionName: string, sectionSelector: string) {
          await waitForBlockingOverlay(this.page);
          const section = this.page.locator(sectionSelector).getByText(sectionName, { exact: true }).first();
          await safeClick(section);
          await waitForBlockingOverlay(this.page);
     }

     private async selectOcaConfigFromBomDropdown() {
          await waitForBlockingOverlay(this.page);
          const navDropdown = this.page.locator('#show_full_nav');
          if (await navDropdown.isVisible({ timeout: 10_000 }).catch(() => false)) {
               await safeClick(navDropdown);
          }
          const popupRoot = this.page.locator('#item_label_root').filter({ hasText: /OCA Config/i }).first();
          if (await popupRoot.isVisible({ timeout: 3_000 }).catch(() => false)) {
               await safeClick(popupRoot);
               return;
          }
          const ocaConfigItem = this.page.locator('li.eo_nav_li').filter({ hasText: /OCA Config/i }).first();
          if (await ocaConfigItem.isVisible({ timeout: 10_000 }).catch(() => false)) {
               await safeClick(ocaConfigItem);
          }
     }

     private async selectEndBomFromDropdown() {
          await waitForBlockingOverlay(this.page);
          const visibleEndBom = this.page.getByText(/^End BOM$/i).filter({ visible: true }).first();
          if (await visibleEndBom.isVisible({ timeout: 3_000 }).catch(() => false)) {
               await safeClick(visibleEndBom);
               return;
          }

          const navDropdown = this.page.locator('#show_full_nav');
          await safeClick(navDropdown);

          const popupEndBom = this.page.locator('#item_label_root').filter({ hasText: /^End BOM$/i }).first();
          if (await popupEndBom.isVisible({ timeout: 5_000 }).catch(() => false)) {
               await safeClick(popupEndBom);
               return;
          }

          const endBomItem = this.page.locator('li.eo_nav_li, .eo_nav_li, [role="option"], [role="menuitem"]').filter({ hasText: /^End BOM$/i }).first();
          await safeClick(endBomItem);
     }

     private async selectOcaMenuQuantity(descriptionText: string, quantity: string, sectionText?: string) {
          await waitForBlockingOverlay(this.page);
          let selected = await this.selectRowQuantityByText(descriptionText, quantity);
          if (!selected) {
               selected = await this.setVisibleQuantityNearText(descriptionText, quantity, sectionText);
          }
          if (!selected) {
               throw new Error(`Quantity ${quantity} was not available for ${descriptionText}`);
          }
          await waitForBlockingOverlay(this.page);
     }

     private async expectOcaMenuQuantity(descriptionText: string, quantity: string) {
          const row = this.page.locator('tr.item_tr, tr').filter({ hasText: descriptionText }).filter({ visible: true }).first();
          const nativeSelect = row.locator('select').first();
          if ((await nativeSelect.count()) > 0) {
               await expect
                    .poll(async () => nativeSelect.inputValue().catch(() => ''), { timeout: 30_000 })
                    .toBe(quantity);
               return;
          }
          await expect(row.locator('.item_qty_div, .item_qty').first()).toContainText(quantity, { timeout: 30_000 });
     }

     private async selectRowQuantityByText(descriptionText: string, quantity: string) {
          const row = this.page.locator('tr.item_tr, tr').filter({ hasText: descriptionText }).filter({ visible: true }).first();
          if (!(await row.isVisible({ timeout: 10_000 }).catch(() => false))) {
               return false;
          }
          await this.selectRowQuantity(row, quantity);
          return true;
     }

     private productRow(partNumber: string) {
          return this.page
               .locator('tr.item_tr, tr')
               .filter({ hasText: partNumber })
               .filter({ visible: true })
               .first();
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

     private async clearVisibleConfigSearch() {
          const search = this.page
               .getByRole('textbox', { name: /Search config for:/i })
               .or(this.page.locator('input[placeholder*="Search config" i], input[aria-label*="Search config" i]'))
               .filter({ visible: true })
               .first();
          if (await search.isVisible({ timeout: 3_000 }).catch(() => false)) {
               await search.clear().catch(async () => {
                    await search.fill('');
               });
               await waitForBlockingOverlay(this.page);
          }
     }

     private async selectRowQuantity(row: Locator, quantity: string) {
          await row.scrollIntoViewIfNeeded();
          const radio = row.locator('input[type="radio"]').first();
          if (await radio.isVisible({ timeout: 2_000 }).catch(() => false)) {
               await radio.check({ force: true }).catch(async () => radio.click({ force: true }));
               await waitForBlockingOverlay(this.page);
               return;
          }
          const select = row.locator('select').first();
          if ((await select.count()) > 0) {
               const selected = await select
                    .selectOption(quantity)
                    .then(() => true)
                    .catch(async () =>
                         select.evaluate(
                              (element, quantity) => {
                                   const select = element as HTMLSelectElement;
                                   const option = Array.from(select.options).find(
                                        (item) => item.value.trim() === quantity || (item.textContent ?? '').trim() === quantity,
                                   );
                                   if (!option) {
                                        return false;
                                   }
                                   select.value = option.value;
                                   select.dispatchEvent(new Event('input', { bubbles: true }));
                                   select.dispatchEvent(new Event('change', { bubbles: true }));
                                   select.dispatchEvent(new Event('blur', { bubbles: true }));
                                   return true;
                              },
                              quantity,
                         ),
                    );
               if (!selected) {
                    throw new Error(`Quantity option ${quantity} was not available in select`);
               }
               await waitForBlockingOverlay(this.page);
               if (await this.rowQuantityMatches(row, quantity)) {
                    return;
               }
               await select.evaluate(
                    (element, quantity) => {
                         const select = element as HTMLSelectElement;
                         const option = Array.from(select.options).find(
                              (item) => item.value.trim() === quantity || (item.textContent ?? '').trim() === quantity,
                         );
                         if (option) {
                              select.value = option.value;
                              select.dispatchEvent(new Event('change', { bubbles: true }));
                         }
                    },
                    quantity,
               );
               await waitForBlockingOverlay(this.page);
               return;
          }
          await this.selectCustomRowQuantity(row, quantity);
          await waitForBlockingOverlay(this.page);
          if (await this.rowQuantityMatches(row, quantity)) {
               return;
          }
          throw new Error(`Quantity ${quantity} did not apply to the selected row`);
     }

     private async setAndConfirmStableRowQuantity(row: Locator, quantity: string, label: string) {
          await row.scrollIntoViewIfNeeded();

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

     private async expectRowQuantity(row: Locator, quantity: string, label: string) {
          await expect
               .poll(async () => this.rowQuantityMatches(row, quantity), {
                    message: `${label} quantity should be ${quantity}`,
                    timeout: 60_000,
               })
               .toBe(true);
          console.log(`[INFO] ${label} quantity confirmed as ${quantity}`);
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

     private async setVisibleQuantityNearText(descriptionText: string, quantity: string, sectionText?: string) {
          return this.page.evaluate(
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
                         select.value = option.value;
                         select.dispatchEvent(new Event('input', { bubbles: true }));
                         select.dispatchEvent(new Event('change', { bubbles: true }));
                         select.dispatchEvent(new Event('blur', { bubbles: true }));
                         return true;
                    };
                    const anchors = Array.from(document.querySelectorAll('td, th, label, span, div, p, a')).filter((element) => {
                         if (!visible(element) || !normalize(element.textContent).toLowerCase().includes(descriptionNeedle)) {
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
                    for (const anchor of anchors) {
                         let container: Element | null = anchor.closest('tr, li, .row, [class*="row"], [class*="option"]') ?? anchor;
                         for (let depth = 0; container && depth < 8; depth += 1, container = container.parentElement) {
                              const select = Array.from(container.querySelectorAll<HTMLSelectElement>('select')).find(
                                   (candidate) =>
                                        visible(candidate) &&
                                        Array.from(candidate.options).some((option) => normalize(option.value) === quantity || normalize(option.textContent) === quantity),
                              );
                              if (select && setSelect(select)) {
                                   select.scrollIntoView({ block: 'center' });
                                   return true;
                              }
                         }
                    }
                    return false;
               },
               { descriptionText, quantity, sectionText },
          );
     }

     private async clickRadioNearText(labelText: string) {
          await waitForBlockingOverlay(this.page);
          const clicked = await this.page.evaluate((labelText) => {
               const normalize = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim();
               const needle = normalize(labelText).toLowerCase();
               const visible = (element: Element) => {
                    const style = window.getComputedStyle(element);
                    const rect = element.getBoundingClientRect();
                    return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
               };
               const candidates = Array.from(document.querySelectorAll('label, span, div, td, th, p')).filter(
                    (element) => visible(element) && normalize(element.textContent).toLowerCase().includes(needle),
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
               }
               return false;
          }, labelText);
          if (!clicked) {
               throw new Error(`Radio option not found: ${labelText}`);
          }
          await waitForBlockingOverlay(this.page);
     }

     private async readBomUcid(labelText: string) {
          await waitForBlockingOverlay(this.page);
          return this.page.evaluate((labelText) => {
               const normalize = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();
               const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
               const bodyMatch = normalize(document.body.textContent).match(new RegExp(`${escapeRegex(labelText)}\\s*[:#-]?\\s*([A-Za-z0-9_-]+)`, 'i'));
               if (bodyMatch?.[1]) {
                    return bodyMatch[1];
               }
               return '';
          }, labelText);
     }
}

async function installOcaShim(page: Page) {
     await page.addInitScript(() => {
          const patchActivateTab = () => {
               const win = window as typeof window & { activateTab?: unknown };
               if (typeof win.activateTab !== 'function' || (win.activateTab as { __ocaPatched?: boolean }).__ocaPatched) {
                    return;
               }
               const original = win.activateTab as (...args: unknown[]) => unknown;
               const patched = function activateTabPatch(tab: { id?: unknown } | undefined) {
                    if (!tab || typeof tab !== 'object' || tab.id == null) {
                         console.log('[oca-shim] activateTab skipped invalid tab', tab);
                         return undefined;
                    }
                    return original.apply(this, arguments as unknown as Parameters<typeof original>);
               };
               (patched as { __ocaPatched?: boolean }).__ocaPatched = true;
               win.activateTab = patched;
          };
          window.addEventListener(
               'error',
               (event) => {
                    if (/activateTab.*undefined.*id|Cannot read properties of undefined \(reading 'id'\)/i.test(event.message)) {
                         console.log('[oca-shim] Suppressed activateTab id error');
                         event.preventDefault();
                         event.stopImmediatePropagation();
                    }
               },
               true,
          );
          patchActivateTab();
          window.setInterval(patchActivateTab, 250);
     });
}

async function safeClick(locator: Locator) {
     const page = locator.page();
     await waitBeforeAction(page);
     await waitForBlockingOverlay(page);
     await locator.waitFor({ state: 'visible', timeout: 60_000 });
     await expect(locator).toBeEnabled({ timeout: 60_000 });
     await locator.scrollIntoViewIfNeeded();
     await locator.click().catch(async () => {
          await locator.evaluate((element) => (element as HTMLElement).click());
     });
     await waitForBlockingOverlay(page);
}

async function waitBeforeAction(page: Page) {
     await page.waitForTimeout(ACTION_DELAY_MS);
}

async function waitForBlockingOverlay(page: Page) {
     await page
          .locator('.blockUI.blockOverlay')
          .waitFor({ state: 'hidden', timeout: 60_000 })
          .catch(() => {
               console.log('[INFO] Blocking overlay did not become hidden within 60 seconds; continuing with visible element checks');
          });
     await waitForOcaLoading(page);
}

async function waitForOcaLoading(page: Page) {
     await page
          .waitForFunction(
               () =>
                    Array.from(document.querySelectorAll<HTMLElement>('.blockUI.blockMsg, .maui-loading-div, .maui-loading-label')).every((element) => {
                         const style = window.getComputedStyle(element);
                         const container = element.closest<HTMLElement>('.blockUI.blockMsg') ?? element;
                         const containerStyle = window.getComputedStyle(container);
                         return (
                              style.display === 'none' ||
                              style.visibility === 'hidden' ||
                              containerStyle.display === 'none' ||
                              containerStyle.visibility === 'hidden' ||
                              Number(containerStyle.opacity || '1') <= 0.01
                         );
                    }),
               undefined,
               { timeout: 90_000 },
          )
          .catch(() => {
               console.log('[INFO] OCA loading message did not disappear within 90 seconds; continuing');
          });
}

function updateEndBomWorkbook(result: SecondModelExcelResult) {
     try {
          const workbook = XLSX.readFile(END_BOM_WORKBOOK_PATH);
          const sheetName = workbook.SheetNames[0];
          const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(workbook.Sheets[sheetName], { header: 1, defval: null });
          const headers = normalizeEndBomHeaders(rows[0] ?? []);
          rows[0] = headers;

          const modelNoColumn = headers.indexOf('Model no');
          const modelRows = rows.slice(1).filter((row) => String(row[modelNoColumn] ?? '').trim().length > 0);
          let rowIndex = modelRows.findIndex((row) => String(row[modelNoColumn] ?? '').trim() === result.modelNo);
          if (rowIndex === -1) {
               rowIndex = modelRows.length;
               modelRows[rowIndex] = [];
          }

          const row = modelRows[rowIndex] ?? [];
          setCell(row, headers, 'Model no', result.modelNo);
          setCell(row, headers, 'Processor', result.processor);
          setCell(row, headers, 'Memory', result.memory);
          setCell(row, headers, 'Start BOM UCID', result.startBomUcid);
          setCell(row, headers, 'End BOM UCID', result.endBomUcid);
          setCell(row, headers, 'Associate End BOM', result.associateEndBom);
          setCell(row, headers, 'Status', result.status);
          modelRows[rowIndex] = row;

          modelRows.forEach((currentRow, index) => {
               setCell(currentRow, headers, 'S.No', index + 1);
          });

          workbook.Sheets[sheetName] = XLSX.utils.aoa_to_sheet([headers, ...modelRows]);
          XLSX.writeFile(workbook, END_BOM_WORKBOOK_PATH);
          console.log('[INFO] End BOM validation workbook updated:', END_BOM_WORKBOOK_PATH);
     } catch (error) {
          console.log('[WARN] End BOM validation workbook update skipped:', getErrorMessage(error));
     }
}

function normalizeEndBomHeaders(existingHeaders: (string | number | null)[]) {
     const desiredHeaders = [
          'S.No',
          'Model no',
          'Processor',
          'Memory',
          'Start BOM UCID',
          'End BOM UCID',
          'Associate End BOM',
          'Status',
     ];
     const normalized = existingHeaders.map((header) => {
          const value = String(header ?? '').replace(/\s+/g, ' ').trim();
          if (/^End COM UCID$/i.test(value)) {
               return 'End BOM UCID';
          }
          if (/^Associate END BOM$/i.test(value)) {
               return 'Associate End BOM';
          }
          return value;
     });
     return desiredHeaders.map((header) => normalized.find((existingHeader) => existingHeader === header) ?? header);
}

function setCell(row: (string | number | null)[], headers: string[], header: string, value: string | number) {
     row[headers.indexOf(header)] = value;
}

function getErrorMessage(error: unknown) {
     return error instanceof Error ? error.message : String(error).split('\n')[0];
}

function escapeRegex(value: string) {
     return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

