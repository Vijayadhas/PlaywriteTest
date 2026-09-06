import { expect, test } from '@playwright/test';
import { extractBomUcid } from '../../src/core/excel';

test('extracts Start and End BOM UCIDs from normalized page text', () => {
  expect(extractBomUcid('Start BOM UCID: START_12345', 'Start BOM UCID')).toBe('START_12345');
  expect(extractBomUcid('End BOM UCID  END-67890', 'End BOM UCID')).toBe('END-67890');
});

test('does not return the UCID label itself as its value', () => {
  expect(extractBomUcid('Start BOM UCID', 'Start BOM UCID')).toBe('');
});
