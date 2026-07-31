import * as XLSX from 'xlsx';
import type { OcaJob } from '../models/job';
import { isSelectionType, type ComponentInstruction, type SelectionType } from '../models/component-instruction';
import { ExcelValidator } from './excel-validator';

type Cell = string | number | boolean | Date | null | undefined;
type Row = Record<string, Cell>;

export interface JobReadOptions {
  startRow?: number;
  jobId?: string;
}

const text = (value: Cell): string => String(value ?? '').trim();
const bool = (value: Cell, defaultValue: boolean): boolean => {
  const normalized = text(value).toLowerCase();
  if (!normalized) return defaultValue;
  return ['true', 'yes', 'y', '1', 'enabled'].includes(normalized);
};

export class ExcelReader {
  constructor(private readonly validator = new ExcelValidator()) {}

  read(filePath: string, options: JobReadOptions = {}): OcaJob[] {
    const workbook = XLSX.readFile(filePath, { cellDates: true });
    const modelsSheet = workbook.Sheets.Models;
    const componentsSheet = workbook.Sheets.Components;
    if (!modelsSheet) throw new Error('Input workbook must contain a Models sheet');

    if (!componentsSheet) {
      const jobs = this.readFlatModels(modelsSheet);
      this.validator.validate(jobs);
      return this.applyFilters(jobs, options);
    }

    const componentRows = XLSX.utils.sheet_to_json<Row>(componentsSheet, { defval: '' });
    const byJob = new Map<string, ComponentInstruction[]>();
    componentRows.forEach((row, index) => {
      const jobId = text(row['Job ID']);
      if (!jobId) return;
      const rawType = text(row['Selection Type']).toLowerCase();
      const selectionType: SelectionType = isSelectionType(rawType) ? rawType : (rawType as SelectionType);
      const quantityText = text(row.Quantity);
      const sequenceText = text(row.Sequence);
      const instruction: ComponentInstruction = {
        jobId,
        section: text(row.Section),
        productNumber: text(row['Product Number']) || undefined,
        description: text(row.Description) || undefined,
        quantity: quantityText ? Number(quantityText) : undefined,
        selectionType,
        configurationText: text(row['Configuration Text']) || undefined,
        sequence: sequenceText ? Number(sequenceText) : index + 1,
      };
      byJob.set(jobId, [...(byJob.get(jobId) ?? []), instruction]);
    });

    const modelRows = XLSX.utils.sheet_to_json<Row>(modelsSheet, { defval: '' });
    const jobs = modelRows.map((row, index): OcaJob => {
      const jobId = text(row['Job ID']);
      return {
        jobId,
        modelNumber: text(row['Model Number']),
        solutionName: text(row['Solution Name']) || undefined,
        quotationMode: 'aaS',
        serviceType: text(row['Service Type']) || 'Default',
        generateEndBom: bool(row['Generate End BOM'], true),
        enabled: bool(row.Enabled, true),
        source: {
          kind: 'detailed-excel',
          instructions: (byJob.get(jobId) ?? []).sort((a, b) => a.sequence - b.sequence),
        },
        inputRow: index + 2,
      };
    });
    this.validator.validate(jobs);
    return this.applyFilters(jobs, options);
  }

  private readFlatModels(sheet: XLSX.WorkSheet): OcaJob[] {
    const rows = XLSX.utils.sheet_to_json<Row>(sheet, { defval: '' });
    return rows.map((row, index): OcaJob => {
      const inputRow = index + 2;
      const jobId = text(row['Job ID']) || `ROW-${inputRow}`;
      const modelNumber = text(row['Model Number']) || text(row.Model);
      const quotation = text(row['Quotation Mode']) || 'aaS';
      if (!/^aaS$/i.test(quotation)) {
        throw new Error(`Models row ${inputRow}: Quotation Mode must be aaS`);
      }
      return {
        jobId,
        modelNumber,
        solutionName: text(row['Solution Name']) || text(row['Product or Solution Description']) || undefined,
        quotationMode: 'aaS',
        serviceType: text(row['Service Type']) || text(row.Service) || 'Default',
        generateEndBom: bool(row['Generate End BOM'] ?? row['End BOM Required'], true),
        enabled: bool(row.Enabled, true),
        source: { kind: 'detailed-excel', instructions: this.flatInstructions(row, jobId) },
        inputRow,
      };
    });
  }

  private flatInstructions(row: Row, jobId: string): ComponentInstruction[] {
    const instructions: ComponentInstruction[] = [];
    let sequence = 10;
    const addProduct = (section: string, productValue: Cell, quantityValue: Cell) => {
      const productNumber = text(productValue);
      const quantityText = text(quantityValue);
      if (!productNumber || /^(default|automatic)$/i.test(productNumber)) return;
      const quantity = quantityText ? Number(quantityText) : 1;
      instructions.push({ jobId, section, productNumber, quantity, selectionType: 'quantity', sequence });
      sequence += 10;
    };
    addProduct('Processor', row.Processor ?? row['Processor Part'], row['Processor Qty']);
    addProduct('Memory', row.Memory ?? row['Memory Part'], row['Memory Qty']);

    const smartProduct = text(row['Smart Chassis Product']);
    const chassisConfig = text(row['Chassis Config'] ?? row['Smart Chassis Config']);
    if (smartProduct && !/^(default|automatic)$/i.test(smartProduct)) {
      instructions.push({
        jobId, section: 'Smart Chassis', productNumber: smartProduct,
        quantity: Number(text(row['Smart Chassis Qty']) || '1'), selectionType: 'quantity',
        configurationText: chassisConfig && !/^default$/i.test(chassisConfig) ? chassisConfig : undefined,
        sequence,
      });
      sequence += 10;
    }
    if (chassisConfig && !/^default$/i.test(chassisConfig) && smartProduct.toUpperCase() !== 'P72221-B21') {
      instructions.push({ jobId, section: 'Smart Chassis', selectionType: 'configuration', configurationText: chassisConfig, sequence });
      sequence += 10;
    }
    addProduct('Power Supplies', row['Power Supply'] ?? row['Power Supply Part'], row['Power Qty'] ?? row['Power Supply Qty']);
    return instructions;
  }

  private applyFilters(jobs: OcaJob[], options: JobReadOptions): OcaJob[] {
    let filtered = jobs;
    if (options.startRow) filtered = filtered.filter((job) => job.inputRow >= options.startRow!);
    if (options.jobId) filtered = filtered.filter((job) => job.jobId === options.jobId);
    return filtered;
  }
}
