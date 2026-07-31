import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';

const output = path.resolve(process.argv[2] ?? './input/models.sample.xlsx');
fs.mkdirSync(path.dirname(output), { recursive: true });
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{
  'Job ID': 'JOB-001',
  'Model Number': 'P72176-B21',
  'Solution Name': 'DL360 Gen12 sample',
  'Quotation Mode': 'aaS',
  Processor: 'P73829-B21',
  'Processor Qty': 2,
  Memory: 'P69727-B21',
  'Memory Qty': 4,
  'Smart Chassis Product': 'Automatic',
  'Smart Chassis Qty': 0,
  'Chassis Config': 'Config # 3-38',
  'Power Supply': 'P44712-B21',
  'Power Qty': 1,
  Service: 'Default',
  'Generate End BOM': 'Yes',
  Enabled: 'Yes',
}]), 'Models');
XLSX.writeFile(workbook, output);
console.log(`Sample workbook created: ${output}`);
