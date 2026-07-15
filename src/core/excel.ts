import { type Page } from '@playwright/test';
import * as XLSX from 'xlsx';
import { env } from '../config/env';
import { waitForBlockingOverlay } from './waits';
import type { ModelSpec } from '../models/model.types';

export type EndBomResult = {
  modelNo: string;
  processor: string;
  memory: string;
  networkCard?: string;
  service?: string;
  startBomUcid: string;
  endBomUcid: string;
  associateEndBom: 'Yes' | 'No';
  status: 'Pass' | 'Fail';
};

export function newResult(spec: ModelSpec): EndBomResult {
  return {
    modelNo: spec.modelNumber,
    processor: spec.selectedProcessor,
    memory: spec.selectedMemory,
    networkCard: spec.networkCard,
    service: spec.service,
    startBomUcid: '',
    endBomUcid: '',
    associateEndBom: 'No',
    status: 'Fail',
  };
}

export function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error).split('\n')[0];
}

export function normalizeEndBomHeaders(existingHeaders: (string | number | null)[]) {
  const desiredHeaders = ['S.No', 'Model no', 'Processor', 'Memory', 'Start BOM UCID', 'End BOM UCID', 'Associate End BOM', 'Status'];
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

export function updateEndBomWorkbook(result: EndBomResult) {
  try {
    const workbook = XLSX.readFile(env.endBomWorkbookPath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, { header: 1, defval: null });
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
    row[headers.indexOf('Model no')] = result.modelNo;
    row[headers.indexOf('Processor')] = result.processor;
    row[headers.indexOf('Memory')] = result.memory;
    row[headers.indexOf('Start BOM UCID')] = result.startBomUcid;
    row[headers.indexOf('End BOM UCID')] = result.endBomUcid;
    row[headers.indexOf('Associate End BOM')] = result.associateEndBom;
    row[headers.indexOf('Status')] = result.status;
    modelRows[rowIndex] = row;
    modelRows.forEach((currentRow, index) => {
      currentRow[headers.indexOf('S.No')] = index + 1;
    });
    workbook.Sheets[sheetName] = XLSX.utils.aoa_to_sheet([headers, ...modelRows]);
    XLSX.writeFile(workbook, env.endBomWorkbookPath);
    console.log('[INFO] End BOM validation workbook updated:', env.endBomWorkbookPath);
  } catch (error) {
    console.log('[WARN] End BOM validation workbook update skipped:', getErrorMessage(error));
  }
}

export async function readBomUcid(page: Page, labelText: string) {
  await waitForBlockingOverlay(page);
  const value = await page.evaluate((labelText) => {
    const normalize = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();
    const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const labelPattern = new RegExp(`${escapeRegex(labelText)}\\s*[:#-]?\\s*([A-Za-z0-9_-]+)`, 'i');
    const bodyMatch = normalize(document.body.textContent).match(labelPattern);
    if (bodyMatch?.[1]) {
      return bodyMatch[1];
    }
    const labels = Array.from(document.querySelectorAll<HTMLElement>('td, th, label, span, div, p')).filter((element) =>
      normalize(element.textContent).toLowerCase().includes(labelText.toLowerCase()),
    );
    for (const label of labels) {
      const row = label.closest('tr');
      if (row) {
        const cells = Array.from(row.querySelectorAll<HTMLElement>('td, th, span, div')).map((cell) => normalize(cell.textContent));
        const labelIndex = cells.findIndex((cell) => cell.toLowerCase().includes(labelText.toLowerCase()));
        const candidate = cells.slice(labelIndex + 1).find((cell) => /^[A-Za-z0-9_-]{4,}$/.test(cell) && !cell.toLowerCase().includes(labelText.toLowerCase()));
        if (candidate) {
          return candidate;
        }
      }
      let sibling = label.nextElementSibling;
      while (sibling) {
        const text = normalize(sibling.textContent);
        if (/^[A-Za-z0-9_-]{4,}$/.test(text)) {
          return text;
        }
        sibling = sibling.nextElementSibling;
      }
    }
    return '';
  }, labelText);
  if (!value) {
    console.log(`[INFO] ${labelText} was not found on the End BOM page`);
  }
  return value;
}
