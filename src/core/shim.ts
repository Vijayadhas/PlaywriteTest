import { type Page } from '@playwright/test';

export async function installOcaShim(page: Page) {
  await page.addInitScript(() => {
    const patchActivateTab = () => {
      const win = window as typeof window & { activateTab?: unknown };
      if (typeof win.activateTab !== 'function' || (win.activateTab as { __ocaPatched?: boolean }).__ocaPatched) {
        return;
      }
      const original = win.activateTab as (...args: unknown[]) => unknown;
      const patched = function activateTabPatch(this: unknown, tab: { id?: unknown } | undefined) {
        if (!tab || typeof tab !== 'object' || tab.id == null) {
          console.log('[oca-shim] activateTab skipped invalid tab', tab);
          return undefined;
        }
        return original.apply(this, arguments as unknown as Parameters<typeof original>);
      };
      (patched as { __ocaPatched?: boolean }).__ocaPatched = true;
      win.activateTab = patched;
    };
    window.addEventListener(
      'error',
      (event) => {
        if (/activateTab.*undefined.*id|Cannot read properties of undefined \(reading 'id'\)/i.test(event.message)) {
          console.log('[oca-shim] Suppressed activateTab id error');
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      },
      true,
    );
    patchActivateTab();
    window.setInterval(patchActivateTab, 250);
  });
}
