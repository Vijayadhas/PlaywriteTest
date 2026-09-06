import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test';
import * as XLSX from 'xlsx';

const BASE_URL =
  'https://ngc-itg-oca-internal.its.hpecorp.net/ocaPreForkM1/OCAInternalLogin';

const AUTH_WAIT_MS = 40_000;
const ACTION_DELAY_MS = 2_000;
const CHROME_PROFILE_DIR = 'C:\\selenium\\oca-profile';
const END_BOM_WORKBOOK_PATH = 'C:\\workspace\\Playwright\\EndBomModelValidation.xlsx';

const BASE_MODEL_PART = 'P72176-B21';
const PROCESSOR_PART = 'P73829-B21';
const MEMORY_PART = 'P69727-F21';
const POWER_SUPPLY_PART = 'P03178-B21';
const HEATSINK_KIT_PART = 'P74787-B21';
const HEATSINK_KIT_DESCRIPTION =
  'HPE ProLiant Compute DL3XX Gen12 High Performance Heat Sink Kit';

const SELECTED_PROCESSOR =
  'P73829-B21 Intel Xeon 6740P 2.1GHz 48-core 270W Processor for HPE';

const SELECTED_MEMORY =
  'P69727-B21 HPE 32GB (1x32GB) Dual Rank x8 DDR5-6400 CAS-52-52-52 EC8 Registered Smart Memory Kit';

const SERVICE_LEVEL = 'Lite';
const EXPECTED_PAGE_TEXT = 'OCA Config 2';

type FirstModelExcelResult = {
  modelNo: string;
  processor: string;
  memory: string;
  service: string;
  startBomUcid: string;
  endBomUcid: string;
  associateEndBom: 'Yes' | 'No';
  status: 'Pass' | 'Fail';
};

test('configure OCA Config 2 first CTO model P72176-B21 automation', async ({ playwright }) => {
  test.setTimeout(20 * 60_000);

  let context: BrowserContext | undefined;

  const result: FirstModelExcelResult = {
    modelNo: BASE_MODEL_PART,
    processor: SELECTED_PROCESSOR,
    memory: SELECTED_MEMORY,
    service: SERVICE_LEVEL,
    startBomUcid: '',
    endBomUcid: '',
    associateEndBom: 'No',
    status: 'Fail',
  };

  try {
    console.log('[START] First model clean automation started');

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

    const flow = new FirstModelFlow(page, context, result);

    await test.step('Open OCA and complete manual authentication window', async () => {
      await flow.openOca();
    });

    await test.step(`Search and open CTO model ${BASE_MODEL_PART}`, async () => {
      await flow.searchAndOpenModel(BASE_MODEL_PART);
    });

    await test.step('Select Smart Chassis 2SFF BP+ Internal NS204 480GB', async () => {
      await flow.selectSmartChassis();
    });

    await test.step(`Select processor ${PROCESSOR_PART}`, async () => {
      await flow.selectProcessor();
    });

    await test.step(`Select memory ${MEMORY_PART} quantity 4`, async () => {
      await flow.selectMemory();
    });

    await test.step(`Select power supply ${POWER_SUPPLY_PART} quantity 1`, async () => {
      await flow.selectPowerSupply();
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

    console.log('[PASS] First model clean automation completed successfully');
  } catch (error) {
    console.error('[FAIL] First model clean automation failed:', error);
    updateEndBomWorkbook({ ...result, status: 'Fail' });
    throw error;
  } finally {
    await context?.close().catch(() => undefined);
  }
});

class FirstModelFlow {
  private page: Page;

  constructor(
    page: Page,
    private readonly context: BrowserContext,
    private readonly result: FirstModelExcelResult,
  ) {
    this.page = page;
  }

  async openOca() {
    await installOcaShim(this.page);

    await this.page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

    console.log('[INFO] Waiting for manual authentication:', AUTH_WAIT_MS, 'ms');
    await this.page.waitForTimeout(AUTH_WAIT_MS);

    await waitForBlockingOverlay(this.page);

    await this.selectAasModeMandatory();

    const search = this.page
      .getByRole('textbox', { name: /Search to open UCID or create|Search config/i })
      .or(this.page.locator('#search-config'))
      .first();

    await expect(search, 'Search textbox should be visible after selecting aaS').toBeVisible({
      timeout: 60_000,
    });

    await waitForBlockingOverlay(this.page);
  }

  private async selectAasModeMandatory() {
    console.log('[STEP] Selecting aaS mode. Buy mode must not be used.');

    const exactAas = this.page
      .getByText(/^aaS$/i)
      .filter({ visible: true })
      .first();

    await expect
      .poll(
        async () => exactAas.isVisible({ timeout: 1_000 }).catch(() => false),
        {
          message: 'Visible aaS mode option should appear after authentication',
          timeout: 180_000,
          intervals: [1_000, 1_000, 2_000, 3_000],
        },
      )
      .toBe(true);

    for (let attempt = 1; attempt <= 4; attempt += 1) {
      console.log(`[STEP] aaS selection attempt ${attempt}`);
      console.log('[DEBUG] Landing mode state before aaS click:', await this.debugLandingModeState());

      const aasTarget = this.page
        .locator('button, a, li, label, span, div')
        .filter({ hasText: /^\s*aaS\s*$/i })
        .filter({ visible: true })
        .first();

      await aasTarget.scrollIntoViewIfNeeded().catch(() => undefined);

      let clicked = false;

      try {
        await aasTarget.click({ timeout: 10_000 });
        clicked = true;
        console.log('[INFO] aaS normal click succeeded');
      } catch (error) {
        console.log('[WARN] aaS normal click failed:', String(error).split('\n')[0]);
      }

      if (!clicked) {
        try {
          await aasTarget.click({ force: true, timeout: 10_000 });
          clicked = true;
          console.log('[INFO] aaS force click succeeded');
        } catch (error) {
          console.log('[WARN] aaS force click failed:', String(error).split('\n')[0]);
        }
      }

      if (!clicked) {
        clicked = await this.page.evaluate(() => {
          const normalize = (value: string | null | undefined) =>
            (value ?? '').replace(/\s+/g, ' ').trim();

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

          const candidates = Array.from(
            document.querySelectorAll<HTMLElement>('button, a, li, label, span, div'),
          ).filter(
            (element) => isVisible(element) && /^aaS$/i.test(normalize(element.textContent)),
          );

          const target = candidates[0];

          if (!target) {
            return false;
          }

          target.scrollIntoView({ block: 'center', inline: 'center' });

          const rect = target.getBoundingClientRect();
          const eventInit = {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: rect.x + rect.width / 2,
            clientY: rect.y + rect.height / 2,
          };

          target.dispatchEvent(new MouseEvent('mouseover', eventInit));
          target.dispatchEvent(new MouseEvent('mousedown', eventInit));
          target.dispatchEvent(new MouseEvent('mouseup', eventInit));
          target.dispatchEvent(new MouseEvent('click', eventInit));
          target.click();

          return true;
        });

        console.log('[INFO] aaS DOM click result:', clicked);
      }

      await this.page.waitForTimeout(2_000);
      await waitForBlockingOverlay(this.page);

      const state = await this.debugLandingModeState();
      console.log('[DEBUG] Landing mode state after aaS click:', state);

      if (state.aasSelected && !state.buySelected) {
        console.log('[PASS] aaS mode is visibly selected');
        return;
      }

      const searchVisible = await this.page
        .getByRole('textbox', { name: /Search to open UCID or create|Search config/i })
        .or(this.page.locator('#search-config'))
        .first()
        .isVisible({ timeout: 2_000 })
        .catch(() => false);

      // Some OCA builds do not expose selected/active semantics in the DOM.
      // The click is still mandatory; final Quotation Mode is verified after Customize.
      if (clicked && searchVisible && !state.buySelected) {
        console.log('[INFO] aaS was clicked and search is ready; final aaS mode will be verified after Customize');
        return;
      }
    }

    throw new Error(
      `aaS mode could not be selected. Landing diagnostics: ${JSON.stringify(
        await this.debugLandingModeState(),
      )}`,
    );
  }

  private async debugLandingModeState() {
    return this.page.evaluate(() => {
      const normalize = (value: string | null | undefined) =>
        (value ?? '').replace(/\s+/g, ' ').trim();

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

      const readState = (label: 'aaS' | 'Buy') => {
        return Array.from(
          document.querySelectorAll<HTMLElement>(
            'button, a, li, label, span, div, input[type="radio"]',
          ),
        )
          .filter((element) => isVisible(element))
          .filter((element) => {
            const ownText = normalize(element.textContent);
            const ariaLabel = normalize(element.getAttribute('aria-label'));
            const value =
              element instanceof HTMLInputElement ? normalize(element.value) : '';

            return [ownText, ariaLabel, value].some(
              (candidate) => new RegExp(`^${label}$`, 'i').test(candidate),
            );
          })
          .slice(0, 10)
          .map((element) => {
            let selected = false;
            let current: Element | null = element;
            const ancestry: Array<{ tag: string; id: string; className: string }> = [];

            for (let depth = 0; current && depth < 5; depth += 1, current = current.parentElement) {
              const html = current as HTMLElement;
              const className = String(html.className ?? '');
              const ariaSelected = html.getAttribute('aria-selected');
              const ariaChecked = html.getAttribute('aria-checked');
              const dataState = html.getAttribute('data-state');

              ancestry.push({
                tag: html.tagName,
                id: html.id,
                className,
              });

              if (
                /(^|\s)(active|selected|current|checked|highlight)(\s|$)/i.test(className) ||
                ariaSelected === 'true' ||
                ariaChecked === 'true' ||
                /selected|active|checked/i.test(dataState ?? '') ||
                (html instanceof HTMLInputElement && html.checked)
              ) {
                selected = true;
              }
            }

            return {
              tag: element.tagName,
              id: element.id,
              className: String(element.className),
              text: normalize(element.textContent),
              selected,
              ancestry,
            };
          });
      };

      const aas = readState('aaS');
      const buy = readState('Buy');

      return {
        aas,
        buy,
        aasSelected: aas.some((item) => item.selected),
        buySelected: buy.some((item) => item.selected),
        bodyTextSample: normalize(document.body?.textContent).slice(0, 1200),
      };
    }).catch((error) => ({ error: String(error), aasSelected: false, buySelected: false }));
  }

  async searchAndOpenModel(partNumber: string) {
    console.log(`[STEP] Search and open model started: ${partNumber}`);

    const search = this.page
      .getByRole('textbox', { name: /Search to open UCID or create|Search config/i })
      .or(this.page.locator('#search-config'))
      .first();

    console.log('[DEBUG] Waiting for search textbox');

    await expect(search, 'Search textbox should be visible').toBeVisible({
      timeout: 60_000,
    });

    console.log('[DEBUG] Search textbox found. Filling model:', partNumber);

    await search.click().catch((error) => {
      console.log('[WARN] Search textbox click failed:', String(error).split('\n')[0]);
    });

    await search.fill(partNumber);

    await this.page.waitForTimeout(1_000);

    console.log('[DEBUG] Autocomplete candidates after fill:', await this.debugAutocompleteOptions());

    const autocompleteOption = this.page
      .locator('ul.ui-autocomplete:not([style*="display: none"]) li.ui-menu-item, [role="option"]')
      .filter({ hasText: partNumber })
      .first();

    if (await autocompleteOption.isVisible({ timeout: 15_000 }).catch(() => false)) {
      console.log('[STEP] Clicking autocomplete option for model:', partNumber);
      console.log('[DEBUG] Autocomplete option details:', await this.debugLocatorDetails(autocompleteOption, 'autocomplete option'));

      await safeClick(autocompleteOption);
    } else {
      console.log('[WARN] Autocomplete option was not visible. Trying Enter key fallback.');
      await search.press('Enter').catch((error) => {
        console.log('[WARN] Search Enter fallback failed:', String(error).split('\n')[0]);
      });
    }

    console.log('[DEBUG] Waiting for DQE cards container');

    await this.page.locator('#dqe_cards_container').waitFor({
      state: 'visible',
      timeout: 60_000,
    });

    await this.page.waitForTimeout(2_000);

    console.log('[DEBUG] DQE card diagnostics before CTO Base Model filter:', await this.debugDqeCards(partNumber));

    await this.selectCtoBaseModelFilterIfAvailable(partNumber);

    console.log('[DEBUG] DQE card diagnostics after CTO Base Model filter:', await this.debugDqeCards(partNumber));

    const ctoCard = await this.findCtoBaseModelCard(partNumber);

    console.log('[DEBUG] Waiting for CTO Base Model card:', partNumber);

    await expect(ctoCard, `CTO Base Model card for ${partNumber} should be visible`).toBeVisible({
      timeout: 60_000,
    });

    console.log('[DEBUG] CTO Base Model card found:', await this.debugLocatorDetails(ctoCard, 'cto base model card'));

    const customizeButton = await this.findCustomizeButtonForCard(ctoCard, partNumber);

    console.log('[DEBUG] Waiting for Customize button');

    await expect(customizeButton, 'Customize button should be visible in CTO card').toBeVisible({
      timeout: 60_000,
    });

    console.log('[DEBUG] Customize button details before click:', await this.debugLocatorDetails(customizeButton, 'customize button'));

    const buttonState = await customizeButton.evaluate((element) => {
      const htmlElement = element as HTMLElement;
      const style = window.getComputedStyle(htmlElement);
      const rect = htmlElement.getBoundingClientRect();

      return {
        tag: htmlElement.tagName,
        id: htmlElement.id,
        className: String(htmlElement.className),
        text: (htmlElement.textContent ?? '').replace(/\s+/g, ' ').trim(),
        disabled: htmlElement.hasAttribute('disabled'),
        ariaDisabled: htmlElement.getAttribute('aria-disabled'),
        pointerEvents: style.pointerEvents,
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        rect: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
        html: htmlElement.outerHTML.slice(0, 1000),
      };
    }).catch((error) => ({ error: String(error) }));

    console.log('[DEBUG] Customize button computed state:', buttonState);

    const newPagePromise = this.context.waitForEvent('page', { timeout: 20_000 }).catch(() => null);

    console.log('[STEP] Clicking Customize button');

    await this.clickCustomizeButtonStable(customizeButton);

    console.log('[DEBUG] Customize click completed. Waiting for new page or same page navigation.');

    const newPage = await newPagePromise;

    if (newPage) {
      console.log('[INFO] New page opened after Customize click');
      this.page = newPage;
    } else {
      console.log('[INFO] No new page opened; continuing with same page');
    }

    await this.page.waitForLoadState('domcontentloaded').catch((error) => {
      console.log('[WARN] domcontentloaded wait after customize failed:', String(error).split('\n')[0]);
    });

    console.log('[DEBUG] Current page URL after Customize:', this.page.url());
    console.log('[DEBUG] Current page title after Customize:', await this.page.title().catch(() => '<title unavailable>'));

    await this.waitForOcaConfigPageReadyAfterCustomize(partNumber);

    await this.assertAasQuotationMode();

    console.log('[PASS] OCA Config page opened successfully for model:', partNumber);
  }

  private async assertAasQuotationMode() {
    console.log('[STEP] Verifying final Quotation Mode is aaS, not Buy');

    const result = await expect
      .poll(
        async () => {
          const bodyText = (
            (await this.page.locator('body').textContent().catch(() => '')) ?? ''
          )
            .replace(/\s+/g, ' ')
            .trim();

          if (/Quotation Mode\s*:?\s*aaS(?:\s*\(IQ\))?/i.test(bodyText)) {
            return 'aaS';
          }

          if (/Quotation Mode\s*:?\s*Buy\b/i.test(bodyText)) {
            return 'Buy';
          }

          return '';
        },
        {
          message: 'Quotation Mode should be visible after Customize',
          timeout: 30_000,
          intervals: [1_000, 1_000, 2_000, 3_000],
        },
      )
      .not.toBe('');

    const bodyText = (
      (await this.page.locator('body').textContent().catch(() => '')) ?? ''
    )
      .replace(/\s+/g, ' ')
      .trim();

    if (/Quotation Mode\s*:?\s*Buy\b/i.test(bodyText)) {
      throw new Error(
        'Wrong configuration mode detected: OCA opened in Buy mode. The test requires aaS mode.',
      );
    }

    if (!/Quotation Mode\s*:?\s*aaS(?:\s*\(IQ\))?/i.test(bodyText)) {
      throw new Error(
        `Unable to verify aaS Quotation Mode. Page text: ${bodyText.slice(0, 1200)}`,
      );
    }

    console.log('[PASS] Quotation Mode verified as aaS');
  }

  private async clickCustomizeButtonStable(customizeButton: Locator) {
    await waitForBlockingOverlay(this.page);

    await customizeButton.scrollIntoViewIfNeeded().catch((error) => {
      console.log('[WARN] scrollIntoViewIfNeeded failed for Customize:', String(error).split('\n')[0]);
    });

    await customizeButton.evaluate((element) => {
      element.scrollIntoView({
        block: 'center',
        inline: 'center',
        behavior: 'instant',
      });
    }).catch((error) => {
      console.log('[WARN] center scroll failed for Customize:', String(error).split('\n')[0]);
    });

    await this.page.waitForTimeout(500);

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      console.log(`[STEP] Customize click attempt ${attempt}`);

      const details = await this.debugLocatorDetails(customizeButton, `customize button attempt ${attempt}`);
      console.log('[DEBUG] Customize attempt details:', details);

      try {
        await customizeButton.click({ timeout: 10_000 });
        console.log(`[INFO] Customize normal click succeeded on attempt ${attempt}`);
        return;
      } catch (error) {
        console.log(`[WARN] Customize normal click failed on attempt ${attempt}:`, String(error).split('\n')[0]);
      }

      try {
        await customizeButton.click({ force: true, timeout: 10_000 });
        console.log(`[INFO] Customize force click succeeded on attempt ${attempt}`);
        return;
      } catch (error) {
        console.log(`[WARN] Customize force click failed on attempt ${attempt}:`, String(error).split('\n')[0]);
      }

      try {
        await customizeButton.evaluate((element) => {
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

        console.log(`[INFO] Customize DOM event click executed on attempt ${attempt}`);
        return;
      } catch (error) {
        console.log(`[WARN] Customize DOM click failed on attempt ${attempt}:`, String(error).split('\n')[0]);
      }

      await this.page.waitForTimeout(1_500);
    }

    throw new Error('Customize button could not be clicked after 3 attempts');
  }

  private async debugAutocompleteOptions() {
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

      return Array.from(document.querySelectorAll<HTMLElement>('ul.ui-autocomplete li.ui-menu-item, [role="option"]'))
        .filter((element) => isVisible(element))
        .slice(0, 20)
        .map((element, index) => {
          const rect = element.getBoundingClientRect();

          return {
            index,
            id: element.id,
            className: String(element.className),
            text: normalize(element.textContent),
            rect: {
              x: Math.round(rect.x),
              y: Math.round(rect.y),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
            },
            html: element.outerHTML.slice(0, 700),
          };
        });
    });
  }

  private async debugDqeCards(partNumber: string) {
    return this.page.evaluate((partNumber) => {
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

      const container = document.querySelector<HTMLElement>('#dqe_cards_container');

      return {
        containerFound: Boolean(container),
        containerText: normalize(container?.textContent).slice(0, 2000),
        visibleStartingPointFilters: Array.from(document.querySelectorAll<HTMLElement>('label, span, button, div, a'))
          .filter((element) => isVisible(element))
          .map((element) => normalize(element.textContent))
          .filter((text) => /BTO Base Model|CTO Base Model|Smart CTO|Smart Choice|Starting point/i.test(text))
          .slice(0, 30),
        matchingCards: Array.from(document.querySelectorAll<HTMLElement>('#dqe_cards_container .dqe-card, #dqe_cards_container div'))
          .filter((element) => isVisible(element))
          .filter((element) => normalize(element.textContent).includes(partNumber))
          .slice(0, 10)
          .map((element, index) => {
            const rect = element.getBoundingClientRect();

            return {
              index,
              id: element.id,
              className: String(element.className),
              text: normalize(element.textContent).slice(0, 1200),
              buttonTexts: Array.from(element.querySelectorAll<HTMLElement>('button, .dqe-customize-btn')).map((button) =>
                normalize(button.textContent),
              ),
              rect: {
                x: Math.round(rect.x),
                y: Math.round(rect.y),
                width: Math.round(rect.width),
                height: Math.round(rect.height),
              },
              html: element.outerHTML.slice(0, 1200),
            };
          }),
      };
    }, partNumber);
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
        text: (htmlElement.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 1200),
        visible: style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || '1') > 0.01,
        pointerEvents: style.pointerEvents,
        rect: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
        html: htmlElement.outerHTML.slice(0, 1200),
      };
    }, label).catch((error) => ({ label, error: String(error) }));
  }

  private async selectCtoBaseModelFilterIfAvailable(partNumber: string) {
    console.log('[STEP] Ensuring CTO Base Model filter/card is selected, not Smart CTO');

    const currentDiagnostics = await this.debugDqeCards(partNumber);
    console.log('[DEBUG] Current card/filter state before CTO filter click:', currentDiagnostics);

    const smartCtoOnlyVisible =
      Array.isArray((currentDiagnostics as any).matchingCards) &&
      (currentDiagnostics as any).matchingCards.length > 0 &&
      (currentDiagnostics as any).matchingCards.every((card: any) => /Smart CTO/i.test(card.text ?? ''));

    const ctoBaseVisible =
      Array.isArray((currentDiagnostics as any).matchingCards) &&
      (currentDiagnostics as any).matchingCards.some((card: any) =>
        /CTO Base Model|["“]?\s*P72176-B21["”]?\s*[—-]\s*CTO\b|CTO Compute/i.test(card.text ?? ''),
      );

    if (ctoBaseVisible && !smartCtoOnlyVisible) {
      console.log('[INFO] CTO Base Model/CTO Compute card already appears visible');
      return;
    }

    const ctoBaseFilter = this.page
      .locator('label, span, button, div, a')
      .filter({ hasText: /^CTO Base Model$/i })
      .filter({ visible: true })
      .first();

    if (await ctoBaseFilter.isVisible({ timeout: 5_000 }).catch(() => false)) {
      console.log('[STEP] Clicking CTO Base Model filter');

      await this.scrollToCenter(ctoBaseFilter, 'CTO Base Model filter');

      await ctoBaseFilter.click({ force: true }).catch(async (error) => {
        console.log('[WARN] CTO Base Model filter click failed:', String(error).split('\n')[0]);
        await ctoBaseFilter.evaluate((element) => (element as HTMLElement).click());
      });

      await waitForBlockingOverlay(this.page);
      await this.page.waitForTimeout(2_000);
      return;
    }

    const ctoBaseByDom = await this.page.evaluate(() => {
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

      const candidates = Array.from(document.querySelectorAll<HTMLElement>('label, span, button, div, a'))
        .filter((element) => isVisible(element))
        .filter((element) => /^CTO Base Model$/i.test(normalize(element.textContent)));

      const target = candidates[0];

      if (!target) {
        return false;
      }

      target.scrollIntoView({ block: 'center', inline: 'center' });
      target.click();

      return true;
    });

    console.log('[DEBUG] CTO Base Model DOM filter click result:', ctoBaseByDom);

    if (ctoBaseByDom) {
      await waitForBlockingOverlay(this.page);
      await this.page.waitForTimeout(2_000);
    } else {
      console.log('[WARN] CTO Base Model filter was not found. Will search exact CTO card and avoid Smart CTO card.');
    }
  }

  private async findCtoBaseModelCard(partNumber: string) {
    const cardRoot = this.page.locator('#dqe_cards_container');

    const exactCtoCompute = cardRoot
      .locator('.dqe-card, div')
      .filter({ hasText: new RegExp(`["“]?${escapeRegex(partNumber)}["”]?\\s*[—-]\\s*CTO\\b`, 'i') })
      .filter({ hasNotText: /Smart CTO/i })
      .first();

    if (await exactCtoCompute.isVisible({ timeout: 5_000 }).catch(() => false)) {
      console.log('[INFO] Found exact CTO card excluding Smart CTO');
      return exactCtoCompute;
    }

    const ctoBaseModel = cardRoot
      .locator('.dqe-card, div')
      .filter({ hasText: partNumber })
      .filter({ hasText: /CTO Base Model|CTO Compute/i })
      .filter({ hasNotText: /Smart CTO/i })
      .first();

    if (await ctoBaseModel.isVisible({ timeout: 5_000 }).catch(() => false)) {
      console.log('[INFO] Found CTO Base Model / CTO Compute card');
      return ctoBaseModel;
    }

    const availableCards = await this.debugDqeCards(partNumber);
    console.log('[ERROR] Could not find CTO Base Model card. Available cards:', availableCards);

    throw new Error(`CTO Base Model card was not found for ${partNumber}. Smart CTO card should not be used.`);
  }

  private async findCustomizeButtonForCard(card: Locator, partNumber: string) {
    const button = card
      .getByRole('button', { name: /Customize|Build|Configure/i })
      .or(card.locator('button.dqe-customize-btn, .dqe-customize-btn'))
      .first();

    if (await button.isVisible({ timeout: 5_000 }).catch(() => false)) {
      return button;
    }

    console.log('[WARN] Customize button not found inside selected card; trying DOM-based nearest button');

    const buttonHandleFound = await this.page.evaluate((partNumber) => {
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

      const cards = Array.from(document.querySelectorAll<HTMLElement>('#dqe_cards_container .dqe-card, #dqe_cards_container div'))
        .filter((element) => isVisible(element))
        .filter((element) => normalize(element.textContent).includes(partNumber))
        .filter((element) => !/Smart CTO/i.test(normalize(element.textContent)))
        .filter((element) => /CTO Base Model|CTO Compute|["“]?\s*P72176-B21["”]?\s*[—-]\s*CTO\b/i.test(normalize(element.textContent)));

      const card = cards[0];

      if (!card) {
        return false;
      }

      const buttons = Array.from(card.querySelectorAll<HTMLElement>('button, .dqe-customize-btn'))
        .filter((element) => isVisible(element))
        .filter((element) => /Customize|Build|Configure/i.test(normalize(element.textContent)));

      const button = buttons[0];

      if (!button) {
        return false;
      }

      button.setAttribute('data-playwright-target', 'true');

      return true;
    }, partNumber);

    if (!buttonHandleFound) {
      throw new Error(`Customize button was not found for CTO Base Model card ${partNumber}`);
    }

    return this.page.locator('[data-playwright-target="true"]').first();
  }

  private async waitForOcaConfigPageReadyAfterCustomize(partNumber: string) {
    console.log('[STEP] Waiting for visible OCA Config page after Customize');

    const visibleReadyLocators = [
      this.page.locator('#section_header_smartChassisSection, #section_header_smartChassis').filter({ visible: true }).first(),
      this.page.locator('[id^="section_header_"]').filter({ hasText: /Smart Chassis|Processor|Memory/i }).filter({ visible: true }).first(),
      this.page.getByText(/^Smart Chassis$/i).filter({ visible: true }).first(),
      this.page.getByRole('link', { name: 'Services', exact: true }).filter({ visible: true }).first(),
      this.page.locator('input[placeholder*="Search config" i], input[aria-label*="Search config" i]').filter({ visible: true }).first(),
      this.page.locator('#save #save_icon, [title="Save"] #save_icon').filter({ visible: true }).first(),
    ];

    await expect
      .poll(
        async () => {
          const states = [];

          for (let index = 0; index < visibleReadyLocators.length; index += 1) {
            const locator = visibleReadyLocators[index];
            const visible = await locator.isVisible({ timeout: 1_000 }).catch(() => false);
            states.push({ index, visible });

            if (visible) {
              return `ready:${index}`;
            }
          }

          const diagnostics = await this.debugConfigPageReadiness(partNumber);

          console.log('[DEBUG] OCA config readiness poll:', {
            states,
            url: diagnostics.url,
            title: diagnostics.title,
            visibleTextSample: diagnostics.visibleTextSample,
            hiddenOcaOptionCount: diagnostics.hiddenOcaOptionCount,
            sectionHeaders: diagnostics.sectionHeaders,
          });

          return '';
        },
        {
          message: 'OCA config page should show visible config controls after Customize',
          timeout: 90_000,
          intervals: [2_000, 2_000, 3_000, 5_000],
        },
      )
      .not.toBe('');

    console.log('[DEBUG] OCA config page readiness final diagnostics:', await this.debugConfigPageReadiness(partNumber));
  }

  private async debugConfigPageReadiness(partNumber: string) {
    return this.page.evaluate((partNumber) => {
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

      const visibleTextSample = normalize(
        Array.from(document.querySelectorAll<HTMLElement>('body *'))
          .filter((element) => isVisible(element))
          .slice(0, 80)
          .map((element) => normalize(element.textContent))
          .filter(Boolean)
          .join(' | '),
      ).slice(0, 2000);

      return {
        url: location.href,
        title: document.title,
        partNumberPresentInBody: normalize(document.body.textContent).includes(partNumber),
        hiddenOcaOptionCount: Array.from(document.querySelectorAll('option'))
          .filter((option) => normalize(option.textContent).includes('OCA Config 2')).length,
        visibleOcaTextCount: Array.from(document.querySelectorAll<HTMLElement>('body *'))
          .filter((element) => isVisible(element))
          .filter((element) => normalize(element.textContent).includes('OCA Config 2')).length,
        sectionHeaders: Array.from(document.querySelectorAll<HTMLElement>('[id^="section_header_"], .section_header'))
          .filter((element) => isVisible(element))
          .slice(0, 20)
          .map((element) => ({
            id: element.id,
            className: String(element.className),
            text: normalize(element.textContent).slice(0, 200),
          })),
        visibleTextSample,
      };
    }, partNumber).catch((error) => ({
      url: this.page.url(),
      title: '<unavailable>',
      error: String(error),
    }));
  }

  async selectSmartChassis() {
    await this.openSection('Smart Chassis', '#section_header_smartChassisSection, #section_header_smartChassis, [id*="section_header" i][id*="smartChassis" i]');

    const row = this.page
      .getByRole('row', { name: /2SFF BP\+ Internal NS204 480GB/i })
      .or(
        this.page
          .locator('tr.item_tr, tr')
          .filter({ hasText: '2SFF BP+ Internal NS204 480GB' }),
      )
      .filter({ visible: true })
      .first();

    await expect(row, 'Smart Chassis row should be visible').toBeVisible({
      timeout: 60_000,
    });

    await this.selectRowRadio(row, 'Smart Chassis');
  }

  async selectProcessor() {
    await this.openSection('Processor', '#section_header_processor, #section_header_processorSection, [id*="section_header" i][id*="processor" i]');

    const row = await this.waitForProductRow(PROCESSOR_PART, 'Processor');

    await this.selectRowRadio(row, `Processor ${PROCESSOR_PART}`);

    // IMPORTANT:
    // OCA automatically selects P74787-B21 quantity 2 for this processor.
    // This test must NEVER click, change, restore, or set the heatsink quantity.
    await this.verifyAutomaticHeatsinkQuantityReadOnly('after processor selection');
  }

  private async verifyAutomaticHeatsinkQuantityReadOnly(stage: string) {
    console.log(
      `[STEP] Read-only verification of automatic heatsink ${HEATSINK_KIT_PART} quantity 2 ${stage}`,
    );

    await waitForBlockingOverlay(this.page);
    await this.page.waitForTimeout(1_500);

    const result = await this.readAutomaticHeatsinkState();

    console.log(`[DEBUG] Automatic heatsink state ${stage}:`, result);

    if (!result.rowFound) {
      console.log(
        `[WARN] ${HEATSINK_KIT_PART} was not visible during the read-only check ${stage}. ` +
          'The test will not open or modify the Choice Heatsink Kit section.',
      );
      return;
    }

    if (result.quantity === '2') {
      console.log(
        `[PASS] ${HEATSINK_KIT_PART} ${HEATSINK_KIT_DESCRIPTION} is automatically selected as quantity 2 ${stage}`,
      );
      return;
    }

    console.log(
      `[WARN] ${HEATSINK_KIT_PART} automatic quantity is "${result.quantity || '<empty>'}" ${stage}. ` +
        'No modification will be made. If OCA marks the configuration Action-Required, ' +
        'the Save popup acknowledgement flow will handle it.',
    );
  }

  private async readAutomaticHeatsinkState() {
    return this.page.evaluate(
      ({ partNumber, description }) => {
        const normalize = (value: string | null | undefined) =>
          (value ?? '').replace(/\s+/g, ' ').trim();

        const isVisible = (element: Element | null) => {
          if (!element) {
            return false;
          }

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

        const readQuantity = (row: HTMLElement) => {
          const select = row.querySelector<HTMLSelectElement>('select');

          if (select) {
            return normalize(select.value);
          }

          const visibleInput = Array.from(
            row.querySelectorAll<HTMLInputElement>(
              'input[type="number"], input[type="text"]',
            ),
          ).find((candidate) => isVisible(candidate));

          if (visibleInput) {
            return normalize(visibleInput.value);
          }

          const quantityCandidates = Array.from(
            row.querySelectorAll<HTMLElement>(
              '.item_qty_div, td.item_qty, .item_qty, [class*="qty" i]',
            ),
          ).filter((candidate) => isVisible(candidate));

          // Use only the quantity control inside the exact P74787-B21 row.
          return normalize(quantityCandidates[0]?.textContent);
        };

        const exactIdRow = Array.from(
          document.querySelectorAll<HTMLElement>(
            `tr[id^="item_tr_${partNumber}"], tr[id*="${partNumber}"]`,
          ),
        ).find((row) => {
          const text = normalize(row.textContent);

          return (
            text.includes(partNumber) &&
            (text.includes(description) ||
              /High Performance Heat Sink Kit/i.test(text))
          );
        });

        const exactPid = Array.from(
          document.querySelectorAll<HTMLElement>(
            'span._pid, td.item_prod span, .item_prod, [class*="_pid"]',
          ),
        ).find(
          (element) =>
            normalize(element.textContent) === partNumber &&
            isVisible(element),
        );

        const pidRow = exactPid?.closest<HTMLElement>('tr');

        const exactTextRow = Array.from(
          document.querySelectorAll<HTMLElement>('tr.item_tr, tr'),
        ).find((row) => {
          const text = normalize(row.textContent);

          return (
            text.startsWith(partNumber) &&
            (text.includes(description) ||
              /High Performance Heat Sink Kit/i.test(text))
          );
        });

        const exactRow = exactIdRow ?? pidRow ?? exactTextRow;

        if (!exactRow) {
          return {
            rowFound: false,
            rowVisible: false,
            quantity: '',
            rowId: '',
            rowText: '',
            matchedBy: '',
          };
        }

        return {
          rowFound: true,
          rowVisible: isVisible(exactRow),
          quantity: readQuantity(exactRow),
          rowId: exactRow.id,
          rowText: normalize(exactRow.textContent).slice(0, 800),
          matchedBy: exactIdRow
            ? 'exact item row id'
            : pidRow
              ? 'exact product-number element'
              : 'exact row text',
        };
      },
      {
        partNumber: HEATSINK_KIT_PART,
        description: HEATSINK_KIT_DESCRIPTION,
      },
    ).catch((error) => ({
      rowFound: false,
      rowVisible: false,
      quantity: '',
      rowId: '',
      rowText: '',
      matchedBy: '',
      error: String(error),
    }));
  }

  async selectMemory() {
    await this.openSection('Memory', '#section_header_memory, #section_header_memorySection, [id*="section_header" i][id*="memory" i]');

    await this.toggleHpeRecommendedOnlyForMemory();

    const exactMemoryRow = this.page.locator(`#item_tr_${MEMORY_PART}_memory_memorySlotsChoice`).first();

    const row = (await exactMemoryRow.isVisible({ timeout: 5_000 }).catch(() => false))
      ? exactMemoryRow
      : await this.waitForProductRow(MEMORY_PART, 'Memory');

    await this.selectRowQuantity(row, '4', `Memory ${MEMORY_PART}`);
  }

  async selectPowerSupply() {
    await this.selectPowerSupplyQuantityOneWithoutResettingHeatsink();
  }

  private async selectPowerSupplyQuantityOneWithoutResettingHeatsink() {
    console.log(
      `[STEP] Selecting Power Supply ${POWER_SUPPLY_PART} quantity 1 without changing automatic heatsink ${HEATSINK_KIT_PART}`,
    );

    const initialHeatsink = await this.readAutomaticHeatsinkState();

    console.log('[DEBUG] Exact P74787-B21 row state immediately before Power Supply selection:', initialHeatsink);

    if (
      initialHeatsink.rowId === 'choice_column_titles_ProcessorSection_HeatsinkKitChoice'
    ) {
      throw new Error(
        'Heatsink verification matched the Choice Heatsink Kit container instead of the exact P74787-B21 row.',
      );
    }

    if (!initialHeatsink.rowFound || initialHeatsink.quantity !== '2') {
      throw new Error(
        `Cannot start Power Supply selection because automatic heatsink ${HEATSINK_KIT_PART} ` +
          `is not quantity 2. Current quantity: ${initialHeatsink.quantity || '<empty>'}`,
      );
    }

    await this.openSection(
      'Power Supplies',
      '#section_header_power, [id*="section_header" i][id*="power" i]',
    );

    const row = await this.findExactPowerSupplyRow();

    await expect(
      row,
      `Exact Power Supply row ${POWER_SUPPLY_PART} should be visible`,
    ).toBeVisible({ timeout: 60_000 });

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      console.log(`[STEP] Exact Power Supply quantity selection attempt ${attempt}`);

      await waitForBlockingOverlay(this.page);
      await this.page.keyboard.press('Escape').catch(() => undefined);
      await this.page.waitForTimeout(500);

      const beforePowerQuantity = await this.readRowQuantity(row).catch(() => '');
      const beforeHeatsink = await this.readAutomaticHeatsinkState();

      console.log('[DEBUG] State before exact Power Supply selection:', {
        attempt,
        powerSupplyQuantity: beforePowerQuantity,
        heatsinkQuantity: beforeHeatsink.quantity,
      });

      if (beforePowerQuantity === '1' && beforeHeatsink.quantity === '2') {
        console.log(
          `[PASS] Power Supply ${POWER_SUPPLY_PART} is already 1 and heatsink remains 2`,
        );
        return;
      }

      if (beforeHeatsink.quantity !== '2') {
        throw new Error(
          `Automatic heatsink ${HEATSINK_KIT_PART} changed before Power Supply click. ` +
            `Expected 2 but found ${beforeHeatsink.quantity || '<empty>'}.`,
        );
      }

      const selected = await this.selectQuantityFromRowOwnedDropdown(
        row,
        '1',
        `Power Supply ${POWER_SUPPLY_PART}`,
      );

      if (!selected) {
        console.log(
          `[WARN] Exact Power Supply dropdown selection attempt ${attempt} did not find a row-owned option`,
        );
        continue;
      }

      const stable = await this.waitForPowerSupplyAndHeatsinkStable(row);

      if (stable) {
        console.log(
          `[PASS] Power Supply ${POWER_SUPPLY_PART} remained quantity 1 and automatic heatsink ${HEATSINK_KIT_PART} remained quantity 2`,
        );
        return;
      }

      const powerAfter = await this.readRowQuantity(row).catch(() => '');
      const heatsinkAfter = await this.readAutomaticHeatsinkState();

      console.log('[WARN] Exact Power Supply selection did not stabilize:', {
        attempt,
        powerSupplyQuantity: powerAfter,
        heatsinkQuantity: heatsinkAfter.quantity,
      });

      if (heatsinkAfter.quantity !== '2') {
        throw new Error(
          `Power Supply automation changed automatic heatsink ${HEATSINK_KIT_PART} ` +
            `from 2 to ${heatsinkAfter.quantity || '<empty>'}. ` +
            'The test stopped immediately and did not modify the heatsink row.',
        );
      }
    }

    const finalPower = await this.readRowQuantity(row).catch(() => '');
    const finalHeatsink = await this.readAutomaticHeatsinkState();

    throw new Error(
      `Power Supply ${POWER_SUPPLY_PART} could not be set safely. ` +
        `Power Supply quantity: ${finalPower || '<empty>'}; ` +
        `exact heatsink ${HEATSINK_KIT_PART} quantity: ${finalHeatsink.quantity || '<empty>'}; ` +
        `heatsink matched by: ${finalHeatsink.matchedBy || '<none>'}; ` +
        `heatsink row id: ${finalHeatsink.rowId || '<none>'}.`,
    );
  }

  private async findExactPowerSupplyRow() {
    const exactPidRow = this.page
      .locator('td.item_prod span._pid, span._pid, ._pid')
      .filter({ hasText: new RegExp(`^\\s*${escapeRegex(POWER_SUPPLY_PART)}\\s*$`) })
      .filter({ visible: true })
      .first()
      .locator('xpath=ancestor::tr[1]');

    if (await exactPidRow.isVisible({ timeout: 5_000 }).catch(() => false)) {
      return exactPidRow;
    }

    return this.page
      .locator('tr.item_tr, tr')
      .filter({ hasText: POWER_SUPPLY_PART })
      .filter({ visible: true })
      .first();
  }

  private async selectQuantityFromRowOwnedDropdown(
    row: Locator,
    quantity: string,
    label: string,
  ) {
    await this.scrollToCenter(row, `${label} exact row`);

    const nativeSelect = row.locator('select').first();

    if ((await nativeSelect.count()) > 0) {
      const selected = await nativeSelect
        .selectOption(quantity)
        .then(() => true)
        .catch(async () =>
          nativeSelect.evaluate((element, targetQuantity) => {
            const select = element as HTMLSelectElement;
            const option = Array.from(select.options).find(
              (candidate) =>
                candidate.value.trim() === targetQuantity ||
                (candidate.textContent ?? '').trim() === targetQuantity,
            );

            if (!option) {
              return false;
            }

            select.value = option.value;
            select.dispatchEvent(new Event('input', { bubbles: true }));
            select.dispatchEvent(new Event('change', { bubbles: true }));
            select.dispatchEvent(new Event('blur', { bubbles: true }));

            return true;
          }, quantity),
        );

      if (selected) {
        await waitForBlockingOverlay(this.page);
        return true;
      }
    }

    const quantityControl = row
      .locator('.item_qty_div, td.item_qty, [class*="qty" i]')
      .filter({ visible: true })
      .first();

    await expect(
      quantityControl,
      `${label} row-owned quantity control should be visible`,
    ).toBeVisible({ timeout: 30_000 });

    const controlBox = await quantityControl.boundingBox();

    console.log(
      `[DEBUG] ${label} row-owned quantity control:`,
      await this.debugLocatorDetails(quantityControl, `${label} row-owned quantity control`),
    );

    if (controlBox) {
      // The Playwright recording clicks the quantity DIV itself, not only its right edge.
      await this.page.mouse.click(
        controlBox.x + controlBox.width / 2,
        controlBox.y + controlBox.height / 2,
      );
    } else {
      await quantityControl.click({ force: true });
    }

    await this.page.waitForTimeout(700);

    const option = await this.findNearestOpenQuantityOption(
      quantityControl,
      quantity,
    );

    if (!option) {
      console.log(
        `[WARN] No active quantity option ${quantity} was found near ${label}`,
      );
      await this.page.keyboard.press('Escape').catch(() => undefined);
      return false;
    }

    console.log(
      `[DEBUG] ${label} active dropdown option:`,
      await this.debugLocatorDetails(option, `${label} active dropdown option ${quantity}`),
    );

    const optionBox = await option.boundingBox();

    if (optionBox) {
      await this.page.mouse.click(
        optionBox.x + optionBox.width / 2,
        optionBox.y + optionBox.height / 2,
      );
    } else {
      await option.click({ force: true }).catch(async () => {
        await option.evaluate((element) => (element as HTMLElement).click());
      });
    }

    await waitForBlockingOverlay(this.page);
    await this.page.waitForTimeout(1_500);

    return true;
  }

  private async findNearestOpenQuantityOption(
    quantityControl: Locator,
    quantity: string,
  ): Promise<Locator | null> {
    const controlBox = await quantityControl.boundingBox();

    const activeOptions = this.page
      .locator(
        [
          `[id="${quantity}"]`,
          `.selecter.open .selecter-options .selecter-item[data-value="${quantity}"]`,
          `.selecter.open .selecter-item[data-value="${quantity}"]`,
          `.selecter-options:visible .selecter-item[data-value="${quantity}"]`,
          `[role="listbox"]:visible [role="option"][data-value="${quantity}"]`,
          `[role="listbox"]:visible [role="option"]`,
          `.ui-menu:visible .ui-menu-item`,
        ].join(', '),
      )
      .filter({
        visible: true,
        hasText: new RegExp(`^\\s*${escapeRegex(quantity)}\\s*$`),
      });

    const count = await activeOptions.count();

    if (count === 0) {
      return null;
    }

    let bestIndex = -1;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (let index = 0; index < count; index += 1) {
      const candidate = activeOptions.nth(index);
      const box = await candidate.boundingBox();

      if (!box) {
        continue;
      }

      if (!controlBox) {
        return candidate;
      }

      const controlCenterX = controlBox.x + controlBox.width / 2;
      const controlCenterY = controlBox.y + controlBox.height / 2;
      const candidateCenterX = box.x + box.width / 2;
      const candidateCenterY = box.y + box.height / 2;

      const distance = Math.hypot(
        candidateCenterX - controlCenterX,
        candidateCenterY - controlCenterY,
      );

      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    }

    return bestIndex >= 0 ? activeOptions.nth(bestIndex) : null;
  }

  private async waitForPowerSupplyAndHeatsinkStable(row: Locator) {
    let consecutiveMatches = 0;
    let lastPower = '';
    let lastHeatsink = '';

    try {
      await expect
        .poll(
          async () => {
            const powerQuantity = await this.readRowQuantity(row).catch(() => '');
            const heatsink = await this.readAutomaticHeatsinkState();

            if (
              powerQuantity !== lastPower ||
              heatsink.quantity !== lastHeatsink
            ) {
              console.log('[INFO] Stability observation after Power Supply click:', {
                powerSupplyQuantity: powerQuantity || '<empty>',
                heatsinkQuantity: heatsink.quantity || '<empty>',
              });

              lastPower = powerQuantity;
              lastHeatsink = heatsink.quantity;
            }

            if (heatsink.quantity !== '2') {
              throw new Error(
                `Automatic heatsink ${HEATSINK_KIT_PART} changed to ` +
                  `${heatsink.quantity || '<empty>'} during Power Supply recalculation`,
              );
            }

            consecutiveMatches =
              powerQuantity === '1' && heatsink.quantity === '2'
                ? consecutiveMatches + 1
                : 0;

            return consecutiveMatches;
          },
          {
            message:
              `Power Supply ${POWER_SUPPLY_PART} must remain 1 while ` +
              `heatsink ${HEATSINK_KIT_PART} remains 2`,
            timeout: 45_000,
            intervals: [750, 1_000, 1_250, 1_500],
          },
        )
        .toBeGreaterThanOrEqual(3);

      return true;
    } catch (error) {
      console.log(
        '[WARN] Power Supply/heatsink stability verification failed:',
        String(error).split('\n')[0],
      );
      return false;
    }
  }

  async selectLiteService() {
    await waitForBlockingOverlay(this.page);

    await this.verifyAutomaticHeatsinkQuantityReadOnly('before opening Services');

    await waitBeforeAction(this.page);

    await this.page.getByRole('link', { name: 'Services', exact: true }).click();

    await waitForBlockingOverlay(this.page);
    await waitBeforeAction(this.page);

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

    const radioDefault = this.page.locator('.radio_default').filter({ visible: true }).first();

    await safeClick(radioDefault);
  }

  async runBillingTierSetup() {
    await waitForBlockingOverlay(this.page);
    await waitBeforeAction(this.page);

    await this.page.getByRole('link', { name: 'BOM' }).click();

    await waitForBlockingOverlay(this.page);

    await this.page.locator('#eo_nav_li_0').click().catch(() => undefined);

    await waitForBlockingOverlay(this.page);

    const billingTierButton = this.page
      .locator('#obw_billingtier_bot')
      .or(this.page.getByText('Billing Tier Setup'))
      .first();

    await safeClick(billingTierButton);

    await this.closeBillingTierDialogIfVisible();

    await waitForBlockingOverlay(this.page);
  }

  async saveOcaConfig() {
    await waitForBlockingOverlay(this.page);
    await this.closeBillingTierDialogIfVisible();
    await this.waitForModalOverlayHidden();

    await waitBeforeAction(this.page);

    await this.page.locator('#save #save_icon, [title="Save"] #save_icon, #save_icon').first().click();

    await waitForBlockingOverlay(this.page);
    await waitBeforeAction(this.page);

    await this.page.getByText('Save OCA Config').first().click();

    await waitForBlockingOverlay(this.page);

    const saveDialog = this.page
      .locator('.ui-dialog, [role="dialog"]')
      .filter({ hasText: /Save|Acknowledge Errors before Saving|Action-Required/i })
      .last();

    await saveDialog.waitFor({ state: 'visible', timeout: 60_000 });

    await this.saveDialogWithAcknowledgeRetry(saveDialog);

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

  async generateAndAssociateEndBom() {
    await this.page.locator('#obw_endbom_bot').or(this.page.getByText('End BOM', { exact: true })).first().click();

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

    const sectionText = this.page
      .getByText(new RegExp(`^${escapeRegex(label)}$`, 'i'))
      .filter({ visible: true })
      .first();

    await safeClick(sectionText);
  }

  private async toggleHpeRecommendedOnlyForMemory() {
    const toggle = this.page
      .locator('label')
      .filter({ hasText: /HPE Recommended only|View HPE Recommended only/i })
      .filter({ visible: true })
      .first();

    if (!(await toggle.isVisible({ timeout: 10_000 }).catch(() => false))) {
      console.log('[INFO] HPE Recommended only toggle not visible');
      return;
    }

    await this.scrollToCenter(toggle, 'HPE Recommended only toggle');

    await toggle.click({ force: true }).catch(async () => {
      await toggle.evaluate((element) => (element as HTMLElement).click());
    });

    const yesButton = this.page.getByRole('button', { name: /^Yes$/i });

    if (await yesButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await yesButton.click({ force: true });
    }

    await waitForBlockingOverlay(this.page);
  }

  private async waitForProductRow(partNumber: string, label: string) {
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

  private async selectRowRadio(row: Locator, label: string) {
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

  private async selectRowQuantity(row: Locator, quantity: string, label: string) {
    await waitForBlockingOverlay(this.page);

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

    await this.scrollToCenter(quantityControl, `${label} quantity control`);

    console.log(`[DEBUG] ${label} quantity control details:`, await this.debugLocatorDetails(quantityControl, `${label} quantity control`));

    await quantityControl.click({ force: true }).catch(async () => {
      const box = await quantityControl.boundingBox();

      if (box) {
        await this.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      } else {
        await quantityControl.evaluate((element) => (element as HTMLElement).click());
      }
    });

    await this.page.waitForTimeout(700);

    const exactQuantity = new RegExp(`^\\s*${escapeRegex(quantity)}\\s*$`);

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
      .filter({ visible: true, hasText: exactQuantity })
      .first();

    await expect(option, `${label} quantity option ${quantity} should be visible`).toBeVisible({
      timeout: 10_000,
    });

    await this.scrollToCenter(option, `${label} quantity option ${quantity}`);

    await option.click({ force: true }).catch(async () => {
      await option.evaluate((element) => (element as HTMLElement).click());
    });

    await waitForBlockingOverlay(this.page);
    await this.page.waitForTimeout(2_000);

    const finalValue = await this.readRowQuantity(row).catch(() => '');

    if (finalValue && finalValue !== quantity) {
      console.log(`[WARN] ${label} quantity read as "${finalValue}" after selecting ${quantity}. Continuing because OCA sometimes exposes stale text.`);
    } else {
      console.log(`[INFO] ${label} quantity selection completed. Read value: ${finalValue || '<empty>'}`);
    }
  }

  private async saveDialogWithAcknowledgeRetry(saveDialog: Locator) {
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      console.log(`[STEP] Save dialog visual acknowledge/save attempt ${attempt}`);

      await saveDialog.waitFor({ state: 'visible', timeout: 60_000 });

      const acknowledgeState = await this.acknowledgeActionRequiredVisually();

      console.log('[DEBUG] Acknowledge visual-click state:', acknowledgeState);

      await this.page.waitForTimeout(1_000);

      const saveButton = this.page
        .locator('#save_btn')
        .filter({ visible: true })
        .last();

      await saveButton.waitFor({ state: 'visible', timeout: 60_000 });

      const saveState = await this.readSaveButtonState(saveButton);

      console.log('[DEBUG] Save button state after acknowledge:', saveState);

      if (
        acknowledgeState.acknowledgeVisible &&
        !acknowledgeState.acknowledged &&
        /btn-disabled-no-clic-check|disabled/i.test(saveState.className ?? '')
      ) {
        console.log(
          '[WARN] Acknowledge is visible but the application still reports it as unchecked. Retrying visual click.',
        );
        continue;
      }

      await this.clickCustomSaveButton(saveButton);

      await Promise.race([
        saveDialog.waitFor({ state: 'hidden', timeout: 25_000 }).catch(() => undefined),
        this.page
          .getByText(/\(OCA\) has encountered a problem/)
          .waitFor({ state: 'visible', timeout: 25_000 })
          .catch(() => undefined),
        this.page
          .locator('#obw_endbom_bot')
          .or(this.page.getByText('End BOM', { exact: true }))
          .filter({ visible: true })
          .first()
          .waitFor({ state: 'visible', timeout: 25_000 })
          .catch(() => undefined),
      ]);

      const problemVisible = await this.page
        .getByText(/\(OCA\) has encountered a problem/)
        .isVisible({ timeout: 1_000 })
        .catch(() => false);

      if (problemVisible) {
        console.log('[ERROR] OCA problem dialog became visible after Save click');
        return;
      }

      const dialogStillVisible = await saveDialog
        .isVisible({ timeout: 2_000 })
        .catch(() => false);

      if (!dialogStillVisible) {
        console.log('[INFO] Save dialog closed successfully');
        return;
      }

      const endBomVisible = await this.page
        .locator('#obw_endbom_bot')
        .or(this.page.getByText('End BOM', { exact: true }))
        .filter({ visible: true })
        .first()
        .isVisible({ timeout: 2_000 })
        .catch(() => false);

      if (endBomVisible) {
        console.log('[INFO] Save completed and End BOM is visible');
        return;
      }

      console.log('[WARN] Save dialog remains visible; retrying acknowledge and Save');
    }

    throw new Error(
      `Save dialog remained open. Final diagnostics: ${JSON.stringify(
        await this.debugAcknowledgeAcrossFrames(),
      )}`,
    );
  }

  private async acknowledgeActionRequiredVisually() {
    const initial = await this.debugAcknowledgeAcrossFrames();

    if (!initial.acknowledgeVisible) {
      console.log('[INFO] Action-Required acknowledge control is not visible; Save can proceed directly');

      return {
        acknowledgeVisible: false,
        acknowledged: false,
        clickedBy: 'not required',
        diagnostics: initial,
      };
    }

    for (const frame of this.page.frames()) {
      const frameResult = await frame
        .evaluate(() => {
          const normalize = (value: string | null | undefined) =>
            (value ?? '').replace(/\s+/g, ' ').trim();

          const isVisible = (element: Element | null) => {
            if (!element) {
              return false;
            }

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

          const textElements = Array.from(
            document.querySelectorAll<HTMLElement>('label, span, div, td, p'),
          )
            .filter((element) => isVisible(element))
            .filter((element) =>
              /Acknowledge Errors before Saving as Action-Required/i.test(
                normalize(element.textContent),
              ),
            )
            .sort((left, right) => {
              const leftLength = normalize(left.textContent).length;
              const rightLength = normalize(right.textContent).length;
              return leftLength - rightLength;
            });

          const textElement = textElements[0];

          const input = document.querySelector<HTMLInputElement>(
            '#ack_flag, input[type="checkbox"][id*="ack" i], input[type="checkbox"][name*="ack" i]',
          );

          const icon = Array.from(
            document.querySelectorAll<HTMLElement>(
              '#ack_checkbox, [id*="ack_checkbox" i], [class*="ack_checkbox" i], [class*="checkbox" i]',
            ),
          ).find((element) => isVisible(element));

          const label = Array.from(
            document.querySelectorAll<HTMLElement>(
              'label[for="ack_flag"], label[for*="ack" i], label',
            ),
          ).find(
            (element) =>
              isVisible(element) &&
              /Acknowledge Errors before Saving as Action-Required/i.test(
                normalize(element.textContent),
              ),
          );

          const readAcknowledged = () => {
            const refreshedInput = document.querySelector<HTMLInputElement>(
              '#ack_flag, input[type="checkbox"][id*="ack" i], input[type="checkbox"][name*="ack" i]',
            );
            const refreshedIcon = document.querySelector<HTMLElement>(
              '#ack_checkbox, [id*="ack_checkbox" i], [class*="ack_checkbox" i]',
            );

            return Boolean(
              refreshedInput?.checked ||
                refreshedInput?.getAttribute('checked') != null ||
                refreshedIcon?.getAttribute('aria-checked') === 'true' ||
                /active|checked|selected/i.test(String(refreshedIcon?.className ?? '')),
            );
          };

          if (readAcknowledged()) {
            return {
              found: true,
              acknowledged: true,
              clickedBy: 'already acknowledged',
              textBox: null,
              iconBox: null,
            };
          }

          const dispatchRealisticClick = (target: HTMLElement) => {
            target.scrollIntoView({ block: 'center', inline: 'center' });

            const rect = target.getBoundingClientRect();
            const eventInit = {
              bubbles: true,
              cancelable: true,
              view: window,
              clientX: rect.x + rect.width / 2,
              clientY: rect.y + rect.height / 2,
            };

            target.dispatchEvent(new PointerEvent('pointerdown', eventInit));
            target.dispatchEvent(new MouseEvent('mousedown', eventInit));
            target.dispatchEvent(new PointerEvent('pointerup', eventInit));
            target.dispatchEvent(new MouseEvent('mouseup', eventInit));
            target.dispatchEvent(new MouseEvent('click', eventInit));
            target.click();
          };

          let clickedBy = '';

          if (icon) {
            dispatchRealisticClick(icon);
            clickedBy = 'visible custom checkbox icon';
          } else if (label) {
            dispatchRealisticClick(label);
            clickedBy = 'visible checkbox label';
          } else if (textElement) {
            let current: Element | null = textElement;

            for (
              let depth = 0;
              current && depth < 8;
              depth += 1, current = current.parentElement
            ) {
              const nearby = Array.from(
                current.querySelectorAll<HTMLElement>(
                  '#ack_checkbox, [id*="ack" i], [class*="checkbox" i], label',
                ),
              ).find(
                (candidate) =>
                  isVisible(candidate) &&
                  !/Acknowledge Errors before Saving as Action-Required/i.test(
                    normalize(candidate.textContent),
                  ),
              );

              if (nearby) {
                dispatchRealisticClick(nearby);
                clickedBy = 'nearby visible checkbox control';
                break;
              }
            }
          }

          const jquery = (
            window as typeof window & {
              jQuery?: (
                selector: string,
              ) => {
                prop: (name: string, value: unknown) => unknown;
                trigger: (name: string) => unknown;
              };
            }
          ).jQuery;

          if (!readAcknowledged() && jquery) {
            try {
              jquery('#ack_flag').prop('checked', true);
              jquery('#ack_flag').trigger('change');
              jquery('#ack_checkbox').trigger('click');
              clickedBy = clickedBy || 'jQuery checkbox event';
            } catch {
              // Continue with native-state synchronization.
            }
          }

          if (!readAcknowledged() && input) {
            input.checked = true;
            input.setAttribute('checked', 'checked');
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            clickedBy = clickedBy || 'hidden checkbox state synchronization';
          }

          const textRect = textElement?.getBoundingClientRect();
          const iconRect = icon?.getBoundingClientRect();

          return {
            found: Boolean(textElement || icon || label || input),
            acknowledged: readAcknowledged(),
            clickedBy,
            textBox: textRect
              ? {
                  x: textRect.x,
                  y: textRect.y,
                  width: textRect.width,
                  height: textRect.height,
                }
              : null,
            iconBox: iconRect
              ? {
                  x: iconRect.x,
                  y: iconRect.y,
                  width: iconRect.width,
                  height: iconRect.height,
                }
              : null,
          };
        })
        .catch(() => null);

      if (!frameResult?.found) {
        continue;
      }

      if (frameResult.acknowledged) {
        return {
          acknowledgeVisible: true,
          acknowledged: true,
          clickedBy: frameResult.clickedBy,
          diagnostics: await this.debugAcknowledgeAcrossFrames(),
        };
      }

      // Coordinate fallback: click the visible box itself. If no separate checkbox
      // element exists, click several points immediately to the left of the text.
      if (frame === this.page.mainFrame()) {
        if (frameResult.iconBox) {
          await this.page.mouse.click(
            frameResult.iconBox.x + frameResult.iconBox.width / 2,
            frameResult.iconBox.y + frameResult.iconBox.height / 2,
          );
        } else if (frameResult.textBox) {
          const y = frameResult.textBox.y + frameResult.textBox.height / 2;

          for (const offset of [12, 20, 28, 36, 44]) {
            await this.page.mouse.click(
              Math.max(1, frameResult.textBox.x - offset),
              y,
            );
            await this.page.waitForTimeout(250);

            const verified = await this.isAcknowledgeCheckedInAnyFrame();

            if (verified) {
              return {
                acknowledgeVisible: true,
                acknowledged: true,
                clickedBy: `mouse click ${offset}px left of acknowledge text`,
                diagnostics: await this.debugAcknowledgeAcrossFrames(),
              };
            }
          }
        }
      }
    }

    return {
      acknowledgeVisible: true,
      acknowledged: await this.isAcknowledgeCheckedInAnyFrame(),
      clickedBy: 'all fallbacks attempted',
      diagnostics: await this.debugAcknowledgeAcrossFrames(),
    };
  }

  private async isAcknowledgeCheckedInAnyFrame() {
    for (const frame of this.page.frames()) {
      const checked = await frame
        .evaluate(() => {
          const input = document.querySelector<HTMLInputElement>(
            '#ack_flag, input[type="checkbox"][id*="ack" i], input[type="checkbox"][name*="ack" i]',
          );

          const icon = document.querySelector<HTMLElement>(
            '#ack_checkbox, [id*="ack_checkbox" i], [class*="ack_checkbox" i]',
          );

          return Boolean(
            input?.checked ||
              input?.getAttribute('checked') != null ||
              icon?.getAttribute('aria-checked') === 'true' ||
              /active|checked|selected/i.test(String(icon?.className ?? '')),
          );
        })
        .catch(() => false);

      if (checked) {
        return true;
      }
    }

    return false;
  }

  private async readSaveButtonState(saveButton: Locator) {
    return saveButton
      .evaluate((element) => ({
        tag: element.tagName,
        id: (element as HTMLElement).id,
        className: String((element as HTMLElement).className),
        ariaDisabled: element.getAttribute('aria-disabled'),
        disabled: element.hasAttribute('disabled'),
        html: (element as HTMLElement).outerHTML.slice(0, 700),
      }))
      .catch((error) => ({
        tag: '',
        id: '',
        className: '',
        ariaDisabled: null,
        disabled: false,
        html: '',
        error: String(error),
      }));
  }

  private async clickCustomSaveButton(saveButton: Locator) {
    const box = await saveButton.boundingBox().catch(() => null);

    if (box) {
      await this.page.mouse.click(
        box.x + box.width / 2,
        box.y + box.height / 2,
      );
      return;
    }

    await saveButton.click({ force: true }).catch(async () => {
      await saveButton.evaluate((element) => {
        const html = element as HTMLElement;
        const rect = html.getBoundingClientRect();
        const eventInit = {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: rect.x + rect.width / 2,
          clientY: rect.y + rect.height / 2,
        };

        html.dispatchEvent(new PointerEvent('pointerdown', eventInit));
        html.dispatchEvent(new MouseEvent('mousedown', eventInit));
        html.dispatchEvent(new PointerEvent('pointerup', eventInit));
        html.dispatchEvent(new MouseEvent('mouseup', eventInit));
        html.dispatchEvent(new MouseEvent('click', eventInit));
        html.click();
      });
    });
  }

  private async debugAcknowledgeAcrossFrames() {
    const diagnostics = [];

    for (const [index, frame] of this.page.frames().entries()) {
      const detail = await frame
        .evaluate(() => {
          const normalize = (value: string | null | undefined) =>
            (value ?? '').replace(/\s+/g, ' ').trim();

          const isVisible = (element: Element | null) => {
            if (!element) {
              return false;
            }

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

          const input = document.querySelector<HTMLInputElement>(
            '#ack_flag, input[type="checkbox"][id*="ack" i], input[type="checkbox"][name*="ack" i]',
          );

          const icons = Array.from(
            document.querySelectorAll<HTMLElement>(
              '#ack_checkbox, [id*="ack_checkbox" i], [class*="ack_checkbox" i], [class*="checkbox" i]',
            ),
          )
            .filter((element) => isVisible(element))
            .slice(0, 20)
            .map((element) => ({
              id: element.id,
              className: String(element.className),
              ariaChecked: element.getAttribute('aria-checked'),
              html: element.outerHTML.slice(0, 400),
            }));

          const acknowledgeTexts = Array.from(
            document.querySelectorAll<HTMLElement>('label, span, div, td, p'),
          )
            .filter((element) => isVisible(element))
            .filter((element) =>
              /Acknowledge Errors before Saving as Action-Required/i.test(
                normalize(element.textContent),
              ),
            )
            .slice(0, 10)
            .map((element) => {
              const rect = element.getBoundingClientRect();

              return {
                tag: element.tagName,
                id: element.id,
                className: String(element.className),
                text: normalize(element.textContent).slice(0, 300),
                rect: {
                  x: Math.round(rect.x),
                  y: Math.round(rect.y),
                  width: Math.round(rect.width),
                  height: Math.round(rect.height),
                },
              };
            });

          return {
            url: location.href,
            input: input
              ? {
                  id: input.id,
                  checked: input.checked,
                  disabled: input.disabled,
                  visible: isVisible(input),
                  html: input.outerHTML.slice(0, 400),
                }
              : null,
            icons,
            acknowledgeTexts,
          };
        })
        .catch((error) => ({ error: String(error) }));

      diagnostics.push({
        frameIndex: index,
        frameUrl: frame.url(),
        ...detail,
      });
    }

    return diagnostics;
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

function updateEndBomWorkbook(result: FirstModelExcelResult) {
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
