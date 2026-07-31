import fs from 'node:fs';
import path from 'node:path';

export class Logger {
  private readonly logPath: string;
  constructor(outputDirectory: string) {
    const directory = path.join(outputDirectory, 'logs');
    fs.mkdirSync(directory, { recursive: true });
    this.logPath = path.join(directory, 'oca-run.jsonl');
  }
  info(message: string, data: Record<string, unknown> = {}): void { this.write('info', message, data); }
  error(message: string, data: Record<string, unknown> = {}): void { this.write('error', message, data); }
  private write(level: 'info' | 'error', message: string, data: Record<string, unknown>): void {
    const record = { timestamp: new Date().toISOString(), level, message, ...data };
    fs.appendFileSync(this.logPath, `${JSON.stringify(record)}\n`);
  }
}
