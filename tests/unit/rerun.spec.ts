import { test, expect, type BrowserContext } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';
import { run } from '../../src/main';
import { BrowserSession } from '../../src/automation/browser-session';
import { OcaEngine } from '../../src/automation/oca-engine';
import { ExcelWriter } from '../../src/excel/excel-writer';
import { createPendingResult } from '../../src/models/automation-result';

test('normal runs execute previously successful jobs again and update their results', async () => {
  const directory = test.info().outputPath('rerun');
  fs.mkdirSync(directory, { recursive: true });
  const input = path.join(directory, 'models.xlsx');
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([
    { 'Job ID': 'repeat', 'Model Number': 'P72176-B21', Enabled: 'Yes' },
  ]), 'Models');
  XLSX.writeFile(workbook, input);
  const previous = createPendingResult('repeat', 'P72176-B21');
  previous.executionStatus = 'Success';
  previous.ucid = 'OLD';
  await new ExcelWriter(directory, input).writeResult(previous);

  const originalStart = BrowserSession.prototype.start;
  const originalProcess = OcaEngine.prototype.processJob;
  const executed: string[] = [];
  BrowserSession.prototype.start = async () => ({} as BrowserContext);
  OcaEngine.prototype.processJob = async (job, retryCount) => {
    executed.push(job.jobId);
    const result = createPendingResult(job.jobId, job.modelNumber, retryCount);
    result.executionStatus = 'Success';
    result.ucid = 'NEW';
    return result;
  };
  try {
    expect(await run(['--input', input, '--output', directory])).toBe(0);
    expect(executed).toEqual(['repeat']);
    expect(new ExcelWriter(directory, input).getExisting('repeat')).toMatchObject({ ucid: 'NEW', retryCount: 1 });
    expect(await run(['--input', input, '--output', directory, '--retry-failed'])).toBe(0);
    expect(executed).toEqual(['repeat']);
  } finally {
    BrowserSession.prototype.start = originalStart;
    OcaEngine.prototype.processJob = originalProcess;
  }
});
