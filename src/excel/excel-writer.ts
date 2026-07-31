import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';
import type { AutomationResult } from '../models/automation-result';

const RESULT_HEADERS = [
  'Job ID', 'Model Number', 'Execution Status', 'UCID', 'Quotation Mode', 'OCA Config Status',
  'End BOM Status', 'End BOM ID', 'Selected Components', 'Start Time', 'End Time', 'Duration',
  'Retry Count', 'Error Step', 'Error Message', 'Screenshot Path', 'Trace Path',
] as const;

export class ExcelWriter {
  private readonly results = new Map<string, AutomationResult>();
  readonly outputPath: string;

  constructor(outputDirectory: string, inputPath: string) {
    fs.mkdirSync(outputDirectory, { recursive: true });
    const stem = path.basename(inputPath, path.extname(inputPath));
    this.outputPath = path.join(outputDirectory, `${stem}-results.xlsx`);
    this.loadExisting();
  }

  getExisting(jobId: string): AutomationResult | undefined {
    return this.results.get(jobId);
  }

  async writeResult(result: AutomationResult): Promise<void> {
    this.results.set(result.jobId, result);
    this.flush();
  }

  private loadExisting(): void {
    if (!fs.existsSync(this.outputPath)) return;
    const workbook = XLSX.readFile(this.outputPath);
    const sheet = workbook.Sheets.Results;
    if (!sheet) return;
    const rows = XLSX.utils.sheet_to_json<Record<string, string | number>>(sheet, { defval: '' });
    for (const row of rows) {
      const jobId = String(row['Job ID'] ?? '').trim();
      if (!jobId) continue;
      this.results.set(jobId, {
        jobId,
        modelNumber: String(row['Model Number'] ?? ''),
        executionStatus: String(row['Execution Status']) as AutomationResult['executionStatus'],
        ucid: String(row.UCID ?? ''), quotationMode: String(row['Quotation Mode'] ?? ''),
        ocaConfigStatus: String(row['OCA Config Status'] ?? ''), endBomStatus: String(row['End BOM Status'] ?? ''),
        endBomId: String(row['End BOM ID'] ?? ''), selectedComponents: String(row['Selected Components'] ?? ''),
        startTime: String(row['Start Time'] ?? ''), endTime: String(row['End Time'] ?? ''),
        duration: Number(row.Duration ?? 0), retryCount: Number(row['Retry Count'] ?? 0),
        errorStep: String(row['Error Step'] ?? ''), errorMessage: String(row['Error Message'] ?? ''),
        screenshotPath: String(row['Screenshot Path'] ?? ''), tracePath: String(row['Trace Path'] ?? ''),
      });
    }
  }

  private flush(): void {
    const values = [...this.results.values()];
    const resultRows = values.map((result) => ({
      'Job ID': result.jobId, 'Model Number': result.modelNumber, 'Execution Status': result.executionStatus,
      UCID: result.ucid, 'Quotation Mode': result.quotationMode, 'OCA Config Status': result.ocaConfigStatus,
      'End BOM Status': result.endBomStatus, 'End BOM ID': result.endBomId, 'Selected Components': result.selectedComponents,
      'Start Time': result.startTime, 'End Time': result.endTime, Duration: result.duration,
      'Retry Count': result.retryCount, 'Error Step': result.errorStep, 'Error Message': result.errorMessage,
      'Screenshot Path': result.screenshotPath, 'Trace Path': result.tracePath,
    }));
    const starts = values.map((value) => value.startTime).filter(Boolean).sort();
    const ends = values.map((value) => value.endTime).filter(Boolean).sort();
    const summary = [{
      Total: values.length,
      Success: values.filter((r) => r.executionStatus === 'Success').length,
      Failed: values.filter((r) => r.executionStatus === 'Failed').length,
      Skipped: values.filter((r) => r.executionStatus === 'Skipped').length,
      Unsupported: values.filter((r) => r.executionStatus === 'Unsupported').length,
      'End BOM Generated': values.filter((r) => r.endBomStatus === 'Generated and associated').length,
      'Start Time': starts[0] ?? '', 'End Time': ends.at(-1) ?? '',
      'Total Duration': values.reduce((sum, result) => sum + result.duration, 0),
    }];
    const workbook = XLSX.utils.book_new();
    const resultsSheet = XLSX.utils.json_to_sheet(resultRows, { header: [...RESULT_HEADERS] });
    XLSX.utils.book_append_sheet(workbook, resultsSheet, 'Results');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summary), 'Summary');
    XLSX.writeFile(workbook, this.outputPath);
  }
}
