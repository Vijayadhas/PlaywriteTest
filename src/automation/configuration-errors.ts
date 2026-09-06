import type { Page } from '@playwright/test';
import type { ComponentEngine } from './component-engine';
import { waitForBlockingOverlay } from '../core/waits';

export async function resolveConfigurationErrors(page: Page, components: Pick<ComponentEngine, 'satisfyRequiredSection' | 'satisfyVisibleRequiredControl'>): Promise<void> {
  const errorIcons = page.locator([
    '[title="Error" i]',
    '[aria-label="Error" i]',
    '.dqe-status-icon-14',
  ].join(', ')).filter({ visible: true });

  for (let attempt = 1; attempt <= 12; attempt += 1) {
    await waitForBlockingOverlay(page);
    if (await errorIcons.count() === 0) {
      console.log('[STEP] Configuration validation passed: no error icons remain');
      return;
    }

    const icon = errorIcons.first();
    const header = icon.locator('xpath=ancestor::*[contains(@id,"section_header") or contains(concat(" ", normalize-space(@class), " "), " section_header ")][1]');
    if (await header.count()) {
      const sectionName = await header.evaluate((element) => {
        const copy = element.cloneNode(true) as HTMLElement;
        copy.querySelectorAll('i, [title="Error" i], [aria-label="Error" i], .dqe-status-icon-14, .section_counter, .section_toggle').forEach((node) => node.remove());
        return (copy.textContent ?? '').replace(/\s+/g, ' ').trim();
      });
      if (!sectionName) throw new Error('OCA reported an error icon on an unnamed Menu section');
      console.log(`[WARN] Required selection is missing in ${sectionName}; resolving it before Services`);
      await components.satisfyRequiredSection(sectionName);
    } else {
      console.log('[WARN] Required selection is missing outside a Menu section; resolving the visible control');
      if (!await components.satisfyVisibleRequiredControl()) break;
    }
  }

  await waitForBlockingOverlay(page);
  if (await errorIcons.count() === 0) return;
  const unresolved = await errorIcons.evaluateAll((icons) => [...new Set(icons.map((icon) => {
    const header = icon.closest<HTMLElement>('[id*="section_header"], .section_header');
    return (header?.innerText || icon.getAttribute('title') || 'Unknown section').replace(/\s+/g, ' ').trim();
  }))]);
  throw new Error(`Cannot continue to Services while OCA error icons remain: ${unresolved.join('; ')}`);
}

