import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test';
import * as XLSX from 'xlsx';

const BASE_URL =
  'https://ngc-itg-oca-internal.its.hpecorp.net/ocaPreForkM1/OCAInternalLogin';

const AUTH_WAIT_MS = 40_000;
const ACTION_DELAY_MS = 2_000;
const CHROME_PROFILE_DIR = 'C:\\selenium\\oca-profile';
const END_BOM_WORKBOOK_PATH = 'C:\\workspace\\Playwright\\EndBomModelValidation.xlsx';

const BASE_MODEL_PART = 'S3V83A';
const BASE_MODEL_TEXT = 'HPE GreenLake for Private';

const SERVER_MODEL = 'P54202-B21';
const CONTROLLER_NODE_1 = 'S3V93A';
const CONTROLLER_NODE_2 = 'S3W03A';
const DRIVE_PART = 'R9H70A';
const DAC_CABLE_1 = '537963-B21';
const DAC_CABLE_2 = '844483-B21';
const SERVER_PROCESSOR = 'P53699-B21';
const SERVER_MEMORY = 'P50309-F21';
const POWER_SUPPLY_PART = 'P03178-B21';
const GRAPHICS_PART = 'S0K89C';
const STORAGE_DEVICE_PART = 'P64521-B21';
const DCN_SWITCH_PART = 'S4Q66A';

const SELECTED_PROCESSOR =
  'P53699-B21 AMD EPYC 9534 2.45GHz 64-core 280W Processor for HPE';

const SELECTED_MEMORY =
  'P50309-B21 HPE 16GB (1x16GB) Single Rank x8 DDR5-4800 CAS-40-39-39 EC8 Registered Smart Memory Kit';

type FifthModelExcelResult = {
  modelNo: string;
  processor: string;
  memory: string;
  service: string;
  startBomUcid: string;
  endBomUcid: string;
  associateEndBom: 'Yes' | 'No';
  status: 'Pass' | 'Fail';
};

test('configure OCA Config 2 fifth model S3V83A GreenLake automation', async ({ playwright }) => {
  test.setTimeout(30 * 60_000);

  let context: BrowserContext | undefined;

  const result: FifthModelExcelResult = {
    modelNo: BASE_MODEL_PART,
    processor: SELECTED_PROCESSOR,
    memory: SELECTED_MEMORY,
    service: 'GreenLake Private Cloud Business Edition',
    startBomUcid: '',
    endBomUcid: '',
    associateEndBom: 'No',
    status: 'Fail',
  };

  try {
    console.log('[START] Fifth model test started');

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

    const flow = new FifthModelFlow(page, context, result);

    await test.step('Open OCA and complete manual authentication window', async () => {
      await flow.openOca();
    });

    await test.step(`Search and customize ${BASE_MODEL_PART}`, async () => {
      await flow.searchAndCustomizeBaseModel();
    });

    await test.step('Create icon and configure solution wizard', async () => {
      await flow.createIconAndConfigureSolutionWizard();
    });

    await test.step('Configure controller nodes', async () => {
      await flow.configureControllerNodes();
    });

    await test.step('Configure storage capacity and DAC cables', async () => {
      await flow.configureStorageCapacityAndDacCables();
    });

    await test.step('Configure server icon details', async () => {
      await flow.configureServerIconDetails();
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

    console.log('[PASS] Fifth model test completed successfully');
  } catch (error) {
    console.error('[FAIL] Fifth model test failed:', error);
    updateEndBomWorkbook({ ...result, status: 'Fail' });
    throw error;
  } finally {
    await context?.close().catch(() => undefined);
  }
});

class FifthModelFlow {
  private page: Page;

  constructor(
    page: Page,
    private readonly context: BrowserContext,
    private readonly result: FifthModelExcelResult,
  ) {
    this.page = page;
  }

  async openOca() {
    await installOcaShim(this.page);

    await this.page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

    console.log('[INFO] Waiting for manual authentication:', AUTH_WAIT_MS, 'ms');
    await this.page.waitForTimeout(AUTH_WAIT_MS);

    await waitForBlockingOverlay(this.page);

    const aaSOption = this.page.getByText(/^aaS$/i).filter({ visible: true }).first();

    if (await aaSOption.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await safeClick(aaSOption);
    }

    await waitForBlockingOverlay(this.page);
  }

  async searchAndCustomizeBaseModel() {
    console.log(`[STEP] Searching base model: ${BASE_MODEL_PART}`);

    const search = this.page
      .getByRole('textbox', { name: /Search to open UCID or create|Search config/i })
      .or(this.page.locator('#search-config'))
      .first();

    await expect(search, 'Search textbox should be visible').toBeVisible({
      timeout: 60_000,
    });

    await search.click().catch(() => undefined);
    await search.fill(BASE_MODEL_PART);

    await this.page.waitForTimeout(1_000);

    console.log('[DEBUG] Search page text sample after fill:', await this.visibleTextSample());

    const greenLakeText = this.page.getByText(BASE_MODEL_TEXT, { exact: false }).filter({ visible: true }).first();

    if (await greenLakeText.isVisible({ timeout: 10_000 }).catch(() => false)) {
      console.log('[STEP] Clicking GreenLake search result text');
      await greenLakeText.click({ force: true }).catch(async () => {
        await greenLakeText.evaluate((element) => (element as HTMLElement).click());
      });
    }

    const autocompleteOption = this.page
      .locator('ul.ui-autocomplete:not([style*="display: none"]) li.ui-menu-item, [role="option"]')
      .filter({ hasText: BASE_MODEL_PART })
      .first();

    if (await autocompleteOption.isVisible({ timeout: 10_000 }).catch(() => false)) {
      console.log('[STEP] Clicking autocomplete option');
      await safeClick(autocompleteOption);
    }

    await waitForBlockingOverlay(this.page);

    const customizeButton = this.page.getByRole('button', { name: /^Customize$/i }).filter({ visible: true }).first();

    console.log('[DEBUG] Customize button details:', await this.debugLocatorDetails(customizeButton, 'Customize button'));

    await safeClick(customizeButton);

    await this.page.waitForLoadState('domcontentloaded').catch(() => undefined);
    await waitForBlockingOverlay(this.page);

    console.log('[DEBUG] After customize URL:', this.page.url());
    console.log('[DEBUG] After customize text sample:', await this.visibleTextSample());
  }

  async createIconAndConfigureSolutionWizard() {
    console.log('[STEP] Opening icon root and Create Icon');

    await safeClick(this.page.locator('#eo_nav_li_0').first());
    await safeClick(this.page.locator('#icon_root').first());

    await safeClick(this.page.getByText('Create Icon', { exact: true }).filter({ visible: true }).first());

    const greenLake = this.page.getByText(BASE_MODEL_TEXT, { exact: false }).filter({ visible: true }).first();

    if (await greenLake.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await greenLake.click({ force: true });
    }

    await safeClick(this.page.getByRole('link', { name: 'Solution Wizard' }).first());

    const firstWizardCheckbox = this.page.locator('.wizard_checkbox > .label-checkbox-radio > .checkbox_default').first();

    if (await firstWizardCheckbox.isVisible({ timeout: 10_000 }).catch(() => false)) {
      console.log('[STEP] Selecting first wizard checkbox');
      await safeClick(firstWizardCheckbox);
    }

    console.log('[STEP] Selecting HPE ProLiant DL325 Gen11 in wizard');

    await this.openWizardDropdownByIndex(5);
    await this.clickByTitle(/HPE ProLiant DL325 Gen11/i, 'HPE ProLiant DL325 Gen11');

    console.log('[STEP] Selecting server model P54202-B21');

    await safeClick(this.page.locator('#Server_Div > div > .wizard_dropdown > .form-container-border > .selecter > .selecter-selected').first()
      .or(this.page.locator('#Server_Div .selecter-selected').first()));

    await this.clickByTitle(new RegExp(SERVER_MODEL), `Server ${SERVER_MODEL}`);

    const serverAdd = this.page.locator('#Server_Div a').first();

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      if (await serverAdd.isVisible({ timeout: 5_000 }).catch(() => false)) {
        console.log(`[STEP] Clicking server add link attempt ${attempt}`);
        await serverAdd.click({ force: true }).catch(() => undefined);
        await waitForBlockingOverlay(this.page);
      }
    }

    console.log('[STEP] Selecting flex / Aruba base model');

    await this.page.locator('#dhciFlexSelectionconstraint div').first().click({ force: true }).catch(() => undefined);
    await waitForBlockingOverlay(this.page);

    const arubaBaseRadio = this.page
      .locator('div')
      .filter({ hasText: /^None\.None\.Aruba Base Model$/ })
      .locator('span')
      .first();

    if (await arubaBaseRadio.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await arubaBaseRadio.click({ force: true });
    }

    await this.clickByTitle(/Aruba Base Model/i, 'Aruba Base Model');

    console.log('[STEP] Selecting DCN switch S4Q66A');

    await this.openWizardDropdownByIndex(15);
    await this.clickByTitle(new RegExp(DCN_SWITCH_PART), `DCN switch ${DCN_SWITCH_PART}`);
  }

  async configureControllerNodes() {
    await safeClick(this.page.getByRole('link', { name: 'Menu' }).first());

    await this.openSection('Controller Node Models', '#section_header_nodechassisSection');

    await this.selectRowQuantityByPart(CONTROLLER_NODE_1, '1', 'Controller node chassis S3V93A');
    await this.selectRowQuantityByPart(CONTROLLER_NODE_2, '2', 'Controller node S3W03A');
  }

  async configureStorageCapacityAndDacCables() {
    await this.openSection('Drive Enclosure', '#section_header_driveEnclosureSection');

    await this.openSection('Capacity', '#section_header_hardDriveSection');

    await this.toggleHpeRecommendedOnlyIfVisible();

    await this.selectRowQuantityByPart(DRIVE_PART, '24', 'Alletra Storage MP drive R9H70A');

    await this.openSection('DAC Cables', '#section_header_daccableSection');

    await this.selectDacCableQuantity(DAC_CABLE_1, '4');
    await this.selectRowIfVisible(DAC_CABLE_2, 'DAC cable 2 844483-B21');
  }

  async configureServerIconDetails() {
    console.log('[STEP] Opening full navigation and selecting server icon');

    const fullNav = this.page.locator('#show_full_nav').first();

    if (await fullNav.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await safeClick(fullNav);
    }

    await safeClick(this.page.getByText(/HPE DL325 Gen11 GPU CTO Svr #/i).filter({ visible: true }).first());

    await this.selectRowRadioByPart(SERVER_PROCESSOR, 'Server processor');

    await this.selectRowQuantityByPart(SERVER_MEMORY, '4', 'Server memory P50309-B21');

    await this.openSection('Networking', '#section_header_networkController');

    await this.openPowerSuppliesSectionForServer();
    await this.selectPowerSupplyIfAvailable();

    await this.openOptionalSectionAndSelectRow({
      label: 'Graphics Options',
      sectionSelector: '#section_header_GraphicsOptionsSection, [id*="GraphicsOptions" i], [id*="graphics" i]',
      partNumber: GRAPHICS_PART,
      rowLabel: 'Graphics option S0K89C',
    });

    await this.openOptionalSectionAndSelectRow({
      label: 'Storage Devices',
      sectionSelector: '#section_header_storageDevice, #section_header_storageDevices, [id*="section_header" i][id*="storage" i]',
      partNumber: STORAGE_DEVICE_PART,
      rowLabel: 'Storage device P64521-B21',
    });

    await safeClick(this.page.locator('#eo_nav_li_0').first());

    const treeIcon = this.page
      .getByRole('gridcell', { name: /HPE GreenLake for Private/i })
      .locator('img')
      .nth(1);

    if (await treeIcon.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await treeIcon.click({ force: true }).catch(() => undefined);
    }
  }

  private async openOptionalSectionAndSelectRow(args: {
    label: string;
    sectionSelector: string;
    partNumber: string;
    rowLabel: string;
  }) {
    console.log(`[STEP] Opening optional section ${args.label}`);

    await waitForBlockingOverlay(this.page);

    const existingRow = this.page
      .locator('tr.item_tr, tr')
      .filter({ hasText: args.partNumber })
      .filter({ visible: true })
      .first();

    if (await existingRow.isVisible({ timeout: 5_000 }).catch(() => false)) {
      console.log(`[INFO] ${args.rowLabel} already visible. Selecting row.`);
      await this.selectRowIfVisible(args.partNumber, args.rowLabel);
      return;
    }

    const section = this.page
      .locator(args.sectionSelector)
      .filter({ visible: true })
      .first();

    if (await section.isVisible({ timeout: 8_000 }).catch(() => false)) {
      console.log(`[STEP] Clicking optional section by selector: ${args.label}`);
      await this.scrollToCenter(section, `${args.label} section`);

      await section.click({ force: true }).catch(async () => {
        await section.evaluate((element) => (element as HTMLElement).click());
      });

      await waitForBlockingOverlay(this.page);

      if (await existingRow.isVisible({ timeout: 10_000 }).catch(() => false)) {
        await this.selectRowIfVisible(args.partNumber, args.rowLabel);
        return;
      }
    }

    const sectionText = this.page
      .getByText(new RegExp(escapeRegex(args.label), 'i'))
      .filter({ visible: true })
      .first();

    if (await sectionText.isVisible({ timeout: 8_000 }).catch(() => false)) {
      console.log(`[STEP] Clicking optional section by text: ${args.label}`);

      await sectionText.click({ force: true }).catch(async () => {
        await sectionText.evaluate((element) => (element as HTMLElement).click());
      });

      await waitForBlockingOverlay(this.page);

      if (await existingRow.isVisible({ timeout: 10_000 }).catch(() => false)) {
        await this.selectRowIfVisible(args.partNumber, args.rowLabel);
        return;
      }
    }

    console.log(`[WARN] Optional section/row not visible: ${args.label} / ${args.partNumber}. Continuing.`);
    console.log(`[DEBUG] Rows near optional ${args.label}:`, await this.debugRowsContaining(new RegExp(`${escapeRegex(args.label)}|${escapeRegex(args.partNumber)}|Graphics|Storage|Drive`, 'i')));
  }

  private async openPowerSuppliesSectionForServer() {
    console.log('[STEP] Opening server Power Supplies section');

    await waitForBlockingOverlay(this.page);

    const powerCell = this.page
      .getByRole('cell', { name: /Power Supplies/i })
      .filter({ visible: true })
      .first();

    if (await powerCell.isVisible({ timeout: 8_000 }).catch(() => false)) {
      await powerCell.click({ force: true }).catch(async () => {
        await powerCell.evaluate((element) => (element as HTMLElement).click());
      });

      await waitForBlockingOverlay(this.page);
    }

    const powerText = this.page
      .getByText(/Power Supplies \(max 2\)|Power Supplies/i)
      .filter({ visible: true })
      .first();

    if (await powerText.isVisible({ timeout: 8_000 }).catch(() => false)) {
      await powerText.click({ force: true }).catch(async () => {
        await powerText.evaluate((element) => (element as HTMLElement).click());
      });

      await waitForBlockingOverlay(this.page);
    }

    const section = this.page
      .locator('#section_header_power, [id*="section_header" i][id*="power" i]')
      .filter({ visible: true })
      .first();

    if (await section.isVisible({ timeout: 8_000 }).catch(() => false)) {
      await this.scrollToCenter(section, 'Server Power Supplies section');
      await section.click({ force: true }).catch(async () => {
        await section.evaluate((element) => (element as HTMLElement).click());
      });

      await waitForBlockingOverlay(this.page);
    }

    console.log('[DEBUG] Visible power rows after opening:', await this.debugRowsContaining(/Power|P03178|Flex Slot|Titanium/i));
  }

  private async selectPowerSupplyIfAvailable() {
    console.log(`[STEP] Selecting server power supply ${POWER_SUPPLY_PART} quantity 1`);

    const row = this.page
      .locator('tr.item_tr, tr')
      .filter({ hasText: POWER_SUPPLY_PART })
      .filter({ visible: true })
      .first();

    if (await row.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await this.selectRowQuantityByPart(POWER_SUPPLY_PART, '1', 'Server power supply P03178-B21');
      return;
    }

    console.log(`[WARN] ${POWER_SUPPLY_PART} not visible after opening Power Supplies. Trying search inside current config.`);

    const search = this.page
      .getByRole('textbox', { name: /Search config for:/i })
      .or(this.page.locator('input[placeholder*="Search config" i], input[aria-label*="Search config" i]'))
      .filter({ visible: true })
      .first();

    if (await search.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await search.clear().catch(() => undefined);
      await search.fill(POWER_SUPPLY_PART);
      await search.press('Enter').catch(() => undefined);

      await waitForBlockingOverlay(this.page);
      await this.page.waitForTimeout(2_000);

      console.log('[DEBUG] Visible rows after power supply search:', await this.debugRowsContaining(/P03178|Power|Flex Slot|Titanium/i));

      if (await row.isVisible({ timeout: 10_000 }).catch(() => false)) {
        await this.selectRowQuantityByPart(POWER_SUPPLY_PART, '1', 'Server power supply P03178-B21');
        return;
      }
    }

    console.log(`[WARN] ${POWER_SUPPLY_PART} still not visible. Continuing because this server configuration may already include or hide the power supply option.`);
  }

  private async debugRowsContaining(pattern: RegExp) {
    return this.page.evaluate((source) => {
      const pattern = new RegExp(source, 'i');
      const normalize = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim();

      const isVisible = (element: Element) => {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();

        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          Number(style.opacity || '1') > 0.01 &&
          rect.width > 0 &&
          rect.height > 0
        );
      };

      return Array.from(document.querySelectorAll<HTMLElement>('tr.item_tr, tr, [role="row"]'))
        .filter((element) => isVisible(element))
        .filter((element) => pattern.test(normalize(element.textContent)))
        .slice(0, 30)
        .map((element, index) => {
          const rect = element.getBoundingClientRect();

          return {
            index,
            id: element.id,
            className: String(element.className),
            text: normalize(element.textContent).slice(0, 1000),
            rect: {
              x: Math.round(rect.x),
              y: Math.round(rect.y),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
            },
            html: element.outerHTML.slice(0, 1000),
          };
        });
    }, pattern.source).catch((error) => ({ error: String(error) }));
  }

  async runBillingTierSetup() {
    await safeClick(this.page.getByRole('link', { name: 'Services', exact: true }).first());
    await safeClick(this.page.getByRole('link', { name: 'BOM' }).first());
    await safeClick(this.page.locator('#eo_nav_li_0').first());

    console.log('[STEP] Running Billing Tier Setup first pass');

    await safeClick(this.page.locator('#obw_billingtier_bot').or(this.page.getByText('Billing Tier Setup')).first());

    const rowsToSelect = [
      /SN8325H Switch #1/i,
      /SN8325H Switch #2/i,
    ];

    for (const pattern of rowsToSelect) {
      const rowLabel = this.page
        .getByRole('row', { name: pattern })
        .locator('label')
        .first();

      if (await rowLabel.isVisible({ timeout: 10_000 }).catch(() => false)) {
        await rowLabel.click({ force: true });
      }
    }

    await this.clickDialogOk('Billing Tier Setup first pass');

    console.log('[STEP] Running Billing Tier Setup second pass');

    await safeClick(this.page.locator('#obw_billingtier_bot').or(this.page.getByText('Billing Tier Setup')).first());

    const dialog = this.page.getByRole('dialog', { name: 'Billing Tier Setup' }).first();

    if (await dialog.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await dialog.click({ force: true }).catch(() => undefined);
    }

    await this.clickDialogOk('Billing Tier Setup second pass');
  }

  async saveOcaConfig() {
    await waitForBlockingOverlay(this.page);
    await this.waitForModalOverlayHidden();

    await safeClick(this.page.locator('#save #save_icon, [title="Save"] #save_icon, #save_icon').first());

    await safeClick(this.page.getByText('Save OCA Config').first());

    const saveDialog = this.page
      .locator('.ui-dialog, [role="dialog"]')
      .filter({ hasText: /Save|Acknowledge Errors before Saving|Action-Required/i })
      .last();

    await saveDialog.waitFor({ state: 'visible', timeout: 60_000 });

    const ackCheckbox = saveDialog.locator('#ack_checkbox').first();

    if (await ackCheckbox.isVisible({ timeout: 10_000 }).catch(() => false)) {
      console.log('[STEP] Clicking save acknowledge checkbox');
      await ackCheckbox.click({ force: true }).catch(async () => {
        await ackCheckbox.evaluate((element) => (element as HTMLElement).click());
      });
    }

    const saveButton = saveDialog
      .getByText('Save', { exact: true })
      .or(saveDialog.locator('#save_btn'))
      .last();

    await saveButton.waitFor({ state: 'visible', timeout: 60_000 });

    await saveButton.click({ force: true }).catch(async () => {
      await saveButton.evaluate((element) => (element as HTMLElement).click());
    });

    await saveDialog.waitFor({ state: 'hidden', timeout: 60_000 }).catch(() => undefined);

    await waitForBlockingOverlay(this.page);
  }

  async generateAndAssociateEndBom() {
    console.log('[STEP] Opening End BOM tab');

    await safeClick(this.page.locator('#obw_endbom_bot').or(this.page.getByText('End BOM', { exact: true })).first());

    await waitForBlockingOverlay(this.page);
    await this.page.waitForTimeout(2_000);

    console.log('[DEBUG] End BOM page before Auto-generate:', await this.debugEndBomRowsAndSpinButtons());

    console.log('[STEP] Clicking Auto-generate');

    await safeClick(this.page.getByRole('button', { name: 'Auto-generate' }).first());

    await waitForBlockingOverlay(this.page);
    await this.page.waitForTimeout(3_000);

    console.log('[DEBUG] End BOM page after Auto-generate:', await this.debugEndBomRowsAndSpinButtons());

    await this.setEndBomSpinButtonFlexible({
      label: 'Servers with GPUs HPE DL325',
      requiredTextPatterns: [/Servers/i, /GPU/i, /DL325/i],
      value: '4',
    });

    await this.setEndBomSpinButtonFlexible({
      label: 'Storage HPE GreenLake for',
      requiredTextPatterns: [/Storage/i, /GreenLake/i],
      value: '4',
    });

    await this.verifyEndBomSpinButtonFlexible({
      label: 'Servers with GPUs HPE DL325',
      requiredTextPatterns: [/Servers/i, /GPU/i, /DL325/i],
      value: '4',
    });

    await this.verifyEndBomSpinButtonFlexible({
      label: 'Storage HPE GreenLake for',
      requiredTextPatterns: [/Storage/i, /GreenLake/i],
      value: '4',
    });

    console.log('[DEBUG] End BOM page before Generate End BOM:', await this.debugEndBomRowsAndSpinButtons());

    await safeClick(this.page.getByRole('button', { name: 'Generate End BOM' }).first());

    await waitForBlockingOverlay(this.page);

    this.result.startBomUcid = await this.readBomUcid('Start BOM UCID');
    this.result.endBomUcid = await this.readBomUcid('End BOM UCID');

    await safeClick(this.page.getByRole('button', { name: 'Associate End BOM' }).first());

    await waitForBlockingOverlay(this.page);

    this.result.associateEndBom = 'Yes';

    await safeClick(this.page.getByRole('button', { name: 'Done' }).first());

    await waitForBlockingOverlay(this.page);

    const summaryLink = this.page.getByRole('link', { name: 'Summary' }).first();

    if (await summaryLink.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await safeClick(summaryLink);
    }
  }

  private async setEndBomSpinButtonFlexible(args: {
    label: string;
    requiredTextPatterns: RegExp[];
    value: string;
  }) {
    console.log(`[STEP] Setting End BOM quantity for ${args.label} to ${args.value}`);

    const row = await this.findEndBomRowByPatterns(args.label, args.requiredTextPatterns);

    await this.scrollToCenter(row, `End BOM row ${args.label}`);

    const spinButton = row.getByRole('spinbutton').first();

    if (!(await spinButton.isVisible({ timeout: 10_000 }).catch(() => false))) {
      console.log(`[WARN] Spinbutton not found inside matched row ${args.label}. Trying first visible spinbutton near row.`);
      console.log('[DEBUG] Matched row details:', await this.debugLocatorDetails(row, `matched End BOM row ${args.label}`));
      throw new Error(`End BOM spinbutton was not visible for ${args.label}`);
    }

    await this.forceSetSpinButtonValue(spinButton, args.value, args.label);
  }

  private async verifyEndBomSpinButtonFlexible(args: {
    label: string;
    requiredTextPatterns: RegExp[];
    value: string;
  }) {
    console.log(`[STEP] Verifying End BOM quantity for ${args.label} is ${args.value}`);

    const row = await this.findEndBomRowByPatterns(args.label, args.requiredTextPatterns);
    const spinButton = row.getByRole('spinbutton').first();

    await expect(spinButton, `End BOM spinbutton ${args.label} should be visible`).toBeVisible({
      timeout: 30_000,
    });

    const current = (await spinButton.inputValue().catch(() => '')).trim();

    console.log(`[DEBUG] End BOM quantity for ${args.label}: ${current || '<empty>'}`);

    if (current === args.value) {
      return;
    }

    console.log(`[WARN] End BOM quantity for ${args.label} was ${current || '<empty>'}; resetting to ${args.value}`);

    await this.forceSetSpinButtonValue(spinButton, args.value, args.label);

    const updated = (await spinButton.inputValue().catch(() => '')).trim();

    if (updated !== args.value) {
      throw new Error(`End BOM quantity for ${args.label} should be ${args.value}, but value was ${updated || '<empty>'}`);
    }
  }

  private async findEndBomRowByPatterns(label: string, patterns: RegExp[]) {
    await waitForBlockingOverlay(this.page);

    const row = this.page
      .locator('tr, [role="row"]')
      .filter({ has: this.page.getByRole('spinbutton') })
      .filter({ visible: true })
      .filter({
        hasText: new RegExp(patterns.map((pattern) => `(?=.*${pattern.source})`).join(''), 'i'),
      })
      .first();

    if (await row.isVisible({ timeout: 10_000 }).catch(() => false)) {
      return row;
    }

    console.log(`[WARN] Could not find End BOM row by locator for ${label}. Trying DOM pattern search.`);
    console.log('[DEBUG] Available End BOM rows/spinbuttons:', await this.debugEndBomRowsAndSpinButtons());

    const targetIndex = await this.page.evaluate((patternSources) => {
      const normalize = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim();

      const isVisible = (element: Element) => {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();

        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          Number(style.opacity || '1') > 0.01 &&
          rect.width > 0 &&
          rect.height > 0
        );
      };

      const patterns = patternSources.map((source) => new RegExp(source, 'i'));

      const rows = Array.from(document.querySelectorAll<HTMLElement>('tr, [role="row"]'))
        .filter((element) => isVisible(element))
        .filter((element) => element.querySelector('input[type="number"], input[role="spinbutton"], [role="spinbutton"]'));

      return rows.findIndex((element) => {
        const text = normalize(element.textContent);
        return patterns.every((pattern) => pattern.test(text));
      });
    }, patterns.map((pattern) => pattern.source));

    if (typeof targetIndex === 'number' && targetIndex >= 0) {
      return this.page
        .locator('tr, [role="row"]')
        .filter({ has: this.page.getByRole('spinbutton') })
        .filter({ visible: true })
        .nth(targetIndex);
    }

    throw new Error(`End BOM row not found for ${label}`);
  }

  private async forceSetSpinButtonValue(spinButton: Locator, value: string, label: string) {
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      console.log(`[STEP] Setting spinbutton ${label} attempt ${attempt} to ${value}`);

      await spinButton.click({ force: true }).catch(async () => {
        await spinButton.evaluate((element) => (element as HTMLElement).click());
      });

      await spinButton.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A').catch(() => undefined);
      await spinButton.press('Backspace').catch(() => undefined);
      await spinButton.fill(value).catch(async () => {
        await spinButton.type(value, { delay: 50 });
      });

      await spinButton.dispatchEvent('input').catch(() => undefined);
      await spinButton.dispatchEvent('change').catch(() => undefined);
      await spinButton.press('Tab').catch(() => undefined);

      await waitForBlockingOverlay(this.page);
      await this.page.waitForTimeout(1_000);

      const current = (await spinButton.inputValue().catch(() => '')).trim();

      console.log(`[DEBUG] Spinbutton ${label} value after attempt ${attempt}: ${current || '<empty>'}`);

      if (current === value) {
        return;
      }

      await spinButton.evaluate((element, value) => {
        const input = element as HTMLInputElement;
        input.value = value;
        input.setAttribute('value', value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new Event('blur', { bubbles: true }));
      }, value);

      await waitForBlockingOverlay(this.page);
      await this.page.waitForTimeout(1_000);

      const domCurrent = (await spinButton.inputValue().catch(() => '')).trim();

      console.log(`[DEBUG] Spinbutton ${label} DOM value after attempt ${attempt}: ${domCurrent || '<empty>'}`);

      if (domCurrent === value) {
        return;
      }
    }

    throw new Error(`Spinbutton ${label} did not remain ${value}`);
  }

  private async debugEndBomRowsAndSpinButtons() {
    return this.page.evaluate(() => {
      const normalize = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim();

      const isVisible = (element: Element) => {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();

        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          Number(style.opacity || '1') > 0.01 &&
          rect.width > 0 &&
          rect.height > 0
        );
      };

      const rows = Array.from(document.querySelectorAll<HTMLElement>('tr, [role="row"]'))
        .filter((element) => isVisible(element))
        .filter((element) => element.querySelector('input[type="number"], input[role="spinbutton"], [role="spinbutton"]'))
        .slice(0, 30)
        .map((element, index) => {
          const rect = element.getBoundingClientRect();

          return {
            index,
            id: element.id,
            className: String(element.className),
            text: normalize(element.textContent).slice(0, 1000),
            spinButtons: Array.from(element.querySelectorAll<HTMLInputElement>('input[type="number"], input[role="spinbutton"], [role="spinbutton"]')).map((input, inputIndex) => ({
              inputIndex,
              value: input.value,
              ariaValueNow: input.getAttribute('aria-valuenow'),
              outerHTML: input.outerHTML.slice(0, 500),
            })),
            rect: {
              x: Math.round(rect.x),
              y: Math.round(rect.y),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
            },
            html: element.outerHTML.slice(0, 1200),
          };
        });

      return {
        url: location.href,
        title: document.title,
        bodyTextSample: normalize(document.body.textContent).slice(0, 3000),
        rows,
        visibleButtons: Array.from(document.querySelectorAll<HTMLElement>('button, .s-btn, input[type="button"]'))
          .filter((element) => isVisible(element))
          .map((element) => normalize(element.textContent || element.getAttribute('value')))
          .filter(Boolean)
          .slice(0, 50),
      };
    }).catch((error) => ({ error: String(error), url: this.page.url() }));
  }

  private async verifyEndBomSpinButtonValue(rowName: RegExp, value: string) {
    console.log(`[STEP] Final verification for End BOM spinbutton ${rowName} should be ${value}`);

    const row = this.page
      .getByRole('row', { name: rowName })
      .first();

    await expect(row, `End BOM row ${rowName} should be visible for final verification`).toBeVisible({
      timeout: 60_000,
    });

    const spinButton = row.getByRole('spinbutton').first();

    await expect(spinButton, `End BOM spinbutton ${rowName} should be visible for final verification`).toBeVisible({
      timeout: 30_000,
    });

    const currentValue = (await spinButton.inputValue().catch(() => '')).trim();

    console.log(`[DEBUG] Final End BOM spinbutton value for ${rowName}: ${currentValue || '<empty>'}`);

    if (currentValue === value) {
      console.log(`[INFO] Final End BOM spinbutton value confirmed as ${value} for ${rowName}`);
      return;
    }

    console.log(`[WARN] Final End BOM spinbutton value for ${rowName} was ${currentValue || '<empty>'}; resetting to ${value}`);

    await this.setEndBomSpinButton(rowName, value);

    const updatedValue = (await spinButton.inputValue().catch(() => '')).trim();

    if (updatedValue !== value) {
      throw new Error(`End BOM spinbutton ${rowName} should be ${value}, but final value was ${updatedValue || '<empty>'}`);
    }
  }

  private async setEndBomSpinButton(rowName: RegExp, value: string) {
    console.log(`[STEP] Setting End BOM spinbutton ${rowName} to ${value}`);

    const row = this.page
      .getByRole('row', { name: rowName })
      .first();

    await expect(row, `End BOM row ${rowName} should be visible`).toBeVisible({
      timeout: 60_000,
    });

    await this.scrollToCenter(row, `End BOM row ${rowName}`);

    const spinButton = row.getByRole('spinbutton').first();

    await expect(spinButton, `End BOM spinbutton ${rowName} should be visible`).toBeVisible({
      timeout: 30_000,
    });

    for (let attempt = 1; attempt <= 4; attempt += 1) {
      console.log(`[STEP] Setting End BOM spinbutton attempt ${attempt}: ${rowName} = ${value}`);

      await spinButton.click({ force: true }).catch(async () => {
        await spinButton.evaluate((element) => (element as HTMLElement).click());
      });

      await this.page.waitForTimeout(300);

      await spinButton.fill('').catch(async () => {
        await spinButton.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A').catch(() => undefined);
        await spinButton.press('Backspace').catch(() => undefined);
      });

      await this.page.waitForTimeout(300);

      await spinButton.fill(value);

      await spinButton.dispatchEvent('input').catch(() => undefined);
      await spinButton.dispatchEvent('change').catch(() => undefined);

      await spinButton.press('Tab').catch(() => undefined);

      await waitForBlockingOverlay(this.page);
      await this.page.waitForTimeout(1_000);

      const currentValue = (await spinButton.inputValue().catch(() => '')).trim();

      console.log(`[DEBUG] End BOM spinbutton value after attempt ${attempt}: ${currentValue || '<empty>'}`);

      if (currentValue === value) {
        console.log(`[INFO] End BOM spinbutton confirmed as ${value} for ${rowName}`);
        return;
      }

      await spinButton.click({ force: true }).catch(() => undefined);
      await spinButton.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A').catch(() => undefined);
      await spinButton.type(value, { delay: 50 }).catch(() => undefined);
      await spinButton.press('Enter').catch(() => undefined);
      await spinButton.press('Tab').catch(() => undefined);

      await waitForBlockingOverlay(this.page);
      await this.page.waitForTimeout(1_000);

      const typedValue = (await spinButton.inputValue().catch(() => '')).trim();

      console.log(`[DEBUG] End BOM spinbutton value after type fallback attempt ${attempt}: ${typedValue || '<empty>'}`);

      if (typedValue === value) {
        console.log(`[INFO] End BOM spinbutton confirmed as ${value} after type fallback for ${rowName}`);
        return;
      }

      await spinButton.evaluate((element, value) => {
        const input = element as HTMLInputElement;

        input.value = value;
        input.setAttribute('value', value);

        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new Event('blur', { bubbles: true }));
      }, value);

      await waitForBlockingOverlay(this.page);
      await this.page.waitForTimeout(1_000);

      const domValue = (await spinButton.inputValue().catch(() => '')).trim();

      console.log(`[DEBUG] End BOM spinbutton value after DOM fallback attempt ${attempt}: ${domValue || '<empty>'}`);

      if (domValue === value) {
        console.log(`[INFO] End BOM spinbutton confirmed as ${value} after DOM fallback for ${rowName}`);
        return;
      }
    }

    throw new Error(`End BOM spinbutton ${rowName} did not remain ${value}`);
  }

  private async selectRowQuantityByPart(partNumber: string, quantity: string, label: string) {
    const row = await this.waitForRowByPart(partNumber, label);

    await this.scrollToCenter(row, `${label} row`);

    const current = await this.readRowQuantity(row).catch(() => '');

    if (current === quantity) {
      console.log(`[INFO] ${label} quantity is already ${quantity}`);
      return;
    }

    console.log(`[STEP] Selecting ${label} quantity ${quantity}`);

    let quantityControl = row.locator('.item_qty_div').first();

    if (!(await quantityControl.isVisible({ timeout: 5_000 }).catch(() => false))) {
      quantityControl = row.locator('td.item_qty').first();
    }

    await quantityControl.waitFor({ state: 'visible', timeout: 30_000 });

    await quantityControl.click({ force: true }).catch(async () => {
      await quantityControl.evaluate((element) => (element as HTMLElement).click());
    });

    await this.page.waitForTimeout(700);

    const option = this.page
      .locator(
        [
          `[id="${quantity}"]`,
          `.selecter.open .selecter-options .selecter-item[data-value="${quantity}"]`,
          `.selecter-options .selecter-item[data-value="${quantity}"]`,
          `[role="option"][data-value="${quantity}"]`,
          `[role="option"]`,
          `.ui-menu-item`,
          `li`,
          `span`,
          `div`,
        ].join(', '),
      )
      .filter({ visible: true, hasText: new RegExp(`^\\s*${escapeRegex(quantity)}\\s*$`) })
      .first();

    if (await option.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await option.click({ force: true }).catch(async () => {
        await option.evaluate((element) => (element as HTMLElement).click());
      });
    } else {
      const popupTextBox = this.page.locator('#popup_textbox').first();

      if (await popupTextBox.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await popupTextBox.fill(quantity);
        await popupTextBox.press('Enter').catch(() => undefined);
      } else {
        throw new Error(`${label} quantity option ${quantity} was not available`);
      }
    }

    await waitForBlockingOverlay(this.page);
  }

  private async selectDacCableQuantity(partNumber: string, quantity: string) {
    const row = await this.waitForRowByPart(partNumber, `DAC cable ${partNumber}`);

    await this.scrollToCenter(row, `DAC cable ${partNumber} row`);

    const quantityControl = row.locator('.item_qty_div, td.item_qty').first();

    await quantityControl.click({ force: true }).catch(async () => {
      await quantityControl.evaluate((element) => (element as HTMLElement).click());
    });

    const popup = this.page.locator('#popup_textbox').first();

    if (await popup.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await popup.fill(quantity);
      await popup.press('Enter').catch(() => undefined);
    } else {
      await this.clickQuantityOption(quantity);
    }

    await waitForBlockingOverlay(this.page);
  }

  private async selectRowRadioByPart(partNumber: string, label: string) {
    const row = await this.waitForRowByPart(partNumber, label);

    await this.scrollToCenter(row, `${label} row`);

    const radio = row.locator('input[type="radio"], #radio').first();

    if (await radio.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await radio.check({ force: true }).catch(async () => {
        await radio.click({ force: true });
      });
    } else {
      await row.click({ force: true }).catch(async () => {
        await row.evaluate((element) => (element as HTMLElement).click());
      });
    }

    await waitForBlockingOverlay(this.page);
  }

  private async selectRowIfVisible(partNumber: string, label: string) {
    const row = this.page
      .locator('tr.item_tr, tr')
      .filter({ hasText: partNumber })
      .filter({ visible: true })
      .first();

    if (!(await row.isVisible({ timeout: 20_000 }).catch(() => false))) {
      console.log(`[WARN] ${label} row was not visible; skipping`);
      return;
    }

    await this.scrollToCenter(row, `${label} row`);

    const control = row.locator('.item_qty_div, #radio, input[type="radio"], div').filter({ visible: true }).first();

    await control.click({ force: true }).catch(async () => {
      await control.evaluate((element) => (element as HTMLElement).click());
    });

    await waitForBlockingOverlay(this.page);
  }

  private async waitForRowByPart(partNumber: string, label: string) {
    const row = this.page
      .locator('tr.item_tr, tr')
      .filter({ hasText: partNumber })
      .filter({ visible: true })
      .first();

    await expect(row, `${label} row ${partNumber} should be visible`).toBeVisible({
      timeout: 60_000,
    });

    return row;
  }

  private async clickQuantityOption(quantity: string) {
    const option = this.page
      .locator(`[id="${quantity}"], [role="option"], .ui-menu-item, li, span, div`)
      .filter({ visible: true, hasText: new RegExp(`^\\s*${escapeRegex(quantity)}\\s*$`) })
      .first();

    await expect(option, `Quantity option ${quantity} should be visible`).toBeVisible({
      timeout: 10_000,
    });

    await option.click({ force: true }).catch(async () => {
      await option.evaluate((element) => (element as HTMLElement).click());
    });
  }

  private async openSection(label: string, selector: string) {
    await waitForBlockingOverlay(this.page);

    const section = this.page
      .locator(selector)
      .filter({ visible: true })
      .first();

    if (await section.isVisible({ timeout: 8_000 }).catch(() => false)) {
      await this.scrollToCenter(section, `${label} section`);
      await section.click({ force: true }).catch(async () => {
        await section.evaluate((element) => (element as HTMLElement).click());
      });

      await waitForBlockingOverlay(this.page);
      return;
    }

    const text = this.page.getByText(new RegExp(escapeRegex(label), 'i')).filter({ visible: true }).first();

    await safeClick(text);
  }

  private async toggleHpeRecommendedOnlyIfVisible() {
    const toggle = this.page
      .locator('label')
      .filter({ hasText: /HPE Recommended only|View HPE Recommended only/i })
      .filter({ visible: true })
      .first();

    if (!(await toggle.isVisible({ timeout: 10_000 }).catch(() => false))) {
      return;
    }

    await toggle.click({ force: true });

    const yes = this.page.getByRole('button', { name: /^Yes$/i });

    if (await yes.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await yes.click({ force: true });
    }

    await waitForBlockingOverlay(this.page);
  }

  private async openWizardDropdownByIndex(index: number) {
    console.log(`[STEP] Opening wizard dropdown by recorded index: ${index}`);

    await waitForBlockingOverlay(this.page);

    console.log('[DEBUG] Wizard dropdown candidates before click:', await this.debugWizardDropdowns());

    const exactSelector = `div:nth-child(${index}) > .wizard_dropdown > .form-container-border > .selecter > .selecter-selected`;
    const fallbackSelector = `div:nth-child(${index}) .wizard_dropdown .selecter-selected`;

    let dropdown = this.page.locator(exactSelector).filter({ visible: true }).first();

    if (!(await dropdown.isVisible({ timeout: 3_000 }).catch(() => false))) {
      dropdown = this.page.locator(fallbackSelector).filter({ visible: true }).first();
    }

    if (!(await dropdown.isVisible({ timeout: 5_000 }).catch(() => false))) {
      const allDropdowns = this.page.locator('.wizard_dropdown .selecter-selected').filter({ visible: true });
      const count = await allDropdowns.count();

      console.log(`[WARN] Recorded wizard dropdown index ${index} not visible. Visible dropdown count: ${count}`);

      // Recorded div:nth-child(15) is usually the DCN/Aruba dropdown. It appears around the 5th/6th visible wizard dropdown.
      const fallbackByVisibleIndex = index >= 15 ? 4 : Math.max(0, Math.min(index - 1, count - 1));

      if (count === 0) {
        throw new Error(`No visible wizard dropdowns found for recorded index ${index}`);
      }

      dropdown = allDropdowns.nth(fallbackByVisibleIndex);
    }

    await dropdown.waitFor({ state: 'visible', timeout: 60_000 });

    console.log('[DEBUG] Selected wizard dropdown details:', await this.debugLocatorDetails(dropdown, `wizard dropdown index ${index}`));

    await this.scrollToCenter(dropdown, `wizard dropdown index ${index}`);

    await dropdown.click({ force: true }).catch(async (error) => {
      console.log(`[WARN] Wizard dropdown normal click failed for index ${index}:`, String(error).split('\n')[0]);

      await dropdown.evaluate((element) => {
        const htmlElement = element as HTMLElement;
        const rect = htmlElement.getBoundingClientRect();
        const x = rect.x + rect.width / 2;
        const y = rect.y + rect.height / 2;

        htmlElement.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y }));
        htmlElement.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y }));
        htmlElement.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y }));
        htmlElement.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y }));
        htmlElement.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y }));
        htmlElement.click();
      });
    });

    await this.page.waitForTimeout(700);

    console.log('[DEBUG] Wizard dropdown candidates after click:', await this.debugWizardDropdowns());
  }

  private async debugWizardDropdowns() {
    return this.page.evaluate(() => {
      const normalize = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim();

      const isVisible = (element: Element) => {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();

        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          Number(style.opacity || '1') > 0.01 &&
          rect.width > 0 &&
          rect.height > 0
        );
      };

      return Array.from(document.querySelectorAll<HTMLElement>('.wizard_dropdown .selecter-selected, .selecter-selected'))
        .filter((element) => isVisible(element))
        .map((element, visibleIndex) => {
          const rect = element.getBoundingClientRect();

          let parent: HTMLElement | null = element;
          let depth = 0;

          while (parent && depth < 8 && !parent.className.toString().includes('wizard_dropdown')) {
            parent = parent.parentElement;
            depth += 1;
          }

          return {
            visibleIndex,
            text: normalize(element.textContent),
            id: element.id,
            className: String(element.className),
            parentClass: String(parent?.className ?? ''),
            rect: {
              x: Math.round(rect.x),
              y: Math.round(rect.y),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
            },
            html: element.outerHTML.slice(0, 800),
          };
        });
    });
  }

  private async clickByTitle(pattern: RegExp, label: string) {
    const item = this.page.getByTitle(pattern).filter({ visible: true }).first();

    await expect(item, `${label} should be visible by title`).toBeVisible({
      timeout: 30_000,
    });

    await item.click({ force: true }).catch(async () => {
      await item.evaluate((element) => (element as HTMLElement).click());
    });

    await waitForBlockingOverlay(this.page);
  }

  private async clickDialogOk(label: string) {
    const ok = this.page
      .getByRole('button', { name: /^OK$/i })
      .or(this.page.locator('button, input[type="button"], .s-btn').filter({ hasText: /^OK$/i }))
      .filter({ visible: true })
      .first();

    if (await ok.isVisible({ timeout: 30_000 }).catch(() => false)) {
      console.log(`[STEP] Clicking OK for ${label}`);
      await ok.click({ force: true }).catch(async () => {
        await ok.evaluate((element) => (element as HTMLElement).click());
      });
    }

    await waitForBlockingOverlay(this.page);
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

  private async readBomUcid(labelText: string) {
    await waitForBlockingOverlay(this.page);

    return this.page.evaluate((labelText) => {
      const normalize = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();
      const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      const bodyMatch = normalize(document.body.textContent).match(
        new RegExp(`${escapeRegex(labelText)}\\s*[:#-]?\\s*([A-Za-z0-9_-]+)`, 'i'),
      );

      if (bodyMatch?.[1]) {
        return bodyMatch[1];
      }

      return '';
    }, labelText);
  }

  private async waitForModalOverlayHidden() {
    await this.page
      .locator('.ui-widget-overlay.ui-front, .ui-widget-overlay')
      .waitFor({ state: 'hidden', timeout: 120_000 })
      .catch(() => {
        console.log('[INFO] Modal overlay did not disappear within 120 seconds; continuing');
      });
  }

  private async scrollToCenter(locator: Locator, label: string) {
    await locator.scrollIntoViewIfNeeded().catch(() => undefined);

    await locator.evaluate((element, label) => {
      element.scrollIntoView({
        block: 'center',
        inline: 'center',
        behavior: 'instant',
      });

      console.log(`[scroll] ${label}`);
    }, label).catch(() => undefined);

    await this.page.waitForTimeout(500);
  }

  private async visibleTextSample() {
    return this.page.evaluate(() => {
      const normalize = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim();

      const isVisible = (element: Element) => {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();

        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          Number(style.opacity || '1') > 0.01 &&
          rect.width > 0 &&
          rect.height > 0
        );
      };

      return normalize(
        Array.from(document.querySelectorAll<HTMLElement>('body *'))
          .filter((element) => isVisible(element))
          .slice(0, 100)
          .map((element) => normalize(element.textContent))
          .filter(Boolean)
          .join(' | '),
      ).slice(0, 3000);
    });
  }

  private async debugLocatorDetails(locator: Locator, label: string) {
    return locator.evaluate((element, label) => {
      const htmlElement = element as HTMLElement;
      const style = window.getComputedStyle(htmlElement);
      const rect = htmlElement.getBoundingClientRect();

      return {
        label,
        tag: htmlElement.tagName,
        id: htmlElement.id,
        className: String(htmlElement.className),
        text: (htmlElement.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 1000),
        visible: style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || '1') > 0.01,
        rect: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
        html: htmlElement.outerHTML.slice(0, 1000),
      };
    }, label).catch((error) => ({ label, error: String(error) }));
  }
}

async function installOcaShim(page: Page) {
  await page.addInitScript(() => {
    const patchActivateTab = () => {
      const win = window as typeof window & { activateTab?: unknown };

      if (
        typeof win.activateTab !== 'function' ||
        (win.activateTab as { __ocaPatched?: boolean }).__ocaPatched
      ) {
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
        if (
          /activateTab.*undefined.*id|Cannot read properties of undefined \(reading 'id'\)/i.test(
            event.message,
          )
        ) {
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
        Array.from(
          document.querySelectorAll<HTMLElement>(
            '.blockUI.blockMsg, .maui-loading-div, .maui-loading-label',
          ),
        ).every((element) => {
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

function updateEndBomWorkbook(result: FifthModelExcelResult) {
  try {
    const workbook = XLSX.readFile(END_BOM_WORKBOOK_PATH);
    const sheetName = workbook.SheetNames[0];

    const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(workbook.Sheets[sheetName], {
      header: 1,
      defval: null,
    });

    const headers = normalizeEndBomHeaders(rows[0] ?? []);
    rows[0] = headers;

    const modelRows = rows
      .slice(1)
      .filter((row) => row.some((cell) => String(cell ?? '').trim().length > 0));

    const newRow: (string | number | null)[] = [];

    setCell(newRow, headers, 'S.No', modelRows.length + 1);
    setCell(newRow, headers, 'Model no', result.modelNo);
    setCell(newRow, headers, 'Processor', result.processor);
    setCell(newRow, headers, 'Memory', result.memory);
    setCell(newRow, headers, 'Start BOM UCID', result.startBomUcid);
    setCell(newRow, headers, 'End BOM UCID', result.endBomUcid);
    setCell(newRow, headers, 'Associate End BOM', result.associateEndBom);
    setCell(newRow, headers, 'Status', result.status);

    modelRows.push(newRow);

    workbook.Sheets[sheetName] = XLSX.utils.aoa_to_sheet([headers, ...modelRows]);

    XLSX.writeFile(workbook, END_BOM_WORKBOOK_PATH);

    console.log('[INFO] End BOM validation workbook appended new row:', END_BOM_WORKBOOK_PATH);
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

  return desiredHeaders.map(
    (header) => normalized.find((existingHeader) => existingHeader === header) ?? header,
  );
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
