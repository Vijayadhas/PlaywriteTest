import { test, expect } from '@playwright/test';
import { BOM_CONFIG_NAME } from '../../src/automation/billing-tier';

test('targets OCA Config 2 in the BOM workflow', () => {
  expect(BOM_CONFIG_NAME).toBe('OCA Config 2');
});
