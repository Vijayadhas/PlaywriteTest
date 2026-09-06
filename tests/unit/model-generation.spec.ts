import { expect, test } from '@playwright/test';
import { detectServerFamily, detectServerGeneration } from '../../src/automation/model-search';

test('detects Gen12 and Gen11 from model search descriptions', () => {
  expect(detectServerGeneration('HPE ProLiant Compute DL360 Gen12 CTO Server')).toBe(12);
  expect(detectServerGeneration('HPE ProLiant DL380 Gen 11 CTO Server')).toBe(11);
  expect(detectServerGeneration('HPE ProLiant Generation-11 CTO Server')).toBe(11);
});

test('does not guess a generation when the description does not contain one', () => {
  expect(detectServerGeneration('HPE CTO Base Model')).toBe('unknown');
});

test('detects supported server families from the exact model description', () => {
  expect(detectServerFamily('HPE ProLiant Compute DL360 Gen12 CTO Server')).toBe('DL360');
  expect(detectServerFamily('HPE ProLiant DL380 Gen12 CTO Server')).toBe('DL380');
  expect(detectServerFamily('HPE ProLiant ML350 Gen12 CTO Server')).toBe('ML350');
  expect(detectServerFamily('HPE CTO Base Model')).toBe('unknown');
});
