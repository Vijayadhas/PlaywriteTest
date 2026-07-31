import path from 'node:path';
import { chromium, type BrowserContext, type Page } from '@playwright/test';
import { installOcaShim } from '../core/shim';

export interface BrowserSessionOptions {
  profilePath: string;
  headed: boolean;
  trace: boolean;
  actionTimeoutMs: number;
  navigationTimeoutMs: number;
}

export class BrowserSession {
  private context?: BrowserContext;

  constructor(private readonly options: BrowserSessionOptions) {}

  async start(): Promise<BrowserContext> {
    if (this.context) return this.context;
    this.context = await chromium.launchPersistentContext(path.resolve(this.options.profilePath), {
      headless: !this.options.headed,
      viewport: { width: 1920, height: 1080 },
      ignoreHTTPSErrors: true,
      args: [
        '--ignore-certificate-errors', '--allow-running-insecure-content', '--disable-web-security',
        '--disable-notifications', '--no-first-run', '--no-default-browser-check',
      ],
    });
    this.context.setDefaultTimeout(this.options.actionTimeoutMs);
    this.context.setDefaultNavigationTimeout(this.options.navigationTimeoutMs);
    for (const page of this.context.pages()) await installOcaShim(page);
    this.context.on('page', (page) => void installOcaShim(page));
    return this.context;
  }

  async page(): Promise<Page> {
    const context = await this.start();
    return context.pages()[0] ?? context.newPage();
  }

  async beginTrace(title: string): Promise<void> {
    if (!this.options.trace) return;
    const context = await this.start();
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true, title });
  }

  async endTrace(tracePath?: string): Promise<void> {
    if (!this.options.trace) return;
    const context = await this.start();
    await context.tracing.stop(tracePath ? { path: tracePath } : undefined).catch(() => undefined);
  }

  async close(): Promise<void> {
    await this.context?.close().catch(() => undefined);
    this.context = undefined;
  }
}
