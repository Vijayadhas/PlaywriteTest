import { expect, type BrowserContext, type Page } from '@playwright/test';
import type { OcaJob } from '../models/job';
import type { AutomationResult } from '../models/automation-result';
import { createPendingResult } from '../models/automation-result';
import { waitForBlockingOverlay } from '../core/waits';
import { safeClick } from '../core/interactions';
import { ModelSearch } from './model-search';
import { ComponentEngine } from './component-engine';
import { BillingTier } from './billing-tier';
import { SaveFlow } from './save-flow';
import { EndBom } from './end-bom';
import { ExceptionRegistry } from '../exceptions/exception-registry';

export interface OcaEngineOptions { baseUrl: string; authWaitMs: number; expectedPageText: string; }

export class OcaEngine {
  private page?: Page;
  components!: ComponentEngine;
  currentStep = 'Initialize';
  private authenticated = false;

  constructor(private readonly context: BrowserContext, private readonly exceptions: ExceptionRegistry, private readonly options: OcaEngineOptions) {}

  get activePage(): Page {
    if (!this.page) throw new Error('OCA page is not initialized');
    return this.page;
  }

  async processJob(job: OcaJob, retryCount = 0): Promise<AutomationResult> {
    const result = createPendingResult(job.jobId, job.modelNumber, retryCount);
    this.currentStep = 'Open OCA';
    await this.openOca();
    this.currentStep = 'Select aaS';
    await this.selectAasAndVerifyLanding();
    this.currentStep = 'Search model';
    this.page = await new ModelSearch(this.context).searchAndOpen(this.activePage, job.modelNumber);
    this.components = new ComponentEngine(this.activePage);
    this.currentStep = 'Verify Quotation Mode';
    result.quotationMode = await this.verifyQuotationMode();

    if (job.source.kind !== 'detailed-excel') throw new Error(`Unsupported configuration source: ${job.source.referenceType}`);
    for (const instruction of job.source.instructions) {
      this.currentStep = `Component ${instruction.sequence}: ${instruction.productNumber ?? instruction.section}`;
      const exception = this.exceptions.find(instruction);
      if (exception) await exception.execute(this, instruction);
      else await this.components.executeGeneric(instruction);
    }
    result.selectedComponents = job.source.instructions.map((item) =>
      `${item.productNumber ?? item.configurationText ?? item.section}${item.quantity == null ? '' : ` x${item.quantity}`}`).join('; ');

    this.currentStep = 'Select service';
    await this.selectService(job.serviceType);
    this.currentStep = 'Billing Tier Setup';
    await new BillingTier(this.activePage).run();
    this.currentStep = 'Save OCA configuration';
    const save = await new SaveFlow(this.activePage).save();
    result.ucid = save.ucid; result.ocaConfigStatus = save.status;
    if (job.generateEndBom) {
      this.currentStep = 'Generate and associate End BOM';
      const endBom = await new EndBom(this.activePage).generateAndAssociate();
      result.endBomStatus = endBom.status; result.endBomId = endBom.endBomId;
    }
    result.executionStatus = 'Success';
    result.endTime = new Date().toISOString();
    result.duration = Date.parse(result.endTime) - Date.parse(result.startTime);
    return result;
  }

  private async openOca(): Promise<void> {
    const candidate = this.context.pages().find((page) => !page.isClosed()) ?? await this.context.newPage();
    this.page = candidate;
    await this.page.goto(this.options.baseUrl, { waitUntil: 'domcontentloaded' });
    if (!this.authenticated) {
      console.log(`[INFO] Complete manual authentication if prompted (${this.options.authWaitMs} ms window)`);
      await this.page.waitForTimeout(this.options.authWaitMs);
      this.authenticated = true;
    }
    await waitForBlockingOverlay(this.page);
  }

  private async selectAasAndVerifyLanding(): Promise<void> {
    const aaS = this.activePage.getByText(/^aaS$/i).filter({ visible: true }).first();
    const search = this.activePage.getByRole('textbox', { name: /Search to open UCID or create|Search config/i })
      .or(this.activePage.locator('#search-config')).first();
    await expect.poll(async () => {
      if (await aaS.isVisible({ timeout: 500 }).catch(() => false)) return 'aaS';
      if (await search.isVisible({ timeout: 500 }).catch(() => false)) return 'search';
      return '';
    }, { timeout: 180_000, message: 'Authenticated OCA landing page' }).not.toBe('');
    if (await aaS.isVisible({ timeout: 1_000 }).catch(() => false)) await safeClick(aaS);
    await waitForBlockingOverlay(this.activePage);
    await expect(search, 'aaS search landing page').toBeVisible({ timeout: 60_000 });
  }

  private async verifyQuotationMode(): Promise<string> {
    await expect(this.activePage.getByText(this.options.expectedPageText, { exact: false }).first()).toBeVisible({ timeout: 60_000 });
    const quote = this.activePage.getByText(/Quotation Mode\s*:?\s*aaS|aaS\s+Quotation Mode/i).filter({ visible: true }).first();
    if (await quote.isVisible({ timeout: 10_000 }).catch(() => false)) return 'aaS';
    const body = (await this.activePage.locator('body').innerText()).replace(/\s+/g, ' ');
    if (/Quotation Mode.{0,30}\baaS\b/i.test(body)) return 'aaS';
    throw new Error('Quotation Mode was not visibly verified as aaS');
  }

  private async selectService(serviceType: string): Promise<void> {
    await this.activePage.getByRole('link', { name: 'Services', exact: true }).click();
    await waitForBlockingOverlay(this.activePage);
    const serviceRow = this.activePage.locator('tr, [role="row"], label, div').filter({ visible: true, hasText: new RegExp(serviceType, 'i') }).first();
    const radio = serviceRow.locator('input[type="radio"]').filter({ visible: true }).first();
    if (await radio.isVisible({ timeout: 3_000 }).catch(() => false)) await radio.check({ force: true });
    else if (/^default$/i.test(serviceType)) await this.activePage.locator('.radio_default').filter({ visible: true }).first().click();
    else throw new Error(`Service type ${serviceType} was not visible`);
    await waitForBlockingOverlay(this.activePage);
  }
}
