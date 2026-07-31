import fs from 'node:fs';
import path from 'node:path';
import type { BrowserSession } from '../automation/browser-session';

const safeName = (value: string) => value.replace(/[^A-Za-z0-9_.-]+/g, '_');

export class TraceManager {
  private readonly directory: string;
  constructor(private readonly session: BrowserSession, outputDirectory: string, private readonly enabled: boolean) {
    this.directory = path.join(outputDirectory, 'traces');
    fs.mkdirSync(this.directory, { recursive: true });
  }
  async start(jobId: string): Promise<void> { if (this.enabled) await this.session.beginTrace(jobId); }
  async finish(jobId: string, retain: boolean): Promise<string> {
    if (!this.enabled) return '';
    const file = retain ? path.resolve(this.directory, `${safeName(jobId)}-${Date.now()}.zip`) : undefined;
    await this.session.endTrace(file);
    return file ?? '';
  }
}
