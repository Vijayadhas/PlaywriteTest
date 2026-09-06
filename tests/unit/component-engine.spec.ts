import { expect, test } from '@playwright/test';
import { isMemoryBlankProduct } from '../../src/automation/component-engine';

test('distinguishes memory blank kits from usable memory products', () => {
  expect(isMemoryBlankProduct('HPE ProLiant Compute Gen12 Memory Blank Kit')).toBe(true);
  expect(isMemoryBlankProduct('Memory Blank')).toBe(true);
  expect(isMemoryBlankProduct('HPE 32GB DDR5 Registered Smart Memory Kit')).toBe(false);
});
