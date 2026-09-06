import { test, expect } from '@playwright/test';
import { ALLOWED_SERVICE_EXPERIENCE_VALUES } from '../../src/automation/support-services';

test('restricts random Support Service experience to approved values', () => {
  expect([...ALLOWED_SERVICE_EXPERIENCE_VALUES]).toEqual(['MBYS', 'Entry', 'Standard', 'Custom']);
});
