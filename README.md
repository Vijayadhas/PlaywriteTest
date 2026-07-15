# OCA Playwright framework

Data-driven Playwright automation for HPE OCA Config 2 model validation. Each model is one small
spec; all UI logic lives once in `src/core` and `src/pages`.

## Layers
- `src/config/env.ts` — env-overridable constants (base URL, waits, profile dir, workbook path).
- `src/core/` — shared, single-definition helpers:
  - `browser.ts` — `launchOcaContext()` persistent headed Chromium.
  - `shim.ts` — `installOcaShim()` activateTab error suppression.
  - `waits.ts` — `waitForBlockingOverlay`, `waitForOcaLoading`, `waitBeforeAction`, `escapeRegex`.
  - `interactions.ts` — `safeClick`, `clickByText`, `clickVisibleText`.
  - `menu-quantity.ts` — the full OCA menu-quantity engine.
  - `excel.ts` — `EndBomResult`, `newResult`, `updateEndBomWorkbook`, `normalizeEndBomHeaders`,
    `readBomUcid`, `getErrorMessage`.
- `src/pages/OcaConfigPage.ts` — high-level page object (open, search/customize, smart chassis,
  `setRowQuantity`, sections, networking, service, billing, save, end-BOM).
- `src/models/` — one `ModelSpec` per model; `index.ts` exports `specs`.
- `tests/oca-config.spec.ts` — loops `specs`, one `test()` each.

## Run
```
npm install
npx playwright test          # needs a live OCA app + manual auth during the auth-wait window
npx playwright test tests/oca-config2-P72176-B21-fresh-recording.spec.ts --headed
npm run typecheck
```

## Add model 3
1. Create `src/models/<model>.ts` exporting a `ModelSpec`: set `name`, `modelNumber`,
   `ctoCardName`, `smartChassisConfigLabel`, `selectedProcessor`, `selectedMemory`, optional
   `navPath` / `networkCard` / `service` / `components`.
2. Implement `run(oca, result)` by composing existing `OcaConfigPage` methods (e.g.
   `searchAndOpenModel`, `selectSmartChassis`, `setRowQuantity`, `configureNetworkingCard`,
   `selectService`, `saveOcaConfig`, `generateAndAssociateEndBom`).
3. Add it to the array in `src/models/index.ts`. No core helper changes needed.
