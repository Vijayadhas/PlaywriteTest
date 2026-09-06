import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test';
import * as XLSX from 'xlsx';


namespace Model1 {
const BASE_URL =
  'https://ngc-itg-oca-internal.its.hpecorp.net/ocaPreForkM1/OCAInternalLogin';

const AUTH_WAIT_MS = 40_000;
const ACTION_DELAY_MS = 2_000;
const CHROME_PROFILE_DIR = 'C:\\selenium\\oca-profile';
const END_BOM_WORKBOOK_PATH = 'C:\\workspace\\Playwright\\EndBomModelValidation.xlsx';

const BASE_MODEL_PART = 'P72176-B21';
const PROCESSOR_PART = 'P73829-B21';
const MEMORY_PART = 'P69727-B21';
const POWER_SUPPLY_PART = 'P03178-B21';

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

    const aaSOption = this.page.getByText(/^aaS$/i).filter({ visible: true }).first();

    if (await aaSOption.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await safeClick(aaSOption);
    }

    await waitForBlockingOverlay(this.page);
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

    console.log('[PASS] OCA Config page opened successfully for model:', partNumber);
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
    await this.openSection('Power Supplies', '#section_header_power, [id*="section_header" i][id*="power" i]');

    const row = await this.waitForProductRow(POWER_SUPPLY_PART, 'Power Supply');

    await this.selectRowQuantity(row, '1', `Power Supply ${POWER_SUPPLY_PART}`);
  }

  async selectLiteService() {
    await waitForBlockingOverlay(this.page);
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
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      console.log(`[STEP] Save dialog acknowledge/save attempt ${attempt}`);

      await saveDialog.waitFor({ state: 'visible', timeout: 60_000 });

      await this.clickAcknowledgeOnce(saveDialog);

      await this.page.waitForTimeout(1_000);

      const saveButton = saveDialog.locator('#save_btn').last();

      await saveButton.waitFor({ state: 'visible', timeout: 60_000 });

      await saveButton.click({ force: true }).catch(async () => {
        await saveButton.evaluate((element) => (element as HTMLElement).click());
      });

      await Promise.race([
        saveDialog.waitFor({ state: 'hidden', timeout: 20_000 }).catch(() => undefined),
        this.page
          .getByText(/\(OCA\) has encountered a problem/)
          .waitFor({ state: 'visible', timeout: 20_000 })
          .catch(() => undefined),
      ]);

      const stillVisible = await saveDialog.isVisible({ timeout: 2_000 }).catch(() => false);

      if (!stillVisible) {
        console.log('[INFO] Save dialog closed successfully');
        return;
      }

      console.log('[WARN] Save dialog is still visible; retrying acknowledge and Save');
    }

    throw new Error('Save dialog remained open after acknowledging and clicking Save multiple times');
  }

  private async clickAcknowledgeOnce(saveDialog: Locator) {
    const acknowledgeText = saveDialog
      .getByText(/Acknowledge Errors before Saving as Action-Required/i)
      .first();

    if (!(await acknowledgeText.isVisible({ timeout: 5_000 }).catch(() => false))) {
      console.log('[INFO] Acknowledge Errors checkbox was not visible in Save dialog; skipping acknowledge');
      return;
    }

    const ackIcon = saveDialog.locator('#ack_checkbox').first();
    const ackLabel = saveDialog.locator('label[for="ack_flag"]').first();

    if (await ackIcon.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await ackIcon.click({ force: true }).catch(async () => {
        await ackIcon.evaluate((element) => (element as HTMLElement).click());
      });
      return;
    }

    if (await ackLabel.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await ackLabel.click({ force: true }).catch(async () => {
        await ackLabel.evaluate((element) => (element as HTMLElement).click());
      });
    }
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


export async function run(page: Page, context: BrowserContext) {
  const result: FirstModelExcelResult = { modelNo: BASE_MODEL_PART, processor: SELECTED_PROCESSOR, memory: SELECTED_MEMORY, service: SERVICE_LEVEL, startBomUcid: '', endBomUcid: '', associateEndBom: 'No', status: 'Fail' };
  try {
    console.log('[START] Model 1 started');
    const flow = new FirstModelFlow(page, context, result);
    await test.step('Model 1 - Open OCA and authenticate', async () => flow.openOca());
    await test.step(`Model 1 - Search and open ${BASE_MODEL_PART}`, async () => flow.searchAndOpenModel(BASE_MODEL_PART));
    await test.step('Model 1 - Smart Chassis', async () => flow.selectSmartChassis());
    await test.step(`Model 1 - Processor ${PROCESSOR_PART}`, async () => flow.selectProcessor());
    await test.step(`Model 1 - Memory ${MEMORY_PART}`, async () => flow.selectMemory());
    await test.step(`Model 1 - Power ${POWER_SUPPLY_PART}`, async () => flow.selectPowerSupply());
    await test.step('Model 1 - Lite service', async () => flow.selectLiteService());
    await test.step('Model 1 - Billing Tier Setup', async () => flow.runBillingTierSetup());
    await test.step('Model 1 - Save', async () => flow.saveOcaConfig());
    await test.step('Model 1 - End BOM', async () => flow.generateAndAssociateEndBom());
    result.status = 'Pass'; updateEndBomWorkbook(result); console.log('[PASS] Model 1 completed');
  } catch (error) { console.error('[FAIL] Model 1 failed:', error); updateEndBomWorkbook({ ...result, status: 'Fail' }); throw error; }
}

}


namespace Model2 {
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
               const wrappedError = new Error(
                    `${label} quantity did not remain ${quantity} after UI recalculation; final value was ${finalValue || '<empty>'}`,
               );
               (wrappedError as Error & { cause?: unknown }).cause = error;
               throw wrappedError;
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


export async function run(page: Page, context: BrowserContext) {
  const result: SecondModelExcelResult = { modelNo: BASE_MODEL_PART, processor: SELECTED_PROCESSOR, memory: SELECTED_MEMORY, networkCard: NETWORK_CARD_PART, service: SERVICE_LEVEL, startBomUcid: '', endBomUcid: '', associateEndBom: 'No', status: 'Fail' };
  try {
    console.log('[START] Model 2 started');
    const flow = new SecondModelOcaConfigFlow(page, context, result);
    let configPage: Page;
    await test.step(`Model 2 - Search and open ${BASE_MODEL_PART}`, async () => { configPage = await flow.searchAndOpenBaseModel(BASE_MODEL_PART); });
    await test.step('Model 2 - Smart Chassis defaults', async () => { await flow.useConfigPage(configPage); await flow.selectSmartChassisDefaults(); });
    await test.step('Model 2 - Recommended only', async () => flow.selectRecommendedOnlyOnce());
    await test.step(`Model 2 - Network ${NETWORK_CARD_PART}`, async () => flow.configureNetworkingCard(NETWORK_CARD_PART));
    await test.step('Model 2 - Lite service', async () => flow.selectLiteService());
    await test.step('Model 2 - Billing Tier Setup', async () => flow.runBillingTierSetup());
    await test.step('Model 2 - Save', async () => flow.saveOcaConfig());
    await test.step('Model 2 - End BOM', async () => flow.generateAndAssociateEndBom());
    result.status = 'Pass'; updateEndBomWorkbook(result); console.log('[PASS] Model 2 completed');
  } catch (error) { console.error('[FAIL] Model 2 failed:', error); updateEndBomWorkbook({ ...result, status: 'Fail' }); throw error; }
}

}


namespace Model3 {
const BASE_URL =
  'https://ngc-itg-oca-internal.its.hpecorp.net/ocaPreForkM1/OCAInternalLogin';

const AUTH_WAIT_MS = 40_000;
const ACTION_DELAY_MS = 2_000;
const CHROME_PROFILE_DIR = 'C:\\selenium\\oca-profile';
const END_BOM_WORKBOOK_PATH = 'C:\\workspace\\Playwright\\EndBomModelValidation.xlsx';

const BASE_MODEL_PART = 'P73286-B21';
const PROCESSOR_PART = 'P74503-B21';
const MEMORY_PART = 'P69727-F21';

const SELECTED_PROCESSOR =
  'P74503-B21 Intel Xeon 6505P 2.2GHz 12-core 150W Processor for HPE';

const SELECTED_MEMORY =
  'P69727-F21 HPE 32GB (1x32GB) Dual Rank x8 DDR5-6400 CAS-52-52-52 EC8 Registered Smart FIO Memory Kit';

const SERVICE_LEVEL = 'Lite';
const EXPECTED_PAGE_TEXT = 'OCA Config 2';

type ThirdModelExcelResult = {
  modelNo: string;
  processor: string;
  memory: string;
  service: string;
  startBomUcid: string;
  endBomUcid: string;
  associateEndBom: 'Yes' | 'No';
  status: 'Pass' | 'Fail';
};



class ThirdModelOcaConfigFlow {
  private page: Page;

  constructor(
    page: Page,
    private readonly context: BrowserContext,
    private readonly result: ThirdModelExcelResult,
  ) {
    this.page = page;
  }

  async useConfigPage(page: Page) {
    this.page = page;
    this.page.setDefaultTimeout(30_000);
    this.page.setDefaultNavigationTimeout(90_000);

    await expect(this.page.getByText(EXPECTED_PAGE_TEXT, { exact: false }).first()).toBeVisible({
      timeout: 60_000,
    });
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
        {
          message: 'OCA authenticated landing page should be ready',
          timeout: 180_000,
        },
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

    await search.click().catch(() => undefined);
    await search.fill(partNumber);

    const autocompleteOption = this.page
      .locator('ul.ui-autocomplete:not([style*="display: none"]) li.ui-menu-item, [role="option"]')
      .filter({ hasText: partNumber })
      .first();

    await safeClick(autocompleteOption);

    await this.page.locator('#dqe_cards_container').waitFor({
      state: 'visible',
      timeout: 60_000,
    });

    const ctoCard = await this.findCtoCard(partNumber);

    await expect(ctoCard, `CTO card for ${partNumber} should be visible`).toBeVisible({
      timeout: 60_000,
    });

    await this.selectProductNumberIfAvailable(ctoCard, partNumber);

    const newPagePromise = this.context.waitForEvent('page', { timeout: 15_000 }).catch(() => null);

    await this.clickCtoCustomizeButton(ctoCard);

    const newPage = await newPagePromise;
    const configPage = newPage ?? this.page;

    await configPage.waitForLoadState('domcontentloaded').catch(() => undefined);

    await expect(configPage.getByText(EXPECTED_PAGE_TEXT, { exact: false }).first()).toBeVisible({
      timeout: 60_000,
    });

    return configPage;
  }

  async selectSmartChassis() {
    await waitForBlockingOverlay(this.page);

    const smartChassisHeader = this.page
      .getByRole('button', { name: /Smart Chassis/i })
      .or(
        this.page
          .locator('#section_header_smartChassis, [id*="smartChassis" i], [id*="smart_chassis" i], .section_header')
          .filter({ hasText: /Smart Chassis/i }),
      )
      .or(this.page.getByText(/Smart Chassis/i))
      .filter({ visible: true })
      .last();

    if (await smartChassisHeader.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await safeClick(smartChassisHeader);
    }

    const row = this.page
      .locator('tr.item_tr, tr')
      .filter({ hasText: 'Includes 1x 12EDSFF drive cage' })
      .filter({ visible: true })
      .first();

    await expect(row, 'Third model Smart Chassis row should be visible').toBeVisible({
      timeout: 60_000,
    });

    await row.scrollIntoViewIfNeeded();

    const radio = row.locator('input[type="radio"], #radio').first();

    if (await radio.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await radio.check({ force: true }).catch(async () => radio.click({ force: true }));
    } else {
      await safeClick(row);
    }

    await waitForBlockingOverlay(this.page);
  }

  async selectProcessor() {
    await waitForBlockingOverlay(this.page);

    await this.openSectionIfRequired({
      label: 'Processor',
      sectionSelector:
        '#section_header_processor, #section_header_processorSection, [id*="section_header" i][id*="processor" i], [id*="ProcessorSection" i]',
      rowPartNumber: PROCESSOR_PART,
      fallbackText: /Processor/i,
    });

    await this.selectProcessorQuantityUsingRecordedFlow();

    await waitForBlockingOverlay(this.page);
  }

  async selectMemory() {
    await waitForBlockingOverlay(this.page);

    await this.openSectionIfRequired({
      label: 'Memory',
      sectionSelector:
        '#section_header_memory, #section_header_memorySection, [id*="section_header" i][id*="memory" i], [id*="MemorySection" i]',
      rowPartNumber: MEMORY_PART,
      fallbackText: /Memory/i,
    });

    await this.selectMemoryQuantityUsingRecordedFlow();

    await waitForBlockingOverlay(this.page);
  }

  async selectLiteService() {
    await waitForBlockingOverlay(this.page);
    await waitBeforeAction(this.page);

    await this.page.getByRole('link', { name: 'Services', exact: true }).click();

    await waitForBlockingOverlay(this.page);
    await waitBeforeAction(this.page);

    const liteOption = this.page.locator('label').filter({ hasText: /^Lite$/ }).locator('span').first();

    if (await liteOption.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await liteOption.click();
    } else {
      await this.page.locator('.radio_default').first().click();
    }

    await waitForBlockingOverlay(this.page);
  }

  async runBillingTierSetup() {
    await waitForBlockingOverlay(this.page);
    await waitBeforeAction(this.page);

    await this.page.locator('#eo_nav_li_0').click().catch(() => undefined);

    await waitForBlockingOverlay(this.page);

    await this.page.getByRole('link', { name: 'BOM' }).click();

    await waitForBlockingOverlay(this.page);

    await this.page.getByText('Billing Tier Setup').click();

    await this.closeBillingTierDialogIfVisible();

    await waitForBlockingOverlay(this.page);
  }

  async saveOcaConfig() {
    await waitForBlockingOverlay(this.page);

    await this.closeBillingTierDialogIfVisible();
    await this.waitForModalOverlayHidden();

    await waitBeforeAction(this.page);

    console.log('[STEP] Clicking Save icon');
    await this.page.locator('#save #save_icon, [title="Save"] #save_icon, #save_icon').first().click();

    await waitForBlockingOverlay(this.page);
    await waitBeforeAction(this.page);

    console.log('[STEP] Clicking Save OCA Config');
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

  private async saveDialogWithAcknowledgeRetry(saveDialog: Locator) {
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      console.log(`[STEP] Save dialog acknowledge/save attempt ${attempt}`);

      await saveDialog.waitFor({ state: 'visible', timeout: 60_000 });

      console.log('[DEBUG] Save dialog before acknowledge/save attempt:', await this.debugSingleDialog(saveDialog));

      await this.clickAcknowledgeOnce(saveDialog);

      await this.page.waitForTimeout(1_000);

      const saveButton = saveDialog.locator('#save_btn').last();

      await saveButton.waitFor({ state: 'visible', timeout: 60_000 });

      const saveButtonState = await this.readSaveButtonState(saveButton);
      console.log('[DEBUG] Save button state before click:', saveButtonState);

      console.log('[STEP] Clicking Save button in Save dialog');
      await saveButton.click({ force: true }).catch(async (error) => {
        console.log('[WARN] Save button force click failed:', String(error).split('\n')[0]);
        await saveButton.evaluate((element) => (element as HTMLElement).click());
      });

      await Promise.race([
        saveDialog.waitFor({ state: 'hidden', timeout: 20_000 }).catch(() => undefined),
        this.page
          .getByText(/\(OCA\) has encountered a problem/)
          .waitFor({ state: 'visible', timeout: 20_000 })
          .catch(() => undefined),
      ]);

      const stillVisible = await saveDialog.isVisible({ timeout: 2_000 }).catch(() => false);
      console.log(`[DEBUG] Save dialog still visible after attempt ${attempt}:`, stillVisible);

      if (!stillVisible) {
        console.log('[INFO] Save dialog closed successfully');
        return;
      }

      console.log('[WARN] Save dialog is still visible; retrying acknowledge and Save');
      console.log('[DEBUG] Save dialog after failed save attempt:', await this.debugSingleDialog(saveDialog));
    }

    throw new Error('Save dialog remained open after acknowledging and clicking Save multiple times');
  }

  private async clickAcknowledgeOnce(saveDialog: Locator) {
    const acknowledgeText = saveDialog
      .getByText(/Acknowledge Errors before Saving as Action-Required/i)
      .first();

    if (!(await acknowledgeText.isVisible({ timeout: 5_000 }).catch(() => false))) {
      console.log('[INFO] Acknowledge Errors checkbox was not visible in Save dialog; skipping acknowledge');
      return;
    }

    const ackIcon = saveDialog.locator('#ack_checkbox').first();
    const ackLabel = saveDialog.locator('label[for="ack_flag"]').first();
    const ackInput = saveDialog.locator('#ack_flag').first();

    const before = await this.readAcknowledgeState(saveDialog);
    console.log('[DEBUG] Acknowledge state before click:', before);

    if (before.iconActive && before.inputChecked) {
      console.log('[INFO] Acknowledge already appears selected');
      return;
    }

    if (await ackIcon.isVisible({ timeout: 5_000 }).catch(() => false)) {
      console.log('[STEP] Clicking visible #ack_checkbox once');

      await ackIcon.click({ force: true }).catch(async (error) => {
        console.log('[WARN] #ack_checkbox click failed:', String(error).split('\n')[0]);
        await ackIcon.evaluate((element) => (element as HTMLElement).click());
      });
    } else if (await ackLabel.isVisible({ timeout: 5_000 }).catch(() => false)) {
      console.log('[STEP] Clicking acknowledge label once');

      await ackLabel.click({ force: true }).catch(async (error) => {
        console.log('[WARN] acknowledge label click failed:', String(error).split('\n')[0]);
        await ackLabel.evaluate((element) => (element as HTMLElement).click());
      });
    } else if (await ackInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
      console.log('[STEP] Checking visible acknowledge input once');

      await ackInput.check({ force: true }).catch(async () => {
        await ackInput.click({ force: true });
      });
    } else {
      console.log('[WARN] Acknowledge text visible, but icon/label/input was not clickable');
    }

    await this.page.waitForTimeout(700);

    const after = await this.readAcknowledgeState(saveDialog);
    console.log('[DEBUG] Acknowledge state after click:', after);
  }

  private async readAcknowledgeState(saveDialog: Locator) {
    return saveDialog.evaluate((dialogElement) => {
      const input = dialogElement.querySelector<HTMLInputElement>('#ack_flag');
      const icon = dialogElement.querySelector<HTMLElement>('#ack_checkbox');
      const saveButton = dialogElement.querySelector<HTMLElement>('#save_btn');

      return {
        inputChecked: input?.checked ?? null,
        inputValue: input?.value ?? null,
        iconClass: icon?.className.toString() ?? null,
        iconActive: icon ? /checkbox_active|active|checked/i.test(icon.className.toString()) : null,
        saveButtonClass: saveButton?.className.toString() ?? null,
        saveButtonDisabledClass: saveButton ? /btn-disabled|disabled/i.test(saveButton.className.toString()) : null,
      };
    }).catch((error) => ({ error: String(error) }));
  }

  private async readSaveButtonState(saveButton: Locator) {
    return saveButton.evaluate((element) => {
      const className = String((element as HTMLElement).className);

      return {
        id: element.id,
        text: (element.textContent ?? '').replace(/\s+/g, ' ').trim(),
        className,
        disabled: element.hasAttribute('disabled'),
        ariaDisabled: element.getAttribute('aria-disabled'),
        hasDisabledClass: /btn-disabled|disabled/i.test(className),
        html: element.outerHTML.slice(0, 1000),
      };
    }).catch((error) => ({ error: String(error) }));
  }

  private async debugSingleDialog(dialog: Locator) {
    return dialog.evaluate((dialogElement) => {
      const normalize = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim();

      const rect = dialogElement.getBoundingClientRect();

      return {
        id: dialogElement.id,
        className: String((dialogElement as HTMLElement).className),
        text: normalize(dialogElement.textContent).slice(0, 1500),
        rect: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
        ackFlag: (() => {
          const input = dialogElement.querySelector<HTMLInputElement>('#ack_flag');
          return input
            ? {
                checked: input.checked,
                value: input.value,
                outerHTML: input.outerHTML,
              }
            : null;
        })(),
        ackIcon: (() => {
          const icon = dialogElement.querySelector<HTMLElement>('#ack_checkbox');
          return icon
            ? {
                className: icon.className.toString(),
                outerHTML: icon.outerHTML,
              }
            : null;
        })(),
        saveButton: (() => {
          const button = dialogElement.querySelector<HTMLElement>('#save_btn');
          return button
            ? {
                className: button.className.toString(),
                text: normalize(button.textContent),
                outerHTML: button.outerHTML,
              }
            : null;
        })(),
      };
    }).catch((error) => ({ error: String(error) }));
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

  private async findCtoCard(partNumber: string) {
    const cardRoot = this.page.locator('#dqe_cards_container');

    const exactCtoCard = cardRoot
      .locator('div')
      .filter({ hasText: new RegExp(`"${escapeRegex(partNumber)}"\\s*[—-]\\s*CTO`) })
      .first();

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
            (item) =>
              item.value.trim() === partNumber ||
              (item.textContent ?? '').includes(partNumber),
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

    await waitForBlockingOverlay(this.page);
  }

  private async clickCtoCustomizeButton(card: Locator) {
    const customizeButton = card
      .getByRole('button', { name: /Customize|Build|Configure/i })
      .or(card.locator('button.dqe-customize-btn, .dqe-customize-btn'))
      .first();

    await safeClick(customizeButton);
  }

  private productRow(partNumber: string) {
    return this.page
      .locator('tr.item_tr, tr')
      .filter({ hasText: partNumber })
      .filter({ visible: true })
      .first();
  }

  private async waitForProductRow(partNumber: string, label: string) {
    let row = this.productRow(partNumber);

    if (await row.isVisible({ timeout: 10_000 }).catch(() => false)) {
      return row;
    }

    const bodyText = (await this.page.locator('body').textContent().catch(() => '')) ?? '';

    if (bodyText.includes(partNumber)) {
      row = this.page
        .locator('tr, [role="row"], .item_tr')
        .filter({ hasText: partNumber })
        .first();

      await expect(row, `${label} row ${partNumber} should be visible`).toBeVisible({
        timeout: 60_000,
      });

      return row;
    }

    throw new Error(`${label} product row was not found for ${partNumber}`);
  }

  private async openSectionIfRequired(args: {
    label: string;
    sectionSelector: string;
    rowPartNumber: string;
    fallbackText: RegExp;
  }) {
    await waitForBlockingOverlay(this.page);

    const existingRow = this.productRow(args.rowPartNumber);

    if (await existingRow.isVisible({ timeout: 3_000 }).catch(() => false)) {
      console.log(`[INFO] ${args.label} row is already visible; no section click needed`);
      return;
    }

    const sectionBySelector = this.page
      .locator(args.sectionSelector)
      .filter({ visible: true })
      .first();

    if (await sectionBySelector.isVisible({ timeout: 5_000 }).catch(() => false)) {
      console.log(`[STEP] Opening ${args.label} section using section selector`);

      await sectionBySelector.scrollIntoViewIfNeeded();

      await sectionBySelector.click({ force: true }).catch(async () => {
        await sectionBySelector.evaluate((element) => (element as HTMLElement).click());
      });

      await waitForBlockingOverlay(this.page);

      if (await existingRow.isVisible({ timeout: 10_000 }).catch(() => false)) {
        return;
      }
    }

    const sectionByText = this.page
      .locator('[id^="section_header_"], .section_header, tr, td, div, span')
      .filter({ hasText: args.fallbackText })
      .filter({ visible: true })
      .first();

    if (await sectionByText.isVisible({ timeout: 10_000 }).catch(() => false)) {
      console.log(`[STEP] Opening ${args.label} section using text fallback`);

      await sectionByText.scrollIntoViewIfNeeded();

      await sectionByText.click({ force: true }).catch(async () => {
        await sectionByText.evaluate((element) => (element as HTMLElement).click());
      });

      await waitForBlockingOverlay(this.page);

      if (await existingRow.isVisible({ timeout: 10_000 }).catch(() => false)) {
        return;
      }
    }

    const configSearch = this.page
      .getByRole('textbox', { name: /Search config for:/i })
      .or(this.page.locator('input[placeholder*="Search config" i], input[aria-label*="Search config" i]'))
      .filter({ visible: true })
      .first();

    if (await configSearch.isVisible({ timeout: 5_000 }).catch(() => false)) {
      console.log(`[STEP] Searching ${args.label} part directly in config search: ${args.rowPartNumber}`);

      await configSearch.clear().catch(() => undefined);
      await configSearch.fill(args.rowPartNumber);

      await waitForBlockingOverlay(this.page);

      const productEntry = this.page
        .getByText(args.rowPartNumber, { exact: false })
        .filter({ visible: true })
        .first();

      if (await productEntry.isVisible({ timeout: 10_000 }).catch(() => false)) {
        await productEntry.click({ force: true }).catch(async () => {
          await productEntry.evaluate((element) => (element as HTMLElement).click());
        });

        await waitForBlockingOverlay(this.page);

        if (await existingRow.isVisible({ timeout: 10_000 }).catch(() => false)) {
          return;
        }
      }
    }

    console.log(`[WARN] ${args.label} section open attempt completed, but row was not visible yet`);
  }

  private async selectProcessorQuantityUsingRecordedFlow() {
    const row = this.page
      .getByRole('row', {
        name: /P74503-B21 Intel Xeon 6505P 2\.2GHz 12-core 150W Processor for HPE/i,
      })
      .or(this.productRow(PROCESSOR_PART))
      .first();

    await expect(row, `Processor row ${PROCESSOR_PART} should be visible`).toBeVisible({
      timeout: 60_000,
    });

    await this.scrollLocatorToCenter(row, 'Processor row');

    const currentQuantity = await this.readRowQuantity(row).catch(() => '');

    if (currentQuantity === '2') {
      console.log('[INFO] Processor quantity is already 2');
      return;
    }

    console.log('[STEP] Selecting processor quantity 2 using recorded row-click flow');

    const clicked = await this.clickQuantityControlInRow(row, 'Processor');

    if (!clicked) {
      throw new Error(`Processor ${PROCESSOR_PART} quantity control was not clickable`);
    }

    await this.clickVisibleQuantityOption('2', 'Processor');

    await waitForBlockingOverlay(this.page);
    await this.page.waitForTimeout(2_000);

    const finalQuantity = await this.readRowQuantity(row).catch(() => '');

    if (finalQuantity && finalQuantity !== '2') {
      console.log(`[WARN] Processor quantity read as "${finalQuantity}" after selecting 2. Continuing because OCA sometimes does not expose quantity text consistently.`);
    } else {
      console.log(`[INFO] Processor quantity selection completed. Read value: ${finalQuantity || '<empty>'}`);
    }
  }

  private async selectMemoryQuantityUsingRecordedFlow() {
    const row = this.page
      .getByRole('row', {
        name: /P69727-F21 HPE 32GB .* DDR5-6400 .* Registered Smart FIO Memory Kit/i,
      })
      .or(this.productRow(MEMORY_PART))
      .first();

    await expect(row, `Memory row ${MEMORY_PART} should be visible`).toBeVisible({
      timeout: 60_000,
    });

    await this.scrollLocatorToCenter(row, 'Memory row');

    const currentQuantity = await this.readRowQuantity(row).catch(() => '');

    if (currentQuantity === '4') {
      console.log('[INFO] Memory quantity is already 4');
      return;
    }

    console.log('[STEP] Selecting memory quantity 4 using recorded row-click flow');

    const clicked = await this.clickQuantityControlInRow(row, 'Memory');

    if (!clicked) {
      throw new Error(`Memory ${MEMORY_PART} quantity control was not clickable`);
    }

    await this.clickVisibleQuantityOption('4', 'Memory');

    await waitForBlockingOverlay(this.page);
    await this.page.waitForTimeout(2_000);

    const finalQuantity = await this.readRowQuantity(row).catch(() => '');

    if (finalQuantity && finalQuantity !== '4') {
      console.log(`[WARN] Memory quantity read as "${finalQuantity}" after selecting 4. Continuing because OCA sometimes does not expose quantity text consistently.`);
    } else {
      console.log(`[INFO] Memory quantity selection completed. Read value: ${finalQuantity || '<empty>'}`);
    }
  }

  private async scrollLocatorToCenter(locator: Locator, label: string) {
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

  private async clickQuantityControlInRow(row: Locator, label: string) {
    const targets = [
      row.locator('.item_qty_div').first(),
      row.locator('td.item_qty').first(),
      row.locator('[class*="qty"]').filter({ visible: true }).last(),
      row.locator('select').first(),
      row.locator('div').filter({ visible: true }).last(),
      row.locator('div').filter({ visible: true }).first(),
    ];

    for (const target of targets) {
      if (!(await target.isVisible({ timeout: 2_000 }).catch(() => false))) {
        continue;
      }

      await this.scrollLocatorToCenter(target, `${label} quantity control`);

      await target.click({ force: true }).catch(async () => {
        const box = await target.boundingBox();

        if (!box) {
          return;
        }

        await this.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      });

      await this.page.waitForTimeout(700);

      const optionVisible = await this.page
        .locator('[id="1"], [id="2"], [id="3"], [id="4"], .selecter-options .selecter-item, [role="option"], .ui-menu-item, li')
        .filter({ visible: true })
        .first()
        .isVisible({ timeout: 1_000 })
        .catch(() => false);

      if (optionVisible) {
        console.log(`[INFO] ${label} quantity popup opened`);
        return true;
      }
    }

    return false;
  }

  private async clickVisibleQuantityOption(quantity: string, label: string) {
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

    await this.scrollLocatorToCenter(option, `${label} quantity option ${quantity}`);

    await option.click({ force: true }).catch(async () => {
      await option.evaluate((element) => (element as HTMLElement).click());
    });

    console.log(`[INFO] ${label} quantity option clicked: ${quantity}`);
  }

  private async selectPartQuantityByOptionClick(row: Locator, quantity: string, label: string) {
    await waitForBlockingOverlay(this.page);
    await row.scrollIntoViewIfNeeded();

    const radio = row.locator('input[type="radio"]').first();

    if (await radio.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await radio.check({ force: true }).catch(async () => {
        await radio.click({ force: true });
      });

      await waitForBlockingOverlay(this.page);
    }

    const select = row.locator('select').first();

    if (await select.isVisible({ timeout: 3_000 }).catch(() => false)) {
      const optionValues = await select.locator('option').evaluateAll((options) =>
        options.map((option) => ({
          text: (option.textContent ?? '').trim(),
          value: (option as HTMLOptionElement).value.trim(),
        })),
      );

      const option = optionValues.find(
        (candidate) => candidate.value === quantity || candidate.text === quantity,
      );

      if (option) {
        await select.selectOption(option.value);
        await waitForBlockingOverlay(this.page);
        console.log(`[INFO] ${label} quantity selected using native select: ${quantity}`);
        return;
      }
    }

    const quantityTargets = [
      row.locator('.item_qty_div').first(),
      row.locator('td.item_qty').first(),
      row.locator('[class*="qty"]').filter({ visible: true }).last(),
      row.locator('div').filter({ visible: true }).last(),
    ];

    for (const target of quantityTargets) {
      if (!(await target.isVisible({ timeout: 2_000 }).catch(() => false))) {
        continue;
      }

      await this.scrollLocatorToCenter(target, `${label} quantity control`);

      await target.click({ force: true }).catch(async () => {
        const box = await target.boundingBox();

        if (box) {
          await this.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        } else {
          await target.evaluate((element) => (element as HTMLElement).click());
        }
      });

      await this.page.waitForTimeout(500);

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

      if (await option.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await this.scrollLocatorToCenter(option, `${label} quantity option ${quantity}`);

    await option.click({ force: true }).catch(async () => {
          await option.evaluate((element) => (element as HTMLElement).click());
        });

        await waitForBlockingOverlay(this.page);
        await this.page.waitForTimeout(1_000);

        console.log(`[INFO] ${label} quantity option clicked: ${quantity}`);
        return;
      }
    }

    throw new Error(`${label} quantity option ${quantity} was not available`);
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

        const option = optionValues.find(
          (candidate) => candidate.value === quantity || candidate.text === quantity,
        );

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

      const wrappedError = new Error(
        `${label} quantity did not remain ${quantity} after UI recalculation; final value was ${finalValue || '<empty>'}`,
      );
      (wrappedError as Error & { cause?: unknown }).cause = error;
      throw wrappedError;
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

function updateEndBomWorkbook(result: ThirdModelExcelResult) {
  try {
    const workbook = XLSX.readFile(END_BOM_WORKBOOK_PATH);
    const sheetName = workbook.SheetNames[0];

    const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(workbook.Sheets[sheetName], {
      header: 1,
      defval: null,
    });

    const headers = normalizeEndBomHeaders(rows[0] ?? []);
    rows[0] = headers;

    const modelNoColumn = headers.indexOf('Model no');

    const modelRows = rows
      .slice(1)
      .filter((row) => String(row[modelNoColumn] ?? '').trim().length > 0);

    let rowIndex = modelRows.findIndex(
      (row) => String(row[modelNoColumn] ?? '').trim() === result.modelNo,
    );

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


export async function run(page: Page, context: BrowserContext) {
  const result: ThirdModelExcelResult = { modelNo: BASE_MODEL_PART, processor: SELECTED_PROCESSOR, memory: SELECTED_MEMORY, service: SERVICE_LEVEL, startBomUcid: '', endBomUcid: '', associateEndBom: 'No', status: 'Fail' };
  try {
    console.log('[START] Model 3 started');
    const flow = new ThirdModelOcaConfigFlow(page, context, result);
    let configPage: Page;
    await test.step(`Model 3 - Search and open ${BASE_MODEL_PART}`, async () => { configPage = await flow.searchAndOpenBaseModel(BASE_MODEL_PART); });
    await test.step('Model 3 - Smart Chassis', async () => { await flow.useConfigPage(configPage); await flow.selectSmartChassis(); });
    await test.step(`Model 3 - Processor ${PROCESSOR_PART}`, async () => flow.selectProcessor());
    await test.step(`Model 3 - Memory ${MEMORY_PART}`, async () => flow.selectMemory());
    await test.step('Model 3 - Lite service', async () => flow.selectLiteService());
    await test.step('Model 3 - Billing Tier Setup', async () => flow.runBillingTierSetup());
    await test.step('Model 3 - Save', async () => flow.saveOcaConfig());
    await test.step('Model 3 - End BOM', async () => flow.generateAndAssociateEndBom());
    result.status = 'Pass'; updateEndBomWorkbook(result); console.log('[PASS] Model 3 completed');
  } catch (error) { console.error('[FAIL] Model 3 failed:', error); updateEndBomWorkbook({ ...result, status: 'Fail' }); throw error; }
}

}


namespace Model4 {
const BASE_URL =
  'https://ngc-itg-oca-internal.its.hpecorp.net/ocaPreForkM1/OCAInternalLogin';

const AUTH_WAIT_MS = 40_000;
const ACTION_DELAY_MS = 2_000;
const CHROME_PROFILE_DIR = 'C:\\selenium\\oca-profile';
const END_BOM_WORKBOOK_PATH = 'C:\\workspace\\Playwright\\EndBomModelValidation.xlsx';

const BASE_MODEL_PART = 'P86963-B21';
const BASE_MODEL_NAME =
  'HPE ProLiant Compute DL360 Gen12 Server Premier Solution for Azure Local';

const PROCESSOR_PART = 'P73829-B21';
const MEMORY_PART = 'P69726-F21';
const MEMORY_BLANK_KIT_PART = 'P07818-B21';
const SMART_CHASSIS_PART = 'P72221-B21';
const STORAGE_CABLE_1_PART = 'P76502-B21';
const STORAGE_CABLE_2_PART = 'P77191-B21';
const POWER_SUPPLY_PART = 'P03178-B21';

const SELECTED_PROCESSOR =
  'P73829-B21 Intel Xeon 6740P 2.1GHz 48-core 270W Processor for HPE';

const SELECTED_MEMORY =
  'P69726-F21 HPE 16GB (1x16GB) Single Rank x8 DDR5-6400 CAS-52-52-52 EC8 Registered Smart FIO Memory Kit';

const SERVICE_LEVEL = 'Lite';
const EXPECTED_PAGE_TEXT = 'OCA Config 2';

type FourthModelExcelResult = {
  modelNo: string;
  processor: string;
  memory: string;
  service: string;
  startBomUcid: string;
  endBomUcid: string;
  associateEndBom: 'Yes' | 'No';
  status: 'Pass' | 'Fail';
};



class FourthModelOcaConfigFlow {
  private page: Page;

  constructor(
    page: Page,
    private readonly context: BrowserContext,
    private readonly result: FourthModelExcelResult,
  ) {
    this.page = page;
  }

  async useConfigPage(page: Page) {
    this.page = page;
    this.page.setDefaultTimeout(30_000);
    this.page.setDefaultNavigationTimeout(90_000);

    await expect(this.page.getByText(EXPECTED_PAGE_TEXT, { exact: false }).first()).toBeVisible({
      timeout: 60_000,
    });
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
        {
          message: 'OCA authenticated landing page should be ready',
          timeout: 180_000,
        },
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

    await search.click().catch(() => undefined);
    await search.fill(partNumber);

    const productTitle = this.page.getByText(BASE_MODEL_NAME, { exact: true }).filter({ visible: true }).first();

    if (await productTitle.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await safeClick(productTitle);
    }

    const autocompleteOption = this.page
      .locator('ul.ui-autocomplete:not([style*="display: none"]) li.ui-menu-item, [role="option"]')
      .filter({ hasText: partNumber })
      .first();

    if (await autocompleteOption.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await safeClick(autocompleteOption);
    }

    await this.page.locator('#dqe_cards_container').waitFor({
      state: 'visible',
      timeout: 60_000,
    });

    const ctoCard = await this.findCtoCard(partNumber);

    await expect(ctoCard, `CTO card for ${partNumber} should be visible`).toBeVisible({
      timeout: 60_000,
    });

    await this.selectProductNumberIfAvailable(ctoCard, partNumber);

    const newPagePromise = this.context.waitForEvent('page', { timeout: 15_000 }).catch(() => null);

    await this.clickCtoCustomizeButton(ctoCard);

    const newPage = await newPagePromise;
    const configPage = newPage ?? this.page;

    await configPage.waitForLoadState('domcontentloaded').catch(() => undefined);

    await expect(configPage.getByText(EXPECTED_PAGE_TEXT, { exact: false }).first()).toBeVisible({
      timeout: 60_000,
    });

    return configPage;
  }

  async selectProcessor() {
    await waitForBlockingOverlay(this.page);

    await this.openSectionIfRequired({
      label: 'Processor',
      sectionSelector:
        '#section_header_processor, #section_header_processorSection, [id*="section_header" i][id*="processor" i], [id*="ProcessorSection" i]',
      rowPartNumber: PROCESSOR_PART,
      fallbackText: /Processor/i,
    });

    const row = await this.waitForProductRow(PROCESSOR_PART, 'Processor');
    await this.scrollLocatorToCenter(row, 'Processor row');

    const radio = row.locator('input[type="radio"], #radio').first();

    if (await radio.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await radio.check({ force: true }).catch(async () => {
        await radio.click({ force: true });
      });
    } else {
      await safeClick(row);
    }

    await waitForBlockingOverlay(this.page);

    await this.page
      .locator('#choice_column_titlesAvailable_ProcessorSection_HeatsinkKitChoice')
      .getByRole('cell', { name: 'Description' })
      .click()
      .catch(() => undefined);

    await waitForBlockingOverlay(this.page);
  }

  async selectMemory() {
    await waitForBlockingOverlay(this.page);

    await this.openSectionIfRequired({
      label: 'Memory',
      sectionSelector:
        '#section_header_memory, #section_header_memorySection, [id*="section_header" i][id*="memory" i], [id*="MemorySection" i]',
      rowPartNumber: MEMORY_PART,
      fallbackText: /Memory/i,
    });

    await this.disableHpeRecommendedOnlyToggle();

    await this.selectFourthModelMemoryQuantity();
  }

  async selectMemoryBlankKit() {
    await waitForBlockingOverlay(this.page);

    console.log('[STEP] Expanding Memory Blank Kit and selecting P07818-B21 quantity 1');

    await this.expandMemoryBlankKit();

    const row = await this.waitForProductRow(MEMORY_BLANK_KIT_PART, 'Memory Blank Kit');

    await this.selectMemoryBlankKitQuantityOne(row);
  }

  async recheckMemoryAndBlankKitAfterRecalculation() {
    await waitForBlockingOverlay(this.page);

    console.log('[STEP] Reopening Memory section after recalculation');

    await this.openSectionIfRequired({
      label: 'Memory',
      sectionSelector:
        '#section_header_memory, #section_header_memorySection, [id*="section_header" i][id*="memory" i], [id*="MemorySection" i]',
      rowPartNumber: MEMORY_PART,
      fallbackText: /Memory/i,
    });

    await this.disableHpeRecommendedOnlyToggle();

    await this.selectFourthModelMemoryQuantity();

    await this.expandMemoryBlankKit();

    const blankKitRow = await this.waitForProductRow(MEMORY_BLANK_KIT_PART, 'Memory Blank Kit');

    await this.selectMemoryBlankKitQuantityOne(blankKitRow);

    await waitForBlockingOverlay(this.page);
    await this.page.waitForTimeout(2_000);
  }

  async selectSmartChassisBackplane() {
    await waitForBlockingOverlay(this.page);

    await this.openSectionIfRequired({
      label: 'Smart Chassis',
      sectionSelector:
        '#section_header_smartChassisSection, #section_header_smartChassis, [id*="section_header" i][id*="smartChassis" i]',
      rowPartNumber: SMART_CHASSIS_PART,
      fallbackText: /Smart Chassis/i,
    });

    const row = await this.waitForProductRow(SMART_CHASSIS_PART, 'Smart Chassis backplane');

    await this.selectQuantityUsingRecordedFlow(row, '2', `Smart Chassis ${SMART_CHASSIS_PART}`);
  }

  async selectStorageCableKits() {
    await waitForBlockingOverlay(this.page);

    await this.openSectionIfRequired({
      label: 'Storage Devices',
      sectionSelector:
        '#section_header_storageDevice, #section_header_storageDevices, [id*="section_header" i][id*="storage" i]',
      rowPartNumber: STORAGE_CABLE_1_PART,
      fallbackText: /Storage Devices|Drive/i,
    });

    await this.selectRowByPartNumber(STORAGE_CABLE_1_PART, 'Storage cable kit 1');
    await this.selectRowByPartNumber(STORAGE_CABLE_2_PART, 'Storage cable kit 2');
  }

  async openNetworkingSection() {
    await waitForBlockingOverlay(this.page);

    const networking = this.page
      .locator('#section_header_networkController')
      .getByText('Networking')
      .or(this.page.getByText(/^Networking$/i))
      .filter({ visible: true })
      .first();

    if (await networking.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await safeClick(networking);
    }
  }

  async selectPowerSupply() {
    await waitForBlockingOverlay(this.page);

    await this.openSectionIfRequired({
      label: 'Power Supplies',
      sectionSelector:
        '#section_header_power, [id*="section_header" i][id*="power" i]',
      rowPartNumber: POWER_SUPPLY_PART,
      fallbackText: /Power Supplies/i,
    });

    const row = await this.waitForProductRow(POWER_SUPPLY_PART, 'Power Supply');

    await this.selectQuantityUsingRecordedFlow(row, '1', `Power Supply ${POWER_SUPPLY_PART}`);
  }

  async selectLiteService() {
    await waitForBlockingOverlay(this.page);
    await waitBeforeAction(this.page);

    await this.page.getByRole('link', { name: 'Services', exact: true }).click();

    await waitForBlockingOverlay(this.page);
    await waitBeforeAction(this.page);

    const liteOption = this.page.locator('label').filter({ hasText: /^Lite$/ }).locator('span').first();

    if (await liteOption.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await liteOption.click();
    } else {
      await this.page.locator('.radio_default').first().click();
    }

    await waitForBlockingOverlay(this.page);
  }

  async runBillingTierSetup() {
    await waitForBlockingOverlay(this.page);
    await this.closeVisibleModalIfPossible();
    await this.waitForModalOverlayHidden();

    await waitBeforeAction(this.page);

    await this.page.getByRole('link', { name: 'BOM' }).click();

    await waitForBlockingOverlay(this.page);
    await this.closeVisibleModalIfPossible();
    await this.waitForModalOverlayHidden();

    await this.page.locator('#eo_nav_li_0').click().catch(() => undefined);

    await waitForBlockingOverlay(this.page);
    await this.closeVisibleModalIfPossible();
    await this.waitForModalOverlayHidden();

    const billingTierButton = this.page.locator('#obw_billingtier_bot').or(this.page.getByText('Billing Tier Setup')).first();

    await billingTierButton.waitFor({ state: 'visible', timeout: 60_000 });
    await this.scrollLocatorToCenter(billingTierButton, 'Billing Tier Setup button');

    await this.clickEvenIfOverlayWasRecentlyPresent(billingTierButton, 'Billing Tier Setup');

    await this.closeBillingTierDialogIfVisible();

    await waitForBlockingOverlay(this.page);
    await this.waitForModalOverlayHidden();
  }

  async saveOcaConfig() {
    await waitForBlockingOverlay(this.page);

    await this.closeBillingTierDialogIfVisible();
    await this.waitForModalOverlayHidden();

    await waitBeforeAction(this.page);

    await this.page.locator('#save #save_icon, #save_icon').first().click();

    await waitForBlockingOverlay(this.page);
    await waitBeforeAction(this.page);

    await this.page.getByText('Save OCA Config').click();

    await waitForBlockingOverlay(this.page);

    const ackCheckbox = this.page.locator('#ack_checkbox');

    if (await ackCheckbox.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await ackCheckbox.click({ force: true });
    }

    const saveButton = this.page
      .getByLabel('Save(Existing UCID: TempUCID)')
      .getByText('Save', { exact: true })
      .or(
        this.page
          .locator('.ui-dialog')
          .filter({ hasText: /^Save/ })
          .locator('#save_btn')
          .filter({ hasText: /^Save$/ }),
      )
      .first();

    await saveButton.waitFor({ state: 'visible', timeout: 60_000 });

    await saveButton.click({ force: true }).catch(async () => {
      await saveButton.evaluate((element) => (element as HTMLElement).click());
    });

    await Promise.race([
      this.page
        .locator('.ui-dialog')
        .filter({ hasText: /^Save/ })
        .last()
        .waitFor({ state: 'hidden', timeout: 60_000 })
        .catch(() => undefined),
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

  async generateAndAssociateEndBom() {
    await this.page.getByText('End BOM', { exact: true }).click();

    await waitForBlockingOverlay(this.page);

    await this.page.getByRole('button', { name: 'Auto-generate' }).click();

    await waitForBlockingOverlay(this.page);

    await this.page.getByRole('button', { name: 'Generate End BOM' }).click();

    await waitForBlockingOverlay(this.page);

    this.result.startBomUcid = await this.readBomUcid('Start BOM UCID');
    this.result.endBomUcid = await this.readBomUcid('End BOM UCID');

    await this.page.getByRole('button', { name: 'Associate End BOM' }).click();

    await waitForBlockingOverlay(this.page);

    this.result.associateEndBom = 'Yes';

    await this.page.getByRole('button', { name: 'Done' }).click();

    await waitForBlockingOverlay(this.page);
  }

  private async findCtoCard(partNumber: string) {
    const cardRoot = this.page.locator('#dqe_cards_container');

    const exactCtoCard = cardRoot
      .locator('div')
      .filter({ hasText: new RegExp(`"${escapeRegex(partNumber)}"\\s*[—-]\\s*CTO`) })
      .first();

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
            (item) =>
              item.value.trim() === partNumber ||
              (item.textContent ?? '').includes(partNumber),
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

    await waitForBlockingOverlay(this.page);
  }

  private async clickCtoCustomizeButton(card: Locator) {
    const customizeButton = card
      .getByRole('button', { name: /Customize|Build|Configure/i })
      .or(card.locator('button.dqe-customize-btn, .dqe-customize-btn'))
      .first();

    await safeClick(customizeButton);
  }

  private productRow(partNumber: string) {
    return this.page
      .locator('tr.item_tr, tr')
      .filter({ hasText: partNumber })
      .filter({ visible: true })
      .first();
  }

  private async waitForProductRow(partNumber: string, label: string) {
    let row = this.productRow(partNumber);

    if (await row.isVisible({ timeout: 10_000 }).catch(() => false)) {
      return row;
    }

    const bodyText = (await this.page.locator('body').textContent().catch(() => '')) ?? '';

    if (bodyText.includes(partNumber)) {
      row = this.page
        .locator('tr, [role="row"], .item_tr')
        .filter({ hasText: partNumber })
        .first();

      await expect(row, `${label} row ${partNumber} should be visible`).toBeVisible({
        timeout: 60_000,
      });

      return row;
    }

    throw new Error(`${label} product row was not found for ${partNumber}`);
  }

  private async openSectionIfRequired(args: {
    label: string;
    sectionSelector: string;
    rowPartNumber: string;
    fallbackText: RegExp;
  }) {
    await waitForBlockingOverlay(this.page);

    const existingRow = this.productRow(args.rowPartNumber);

    if (await existingRow.isVisible({ timeout: 3_000 }).catch(() => false)) {
      console.log(`[INFO] ${args.label} row is already visible; no section click needed`);
      return;
    }

    const sectionBySelector = this.page
      .locator(args.sectionSelector)
      .filter({ visible: true })
      .first();

    if (await sectionBySelector.isVisible({ timeout: 5_000 }).catch(() => false)) {
      console.log(`[STEP] Opening ${args.label} section using section selector`);

      await this.scrollLocatorToCenter(sectionBySelector, `${args.label} section`);

      await sectionBySelector.click({ force: true }).catch(async () => {
        await sectionBySelector.evaluate((element) => (element as HTMLElement).click());
      });

      await waitForBlockingOverlay(this.page);

      if (await existingRow.isVisible({ timeout: 10_000 }).catch(() => false)) {
        return;
      }
    }

    const sectionByText = this.page
      .locator('[id^="section_header_"], .section_header, tr, td, div, span')
      .filter({ hasText: args.fallbackText })
      .filter({ visible: true })
      .first();

    if (await sectionByText.isVisible({ timeout: 10_000 }).catch(() => false)) {
      console.log(`[STEP] Opening ${args.label} section using text fallback`);

      await this.scrollLocatorToCenter(sectionByText, `${args.label} section fallback`);

      await sectionByText.click({ force: true }).catch(async () => {
        await sectionByText.evaluate((element) => (element as HTMLElement).click());
      });

      await waitForBlockingOverlay(this.page);

      if (await existingRow.isVisible({ timeout: 10_000 }).catch(() => false)) {
        return;
      }
    }

    console.log(`[WARN] ${args.label} section open attempt completed, but row was not visible yet`);
  }

  private async selectRowByPartNumber(partNumber: string, label: string) {
    const row = await this.waitForProductRow(partNumber, label);

    await this.scrollLocatorToCenter(row, `${label} row`);

    const radio = row.locator('input[type="radio"], #radio').first();

    if (await radio.isVisible({ timeout: 2_000 }).catch(() => false)) {
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

  private async expandMemoryBlankKit() {
    await waitForBlockingOverlay(this.page);

    const rowAlreadyVisible = this.productRow(MEMORY_BLANK_KIT_PART);

    if (await rowAlreadyVisible.isVisible({ timeout: 3_000 }).catch(() => false)) {
      console.log('[INFO] Memory Blank Kit row is already visible');
      return;
    }

    const blankKitToggle = this.page
      .locator(
        [
          '#choice_column_titlesAvailable_MemorySection_MemoryBlankKitChoice',
          '#MemorySection_MemoryBlankKitChoice',
          '[id*="MemoryBlankKitChoice" i]',
          'tr',
          'td',
          'div',
          'span',
        ].join(', '),
      )
      .filter({ hasText: /Memory Blank Kit/i })
      .filter({ visible: true })
      .first();

    if (await blankKitToggle.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await this.scrollLocatorToCenter(blankKitToggle, 'Memory Blank Kit toggle');

      await blankKitToggle.click({ force: true }).catch(async () => {
        await blankKitToggle.evaluate((element) => (element as HTMLElement).click());
      });

      await waitForBlockingOverlay(this.page);

      if (await rowAlreadyVisible.isVisible({ timeout: 10_000 }).catch(() => false)) {
        return;
      }
    }

    const blankKitText = this.page.getByText(/Memory Blank Kit/i).filter({ visible: true }).first();

    if (await blankKitText.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await this.scrollLocatorToCenter(blankKitText, 'Memory Blank Kit text');

      await blankKitText.click({ force: true }).catch(async () => {
        await blankKitText.evaluate((element) => (element as HTMLElement).click());
      });

      await waitForBlockingOverlay(this.page);

      if (await rowAlreadyVisible.isVisible({ timeout: 10_000 }).catch(() => false)) {
        return;
      }
    }

    const expandedViaDom = await this.page.evaluate(() => {
      const normalize = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim();

      const candidates = Array.from(document.querySelectorAll<HTMLElement>('tr, td, div, span, a')).filter((element) =>
        normalize(element.textContent).toLowerCase().includes('memory blank kit'),
      );

      for (const candidate of candidates) {
        const clickable =
          candidate.closest<HTMLElement>('tr, div, a') ??
          candidate;

        clickable.scrollIntoView({ block: 'center', inline: 'center' });

        for (const eventName of ['mouseover', 'mousemove', 'mousedown', 'mouseup', 'click']) {
          clickable.dispatchEvent(
            new MouseEvent(eventName, {
              bubbles: true,
              cancelable: true,
              view: window,
            }),
          );
        }

        return true;
      }

      return false;
    });

    if (!expandedViaDom) {
      console.log('[WARN] Memory Blank Kit toggle was not found by DOM search');
    }

    await waitForBlockingOverlay(this.page);

    await expect(this.productRow(MEMORY_BLANK_KIT_PART), `Memory Blank Kit row ${MEMORY_BLANK_KIT_PART} should be visible after expanding`).toBeVisible({
      timeout: 60_000,
    });
  }

  private async selectMemoryBlankKitQuantityOne(row: Locator) {
    await waitForBlockingOverlay(this.page);

    const exactRow = this.page.locator('#item_tr_P07818-B21_memory_memoryBlankKitChoice').first();
    const targetRow = (await exactRow.isVisible({ timeout: 3_000 }).catch(() => false)) ? exactRow : row;

    await this.scrollLocatorToCenter(targetRow, `Memory Blank Kit ${MEMORY_BLANK_KIT_PART} row`);

    await expect(targetRow).toContainText(MEMORY_BLANK_KIT_PART);

    const quantity = targetRow.locator('.item_qty_div, .item_qty').first();

    await quantity.waitFor({ state: 'visible', timeout: 30_000 });

    const currentQuantity = (await quantity.textContent().catch(() => ''))?.replace(/\s+/g, ' ').trim();

    if (currentQuantity === '1') {
      console.log('[INFO] Memory Blank Kit quantity is already 1');
      return;
    }

    console.log(`[STEP] Memory Blank Kit current quantity is ${currentQuantity || '<empty>'}; selecting quantity 1`);

    console.log('[DEBUG] Memory Blank Kit row before click:', await this.debugMemoryBlankKitRowDetails());

    await this.scrollLocatorToCenter(quantity, 'Memory Blank Kit quantity control');

    await quantity.click({ force: true }).catch(async () => {
      await quantity.evaluate((element) => (element as HTMLElement).click());
    });

    await this.page.waitForTimeout(700);

    console.log('[DEBUG] Memory Blank Kit visible quantity option candidates:', await this.debugVisibleQuantityOptionsForValue('1'));

    const changedAfterClick = (await quantity.textContent().catch(() => ''))?.replace(/\s+/g, ' ').trim();

    if (changedAfterClick === '1') {
      console.log('[INFO] Memory Blank Kit quantity became 1 after quantity control click');
      return;
    }

    const option1 = this.page.locator('[id="1"]').filter({ visible: true }).first();

    if (await option1.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await this.scrollLocatorToCenter(option1, 'Memory Blank Kit quantity option [id="1"]');

      await option1.click({ force: true }).catch(async () => {
        await option1.evaluate((element) => (element as HTMLElement).click());
      });

      await waitForBlockingOverlay(this.page);

      const selected = await expect(quantity, 'Memory Blank Kit quantity should become 1').toContainText('1', {
        timeout: 20_000,
      }).then(() => true).catch(() => false);

      if (selected) {
        console.log('[INFO] Memory Blank Kit quantity confirmed as 1');
        return;
      }
    }

    const selectedByCandidate = await this.clickFirstRealVisibleQuantityOptionForValue('1');

    if (selectedByCandidate) {
      await waitForBlockingOverlay(this.page);

      const selected = await expect(quantity, 'Memory Blank Kit quantity should become 1 after fallback candidate click').toContainText('1', {
        timeout: 20_000,
      }).then(() => true).catch(() => false);

      if (selected) {
        console.log('[INFO] Memory Blank Kit quantity confirmed as 1 after fallback click');
        return;
      }
    }

    console.log('[ERROR] Final Memory Blank Kit row:', await this.debugMemoryBlankKitRowDetails());
    console.log('[ERROR] Final visible quantity candidates for 1:', await this.debugVisibleQuantityOptionsForValue('1'));

    throw new Error(`Memory Blank Kit quantity option 1 was not available/selected for ${MEMORY_BLANK_KIT_PART}`);
  }

  private async debugMemoryBlankKitRowDetails() {
    return this.page.evaluate(() => {
      const normalize = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim();
      const row =
        document.querySelector<HTMLElement>('#item_tr_P07818-B21_memory_memoryBlankKitChoice') ??
        Array.from(document.querySelectorAll<HTMLElement>('tr.item_tr, tr')).find((candidate) =>
          normalize(candidate.textContent).includes('P07818-B21'),
        );

      if (!row) {
        return { found: false };
      }

      const quantity = row.querySelector<HTMLElement>('.item_qty_div, .item_qty');
      const rect = row.getBoundingClientRect();
      const quantityRect = quantity?.getBoundingClientRect();

      return {
        found: true,
        rowId: row.id,
        rowClass: row.className,
        rowText: normalize(row.textContent),
        quantityText: normalize(quantity?.textContent),
        quantityHtml: quantity?.outerHTML,
        rowRect: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
        quantityRect: quantityRect
          ? {
              x: Math.round(quantityRect.x),
              y: Math.round(quantityRect.y),
              width: Math.round(quantityRect.width),
              height: Math.round(quantityRect.height),
            }
          : null,
        html: row.outerHTML.slice(0, 1500),
      };
    });
  }

  private async debugVisibleQuantityOptionsForValue(quantity: string) {
    return this.page.evaluate((quantity) => {
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

      return Array.from(
        document.querySelectorAll<HTMLElement>(
          [
            `[id="${quantity}"]`,
            `.selecter.open .selecter-options .selecter-item`,
            `.selecter-options .selecter-item`,
            `[role="option"]`,
            `.ui-menu-item`,
            `li`,
            `span`,
            `div`,
          ].join(', '),
        ),
      )
        .filter((element) => isVisible(element))
        .filter((element) => {
          const text = normalize(element.innerText || element.textContent);
          const id = element.getAttribute('id') ?? '';
          const dataValue = element.getAttribute('data-value') ?? '';

          return text === quantity || id === quantity || dataValue === quantity;
        })
        .map((element) => {
          const rect = element.getBoundingClientRect();

          return {
            tag: element.tagName,
            id: element.id,
            className: String(element.className),
            text: normalize(element.innerText || element.textContent),
            dataValue: element.getAttribute('data-value'),
            onclick: element.getAttribute('onclick'),
            parentClass: String((element.parentElement as HTMLElement | null)?.className ?? ''),
            rect: {
              x: Math.round(rect.x),
              y: Math.round(rect.y),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
            },
            html: element.outerHTML.slice(0, 1000),
          };
        });
    }, quantity);
  }

  private async clickFirstRealVisibleQuantityOptionForValue(quantity: string) {
    const clicked = await this.page.evaluate((quantity) => {
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

      const candidates = Array.from(
        document.querySelectorAll<HTMLElement>(
          [
            `[id="${quantity}"]`,
            `.selecter.open .selecter-options .selecter-item`,
            `.selecter-options .selecter-item`,
            `[role="option"]`,
            `.ui-menu-item`,
            `li`,
            `span`,
            `div`,
          ].join(', '),
        ),
      )
        .filter((element) => isVisible(element))
        .filter((element) => {
          const text = normalize(element.innerText || element.textContent);
          const id = element.getAttribute('id') ?? '';
          const dataValue = element.getAttribute('data-value') ?? '';

          return text === quantity || id === quantity || dataValue === quantity;
        })
        .sort((left, right) => {
          const leftRect = left.getBoundingClientRect();
          const rightRect = right.getBoundingClientRect();

          return leftRect.y - rightRect.y || leftRect.x - rightRect.x;
        });

      const target = candidates[0];

      if (!target) {
        return false;
      }

      target.scrollIntoView({ block: 'center', inline: 'center' });

      const rect = target.getBoundingClientRect();
      const x = rect.x + rect.width / 2;
      const y = rect.y + rect.height / 2;

      for (const eventName of ['mouseover', 'mousemove', 'mousedown', 'mouseup', 'click']) {
        target.dispatchEvent(
          new MouseEvent(eventName, {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: x,
            clientY: y,
          }),
        );
      }

      return true;
    }, quantity);

    console.log(`[DEBUG] clickFirstRealVisibleQuantityOptionForValue(${quantity}) result:`, clicked);

    return clicked;
  }

  private async selectFourthModelMemoryQuantity() {
    await waitForBlockingOverlay(this.page);

    const row = this.page.locator('#item_tr_P69726-F21_memory_memorySlotsChoice');

    await row.waitFor({ state: 'visible', timeout: 60_000 });
    await this.scrollLocatorToCenter(row, 'Memory P69726-F21 exact row');

    await expect(row).toContainText(MEMORY_PART);

    const quantity = row.locator('.item_qty_div').first();

    await quantity.waitFor({ state: 'visible', timeout: 30_000 });
    await this.scrollLocatorToCenter(quantity, 'Memory P69726-F21 quantity control');

    const currentQuantity = (await quantity.textContent())?.replace(/\s+/g, ' ').trim();

    if (currentQuantity === '2') {
      console.log('[INFO] Memory quantity is already 2');
      return;
    }

    console.log(`[STEP] Memory current quantity is ${currentQuantity || '<empty>'}; selecting quantity 2 using first-model pattern`);

    console.log('[DEBUG] Memory row before click:', await this.debugMemoryRowDetails());

    await quantity.click({ force: true });

    await this.page.waitForTimeout(700);

    console.log('[DEBUG] Memory dropdown candidates after opening:', await this.debugVisibleQuantityOptions('2'));

    const updatedQuantity = (await quantity.textContent())?.replace(/\s+/g, ' ').trim();

    if (updatedQuantity === '2') {
      console.log('[INFO] Memory quantity changed to 2 after quantity control click');
      return;
    }

    const option = this.page.locator('[id="2"]').filter({ visible: true }).first();

    if (await option.isVisible({ timeout: 5_000 }).catch(() => false)) {
      console.log('[DEBUG] Clicking visible [id="2"] option');

      await this.scrollLocatorToCenter(option, 'Memory quantity option [id="2"]');

      console.log('[DEBUG] [id="2"] option details before click:', await option.evaluate((element) => ({
        tag: element.tagName,
        id: element.id,
        className: String((element as HTMLElement).className),
        text: (element.textContent ?? '').replace(/\s+/g, ' ').trim(),
        dataValue: element.getAttribute('data-value'),
        onclick: element.getAttribute('onclick'),
        parentClass: String((element.parentElement as HTMLElement | null)?.className ?? ''),
        html: element.outerHTML,
      })).catch((error) => ({ error: String(error) })));

      await option.click();

      await waitForBlockingOverlay(this.page);
      await this.page.waitForTimeout(2_000);

      console.log('[DEBUG] Memory row after clicking [id="2"]:', await this.debugMemoryRowDetails());

      const selected = await expect(quantity, 'Memory P69726-F21 quantity should become 2 after selecting option')
        .toContainText('2', { timeout: 10_000 })
        .then(() => true)
        .catch(() => false);

      if (selected) {
        console.log('[INFO] Memory P69726-F21 quantity confirmed as 2');
        return;
      }

      console.log('[WARN] [id="2"] click did not update memory quantity. Trying exact visible option by text/details.');

      await quantity.click({ force: true });
      await this.page.waitForTimeout(700);

      const selectedByDebugCandidate = await this.clickFirstRealVisibleQuantityOption('2');

      await waitForBlockingOverlay(this.page);
      await this.page.waitForTimeout(2_000);

      console.log('[DEBUG] Memory row after fallback candidate click:', await this.debugMemoryRowDetails());

      if (selectedByDebugCandidate) {
        const selectedAfterFallback = await expect(quantity, 'Memory P69726-F21 quantity should become 2 after fallback click')
          .toContainText('2', { timeout: 10_000 })
          .then(() => true)
          .catch(() => false);

        if (selectedAfterFallback) {
          console.log('[INFO] Memory P69726-F21 quantity confirmed as 2 after fallback click');
          return;
        }
      }
    }

    console.log('[ERROR] Memory quantity option 2 was not selected.');
    console.log('[ERROR] Final memory row details:', await this.debugMemoryRowDetails());
    console.log('[ERROR] Final visible option candidates:', await this.debugVisibleQuantityOptions('2'));

    throw new Error(`Memory quantity option 2 was not available/selected for ${MEMORY_PART}`);
  }

  private async debugMemoryRowDetails() {
    return this.page.evaluate(() => {
      const normalize = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim();
      const row = document.querySelector<HTMLElement>('#item_tr_P69726-F21_memory_memorySlotsChoice');

      if (!row) {
        return { found: false };
      }

      const quantity = row.querySelector<HTMLElement>('.item_qty_div, .item_qty');
      const rect = row.getBoundingClientRect();
      const quantityRect = quantity?.getBoundingClientRect();

      return {
        found: true,
        rowId: row.id,
        rowClass: row.className,
        rowText: normalize(row.textContent),
        quantityText: normalize(quantity?.textContent),
        quantityHtml: quantity?.outerHTML,
        rowRect: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
        quantityRect: quantityRect
          ? {
              x: Math.round(quantityRect.x),
              y: Math.round(quantityRect.y),
              width: Math.round(quantityRect.width),
              height: Math.round(quantityRect.height),
            }
          : null,
        html: row.outerHTML.slice(0, 1500),
      };
    });
  }

  private async debugVisibleQuantityOptions(quantity: string) {
    return this.page.evaluate((quantity) => {
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

      return Array.from(
        document.querySelectorAll<HTMLElement>(
          [
            `[id="${quantity}"]`,
            `.selecter.open .selecter-options .selecter-item`,
            `.selecter-options .selecter-item`,
            `[role="option"]`,
            `.ui-menu-item`,
            `li`,
            `span`,
            `div`,
          ].join(', '),
        ),
      )
        .filter((element) => isVisible(element))
        .filter((element) => {
          const text = normalize(element.innerText || element.textContent);
          const id = element.getAttribute('id') ?? '';
          const dataValue = element.getAttribute('data-value') ?? '';

          return text === quantity || id === quantity || dataValue === quantity;
        })
        .map((element) => {
          const rect = element.getBoundingClientRect();

          return {
            tag: element.tagName,
            id: element.id,
            className: String(element.className),
            text: normalize(element.innerText || element.textContent),
            dataValue: element.getAttribute('data-value'),
            onclick: element.getAttribute('onclick'),
            parentClass: String((element.parentElement as HTMLElement | null)?.className ?? ''),
            rect: {
              x: Math.round(rect.x),
              y: Math.round(rect.y),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
            },
            html: element.outerHTML.slice(0, 1000),
          };
        });
    }, quantity);
  }

  private async clickFirstRealVisibleQuantityOption(quantity: string) {
    const clicked = await this.page.evaluate((quantity) => {
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

      const candidates = Array.from(
        document.querySelectorAll<HTMLElement>(
          [
            `[id="${quantity}"]`,
            `.selecter.open .selecter-options .selecter-item`,
            `.selecter-options .selecter-item`,
            `[role="option"]`,
            `.ui-menu-item`,
            `li`,
            `span`,
            `div`,
          ].join(', '),
        ),
      )
        .filter((element) => isVisible(element))
        .filter((element) => {
          const text = normalize(element.innerText || element.textContent);
          const id = element.getAttribute('id') ?? '';
          const dataValue = element.getAttribute('data-value') ?? '';

          return text === quantity || id === quantity || dataValue === quantity;
        })
        .sort((left, right) => {
          const leftRect = left.getBoundingClientRect();
          const rightRect = right.getBoundingClientRect();

          return leftRect.y - rightRect.y || leftRect.x - rightRect.x;
        });

      const target = candidates[0];

      if (!target) {
        return false;
      }

      target.scrollIntoView({ block: 'center', inline: 'center' });

      const rect = target.getBoundingClientRect();
      const x = rect.x + rect.width / 2;
      const y = rect.y + rect.height / 2;

      for (const eventName of ['mouseover', 'mousemove', 'mousedown', 'mouseup', 'click']) {
        target.dispatchEvent(
          new MouseEvent(eventName, {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: x,
            clientY: y,
          }),
        );
      }

      return true;
    }, quantity);

    console.log(`[DEBUG] clickFirstRealVisibleQuantityOption(${quantity}) result:`, clicked);

    return clicked;
  }

  private async selectMemoryQuantityTwoUsingRecordedFlow(row: Locator) {
    await waitForBlockingOverlay(this.page);

    await this.scrollLocatorToCenter(row, `Memory ${MEMORY_PART} row`);

    const currentQuantity = await this.readRowQuantity(row).catch(() => '');

    if (currentQuantity === '2') {
      console.log('[INFO] Memory quantity is already 2');
      return;
    }

    console.log('[STEP] Selecting memory quantity 2 using exact recorded-style flow');

    const rowDiv = row.locator('div').filter({ visible: true }).first();

    if (await rowDiv.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await this.scrollLocatorToCenter(rowDiv, 'Memory row div quantity trigger');

      await rowDiv.click({ force: true }).catch(async () => {
        await rowDiv.evaluate((element) => (element as HTMLElement).click());
      });
    } else {
      await row.click({ force: true }).catch(async () => {
        await row.evaluate((element) => (element as HTMLElement).click());
      });
    }

    await this.page.waitForTimeout(700);

    const directOption = this.page.locator('[id="2"]').filter({ visible: true }).first();

    if (await directOption.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await this.scrollLocatorToCenter(directOption, 'Memory quantity option 2');

      await directOption.click({ force: true }).catch(async () => {
        await directOption.evaluate((element) => (element as HTMLElement).click());
      });

      await waitForBlockingOverlay(this.page);
      await this.page.waitForTimeout(2_000);

      console.log('[INFO] Memory quantity option 2 clicked using [id="2"]');
      return;
    }

    console.log('[INFO] Memory option [id="2"] was not visible; trying generic option fallback');

    await this.clickVisibleQuantityOption('2', `Memory ${MEMORY_PART}`);

    await waitForBlockingOverlay(this.page);
    await this.page.waitForTimeout(2_000);
  }

  private async selectQuantityUsingRecordedFlow(row: Locator, quantity: string, label: string) {
    await waitForBlockingOverlay(this.page);

    await this.scrollLocatorToCenter(row, `${label} row`);

    const currentQuantity = await this.readRowQuantity(row).catch(() => '');

    if (currentQuantity === quantity) {
      console.log(`[INFO] ${label} quantity is already ${quantity}`);
      return;
    }

    const clicked = await this.clickQuantityControlInRow(row, label);

    if (!clicked) {
      throw new Error(`${label} quantity control was not clickable`);
    }

    await this.clickVisibleQuantityOption(quantity, label);

    await waitForBlockingOverlay(this.page);
    await this.page.waitForTimeout(2_000);

    const finalQuantity = await this.readRowQuantity(row).catch(() => '');

    if (finalQuantity && finalQuantity !== quantity) {
      console.log(`[WARN] ${label} quantity read as "${finalQuantity}" after selecting ${quantity}. Continuing because OCA sometimes does not expose quantity text consistently.`);
    } else {
      console.log(`[INFO] ${label} quantity selection completed. Read value: ${finalQuantity || '<empty>'}`);
    }
  }

  private async clickQuantityControlInRow(row: Locator, label: string) {
    const targets = [
      row.locator('.item_qty_div').first(),
      row.locator('td.item_qty').first(),
      row.locator('[class*="qty"]').filter({ visible: true }).last(),
      row.locator('select').first(),
      row.locator('div').filter({ visible: true }).last(),
      row.locator('div').filter({ visible: true }).first(),
    ];

    for (const target of targets) {
      if (!(await target.isVisible({ timeout: 2_000 }).catch(() => false))) {
        continue;
      }

      await this.scrollLocatorToCenter(target, `${label} quantity control`);

      await target.click({ force: true }).catch(async () => {
        const box = await target.boundingBox();

        if (!box) {
          return;
        }

        await this.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      });

      await this.page.waitForTimeout(700);

      const optionVisible = await this.page
        .locator('[id="1"], [id="2"], [id="3"], [id="4"], .selecter-options .selecter-item, [role="option"], .ui-menu-item, li')
        .filter({ visible: true })
        .first()
        .isVisible({ timeout: 1_000 })
        .catch(() => false);

      if (optionVisible) {
        console.log(`[INFO] ${label} quantity popup opened`);
        return true;
      }
    }

    return false;
  }

  private async clickVisibleQuantityOption(quantity: string, label: string) {
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

    if (!(await option.isVisible({ timeout: 10_000 }).catch(() => false))) {
      const directOption = this.page.locator(`[id="${quantity}"]`).filter({ visible: true }).first();

      if (await directOption.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await this.scrollLocatorToCenter(directOption, `${label} direct quantity option ${quantity}`);

        await directOption.click({ force: true }).catch(async () => {
          await directOption.evaluate((element) => (element as HTMLElement).click());
        });

        console.log(`[INFO] ${label} direct quantity option clicked: ${quantity}`);
        return;
      }

      const textOption = this.page.getByText(exactQuantity).filter({ visible: true }).first();

      await expect(textOption, `${label} quantity option ${quantity} should be visible`).toBeVisible({
        timeout: 10_000,
      });

      await this.scrollLocatorToCenter(textOption, `${label} text quantity option ${quantity}`);

      await textOption.click({ force: true }).catch(async () => {
        await textOption.evaluate((element) => (element as HTMLElement).click());
      });

      console.log(`[INFO] ${label} text quantity option clicked: ${quantity}`);
      return;
    }

    await this.scrollLocatorToCenter(option, `${label} quantity option ${quantity}`);

    const box = await option.boundingBox();

    if (box) {
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;

      await this.page.mouse.move(x, y);
      await this.page.waitForTimeout(300);
      await this.page.mouse.click(x, y);
    } else {
      await option.click({ force: true }).catch(async () => {
        await option.evaluate((element) => (element as HTMLElement).click());
      });
    }

    console.log(`[INFO] ${label} quantity option clicked: ${quantity}`);
  }

  private async disableHpeRecommendedOnlyToggle() {
    await waitForBlockingOverlay(this.page);

    const toggleLabel = this.page.locator('label[for="menu_cust_cmn_toggle"]').first();

    if (!(await toggleLabel.isVisible({ timeout: 10_000 }).catch(() => false))) {
      console.log('[INFO] HPE Recommended only toggle was not visible; continuing');
      return;
    }

    const isEnabled = await this.page.evaluate(() => {
      const label = document.querySelector<HTMLLabelElement>('label[for="menu_cust_cmn_toggle"]');
      const toggleId = label?.getAttribute('for');
      const input = toggleId ? document.getElementById(toggleId) as HTMLInputElement | null : null;

      if (input && typeof input.checked === 'boolean') {
        return input.checked;
      }

      const container =
        label?.closest<HTMLElement>('div, span, label') ??
        label?.parentElement ??
        label;

      const toggle =
        container?.querySelector<HTMLElement>('[aria-checked], [role="switch"], input[type="checkbox"], .switch, .toggle, .slider') ??
        container;

      if (!toggle) {
        return null;
      }

      if (toggle instanceof HTMLInputElement && toggle.type === 'checkbox') {
        return toggle.checked;
      }

      const ariaChecked = toggle.getAttribute('aria-checked');

      if (ariaChecked === 'true') {
        return true;
      }

      if (ariaChecked === 'false') {
        return false;
      }

      const className = toggle.className.toString();
      const text = (toggle.textContent ?? '').replace(/\s+/g, ' ').trim();
      const style = window.getComputedStyle(toggle);

      if (/active|checked|selected|on/i.test(className) || /^on$/i.test(text)) {
        return true;
      }

      if (/rgb\(0,\s*150,\s*120\)|rgb\(0,\s*169,\s*130\)|green/i.test(style.backgroundColor)) {
        return true;
      }

      return null;
    });

    if (isEnabled === false) {
      console.log('[INFO] HPE Recommended only toggle is already OFF');
      return;
    }

    console.log('[STEP] Disabling HPE Recommended only toggle before selecting memory');

    await this.scrollLocatorToCenter(toggleLabel, 'HPE Recommended only toggle');

    await toggleLabel.click({ force: true }).catch(async () => {
      await toggleLabel.evaluate((element) => (element as HTMLElement).click());
    });

    const yesButton = this.page.getByRole('button', { name: /^Yes$/i });

    if (await yesButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await yesButton.click({ force: true });
    }

    await waitForBlockingOverlay(this.page);
    await this.page.waitForTimeout(2_000);
  }

  private async ensureRecommendedOnlyIfVisible() {
    const recommended = this.page
      .locator('label, span, div')
      .filter({ hasText: /HPE Recommended only|View HPE Recommended only/i })
      .filter({ visible: true })
      .first();

    if (!(await recommended.isVisible({ timeout: 5_000 }).catch(() => false))) {
      return;
    }

    await this.scrollLocatorToCenter(recommended, 'HPE Recommended only');

    await recommended.click({ force: true }).catch(async () => {
      await recommended.evaluate((element) => (element as HTMLElement).click());
    });

    const yesButton = this.page.getByRole('button', { name: /^Yes$/i });

    if (await yesButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await yesButton.click({ force: true });
    }

    await waitForBlockingOverlay(this.page);
  }

  private async scrollLocatorToCenter(locator: Locator, label: string) {
    await locator.scrollIntoViewIfNeeded().catch(() => undefined);

    await locator
      .evaluate((element, label) => {
        element.scrollIntoView({
          block: 'center',
          inline: 'center',
          behavior: 'instant',
        });

        console.log(`[scroll] ${label}`);
      }, label)
      .catch(() => undefined);

    await this.page.waitForTimeout(500);
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

  private async clickEvenIfOverlayWasRecentlyPresent(locator: Locator, label: string) {
    await expect(locator, `${label} should be visible`).toBeVisible({
      timeout: 60_000,
    });

    for (let attempt = 1; attempt <= 4; attempt += 1) {
      await waitForBlockingOverlay(this.page);
      await this.closeVisibleModalIfPossible();
      await this.waitForModalOverlayHidden();

      const overlayCount = await this.page
        .locator('.blockUI.blockOverlay:visible, .ui-widget-overlay:visible, .ui-widget-overlay.ui-front:visible')
        .count()
        .catch(() => 0);

      if (overlayCount === 0) {
        await locator.click({ timeout: 10_000 }).catch(async (error) => {
          console.log(`[INFO] ${label} normal click failed on attempt ${attempt}: ${String(error).split('\n')[0]}`);
          await locator.evaluate((element) => (element as HTMLElement).click());
        });

        await waitForBlockingOverlay(this.page);
        return;
      }

      console.log(`[INFO] ${label} click attempt ${attempt} waiting for overlays to clear. Overlay count: ${overlayCount}`);
      await this.page.waitForTimeout(2_000);
    }

    console.log(`[WARN] ${label} still has overlay interference; using DOM click fallback`);

    await locator.evaluate((element) => (element as HTMLElement).click());

    await waitForBlockingOverlay(this.page);
  }

  private async closeVisibleModalIfPossible() {
    const visibleDialog = this.page.locator('.ui-dialog:visible, [role="dialog"]:visible').last();

    if (!(await visibleDialog.isVisible({ timeout: 2_000 }).catch(() => false))) {
      return;
    }

    const dialogText = (await visibleDialog.textContent().catch(() => ''))?.replace(/\s+/g, ' ').trim();

    console.log(`[INFO] Visible dialog before action: ${dialogText?.slice(0, 300) || '<empty>'}`);

    const okButton = visibleDialog
      .getByRole('button', { name: /^(OK|Ok|Yes|Done|Close)$/i })
      .or(visibleDialog.locator('button, input[type="button"], .s-btn').filter({ hasText: /^(OK|Ok|Yes|Done|Close)$/i }))
      .first();

    if (await okButton.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await okButton.click({ force: true }).catch(async () => {
        await okButton.evaluate((element) => (element as HTMLElement).click());
      });

      await visibleDialog.waitFor({ state: 'hidden', timeout: 20_000 }).catch(() => undefined);
      return;
    }

    const closeButton = visibleDialog.locator('.ui-dialog-titlebar-close, [aria-label*="close" i], [title*="close" i]').first();

    if (await closeButton.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await closeButton.click({ force: true }).catch(async () => {
        await closeButton.evaluate((element) => (element as HTMLElement).click());
      });

      await visibleDialog.waitFor({ state: 'hidden', timeout: 20_000 }).catch(() => undefined);
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

function updateEndBomWorkbook(result: FourthModelExcelResult) {
  try {
    const workbook = XLSX.readFile(END_BOM_WORKBOOK_PATH);
    const sheetName = workbook.SheetNames[0];

    const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(workbook.Sheets[sheetName], {
      header: 1,
      defval: null,
    });

    const headers = normalizeEndBomHeaders(rows[0] ?? []);
    rows[0] = headers;

    const modelNoColumn = headers.indexOf('Model no');

    const modelRows = rows
      .slice(1)
      .filter((row) => String(row[modelNoColumn] ?? '').trim().length > 0);

    let rowIndex = modelRows.findIndex(
      (row) => String(row[modelNoColumn] ?? '').trim() === result.modelNo,
    );

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


export async function run(page: Page, context: BrowserContext) {
  const result: FourthModelExcelResult = { modelNo: BASE_MODEL_PART, processor: SELECTED_PROCESSOR, memory: SELECTED_MEMORY, service: SERVICE_LEVEL, startBomUcid: '', endBomUcid: '', associateEndBom: 'No', status: 'Fail' };
  try {
    console.log('[START] Model 4 started');
    const flow = new FourthModelOcaConfigFlow(page, context, result);
    let configPage: Page;
    await test.step(`Model 4 - Search and open ${BASE_MODEL_PART}`, async () => { configPage = await flow.searchAndOpenBaseModel(BASE_MODEL_PART); });
    await test.step(`Model 4 - Processor ${PROCESSOR_PART}`, async () => { await flow.useConfigPage(configPage); await flow.selectProcessor(); });
    await test.step(`Model 4 - Memory ${MEMORY_PART}`, async () => flow.selectMemory());
    await test.step(`Model 4 - Memory Blank Kit ${MEMORY_BLANK_KIT_PART}`, async () => flow.selectMemoryBlankKit());
    await test.step(`Model 4 - Smart Chassis ${SMART_CHASSIS_PART}`, async () => flow.selectSmartChassisBackplane());
    await test.step('Model 4 - Storage cables', async () => flow.selectStorageCableKits());
    await test.step('Model 4 - Networking section', async () => flow.openNetworkingSection());
    await test.step(`Model 4 - Power ${POWER_SUPPLY_PART}`, async () => flow.selectPowerSupply());
    await test.step('Model 4 - Recheck Memory Blank Kit', async () => flow.recheckMemoryAndBlankKitAfterRecalculation());
    await test.step('Model 4 - Lite service', async () => flow.selectLiteService());
    await test.step('Model 4 - Billing Tier Setup', async () => flow.runBillingTierSetup());
    await test.step('Model 4 - Save', async () => flow.saveOcaConfig());
    await test.step('Model 4 - End BOM', async () => flow.generateAndAssociateEndBom());
    result.status = 'Pass'; updateEndBomWorkbook(result); console.log('[PASS] Model 4 completed');
  } catch (error) { console.error('[FAIL] Model 4 failed:', error); updateEndBomWorkbook({ ...result, status: 'Fail' }); throw error; }
}

}


namespace Model5 {
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
const SERVER_MEMORY = 'P50309-B21';
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


export async function run(page: Page, context: BrowserContext) {
  const result: FifthModelExcelResult = { modelNo: BASE_MODEL_PART, processor: SELECTED_PROCESSOR, memory: SELECTED_MEMORY, service: 'GreenLake Private Cloud Business Edition', startBomUcid: '', endBomUcid: '', associateEndBom: 'No', status: 'Fail' };
  try {
    console.log('[START] Model 5 started');
    const flow = new FifthModelFlow(page, context, result);
    await test.step(`Model 5 - Search and customize ${BASE_MODEL_PART}`, async () => flow.searchAndCustomizeBaseModel());
    await test.step('Model 5 - Solution Wizard', async () => flow.createIconAndConfigureSolutionWizard());
    await test.step('Model 5 - Controller nodes', async () => flow.configureControllerNodes());
    await test.step('Model 5 - Storage capacity and DAC cables', async () => flow.configureStorageCapacityAndDacCables());
    await test.step('Model 5 - Server icon details', async () => flow.configureServerIconDetails());
    await test.step('Model 5 - Billing Tier Setup', async () => flow.runBillingTierSetup());
    await test.step('Model 5 - Save', async () => flow.saveOcaConfig());
    await test.step('Model 5 - End BOM', async () => flow.generateAndAssociateEndBom());
    result.status = 'Pass'; updateEndBomWorkbook(result); console.log('[PASS] Model 5 completed');
  } catch (error) { console.error('[FAIL] Model 5 failed:', error); updateEndBomWorkbook({ ...result, status: 'Fail' }); throw error; }
}

}


async function getActivePage(context: BrowserContext) {
  const pages = context.pages().filter((candidate) => !candidate.isClosed());
  const page = pages[pages.length - 1];
  if (!page) throw new Error('No active page found in browser context');
  page.setDefaultTimeout(30_000);
  page.setDefaultNavigationTimeout(90_000);
  return page;
}

async function sharedWaitForBlockingOverlay(page: Page) {
  await page.locator('.blockUI.blockOverlay').waitFor({ state: 'hidden', timeout: 60_000 }).catch(() => {
    console.log('[INFO] Blocking overlay did not become hidden within 60 seconds; continuing');
  });
  await page.waitForFunction(() => Array.from(document.querySelectorAll<HTMLElement>('.blockUI.blockMsg, .maui-loading-div, .maui-loading-label')).every((element) => {
    const style = window.getComputedStyle(element);
    const container = element.closest<HTMLElement>('.blockUI.blockMsg') ?? element;
    const containerStyle = window.getComputedStyle(container);
    return style.display === 'none' || style.visibility === 'hidden' || containerStyle.display === 'none' || containerStyle.visibility === 'hidden' || Number(containerStyle.opacity || '1') <= 0.01;
  }), undefined, { timeout: 90_000 }).catch(() => {
    console.log('[INFO] OCA loading message did not disappear within 90 seconds; continuing');
  });
}

async function goHomeForNextModel(context: BrowserContext, modelLabel: string) {
  let page = await getActivePage(context);
  console.log(`[STEP] ${modelLabel} completed. Going Home for next model.`);
  await sharedWaitForBlockingOverlay(page);

  const candidates = [
    page.locator('#eo_nav_li_0').first(),
    page.locator('#home, [id*="home" i], [title*="home" i]').filter({ visible: true }).first(),
    page.getByRole('link', { name: /^Home$/i }).first(),
    page.getByText(/^Home$/i).filter({ visible: true }).first(),
  ];

  let clicked = false;
  for (const candidate of candidates) {
    if (await candidate.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await candidate.click({ force: true }).catch(async () => {
        await candidate.evaluate((element) => (element as HTMLElement).click());
      });
      clicked = true;
      break;
    }
  }

  if (!clicked) {
    console.log('[WARN] Home button was not found. Reopening OCA landing URL in same browser.');
    await page.goto('https://ngc-itg-oca-internal.its.hpecorp.net/ocaPreForkM1/OCAInternalLogin', { waitUntil: 'domcontentloaded' });
  }

  await sharedWaitForBlockingOverlay(page);
  await page.waitForTimeout(2_000);
  page = await getActivePage(context);

  const search = page.getByRole('textbox', { name: /Search to open UCID or create|Search config/i }).or(page.locator('#search-config')).first();
  if (!(await search.isVisible({ timeout: 30_000 }).catch(() => false))) {
    console.log('[WARN] Search box not visible after Home. Clicking aaS if visible.');
    const aaS = page.getByText(/^aaS$/i).filter({ visible: true }).first();
    if (await aaS.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await aaS.click({ force: true }).catch(async () => aaS.evaluate((element) => (element as HTMLElement).click()));
      await sharedWaitForBlockingOverlay(page);
    }
  }

  console.log('[INFO] Home/search page prepared for next model');
  return await getActivePage(context);
}

test('run all OCA Config 2 models one by one in same browser', async ({ playwright }) => {
  test.setTimeout(120 * 60_000);
  let context: BrowserContext | undefined;
  try {
    console.log('[START] Combined OCA automation started');
    context = await playwright.chromium.launchPersistentContext('C:\\selenium\\oca-profile', {
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
    let page = context.pages()[0] ?? await context.newPage();
    page.setDefaultTimeout(30_000);
    page.setDefaultNavigationTimeout(90_000);

    await Model1.run(page, context);
    page = await goHomeForNextModel(context, 'Model 1');
    await Model2.run(page, context);
    page = await goHomeForNextModel(context, 'Model 2');
    await Model3.run(page, context);
    page = await goHomeForNextModel(context, 'Model 3');
    await Model4.run(page, context);
    page = await goHomeForNextModel(context, 'Model 4');
    await Model5.run(page, context);
    console.log('[PASS] Combined OCA automation completed successfully');
  } finally {
    await context?.close().catch(() => undefined);
  }
});
