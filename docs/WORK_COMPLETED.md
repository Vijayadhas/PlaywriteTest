# OCA Automation — Work Completed

**Project:** Excel-driven Playwright automation for HPE One Config Advanced (OCA)  
**Status date:** 1 September 2026  
**Current state:** Implementation and offline unit validation completed; a controlled live OCA trial is still required.

## Objective

The project automates OCA model configuration from an Excel workbook. It processes enabled jobs one at a time, reuses an authenticated Chromium profile, saves results immediately to a separate workbook, and retains diagnostic evidence when a job fails.

## Work completed

### Core automation workflow

- Built a command-line workflow that reads jobs and component instructions from Excel.
- Added persistent Chromium sessions so manual authentication can be reused.
- Added exact model search and opening of the matching CTO card.
- Added `aaS` quotation-mode selection and verification.
- Added sequential job processing with failure isolation, resume support, job filtering, and failed-job retry.
- Added graceful stop handling and optional Playwright traces.

### Component configuration

- Implemented reusable handlers for radio selections, quantities, configurations, checkboxes, defaults, and automatic dependencies.
- Added random selection for Processor, Memory, Smart Chassis, and Power Supplies.
- Processor, memory, and power-supply random selections use a quantity of 1 or 2; Smart Chassis uses quantity 1.
- Added stable verification of the quantity committed by OCA after recalculation.
- Preserved special handling for `P72221-B21` and verification-only behavior for the `P74787-B21` automatic dependency.
- Added actual selected products and quantities to the result report.

### Support, save, billing, and BOM flows

- Added random selection of an approved Support Service experience, service term, and data-privacy option.
- Improved the save flow, including required and optional acknowledgement handling and UCID capture.
- Added BOM navigation and selection of `OCA Config 2` for Billing Tier Setup.
- Added End BOM generation, Start/End BOM UCID capture, association, and completion.
- Added capture of Start and End BOM capacity details: billing tier, custom name, allocated memory, server count, and used CPU cores.

### Excel input and reporting

- Supports a simple business-facing `Models` sheet and an optional advanced `Components` sheet.
- Added validation for supported selection types and random-selection sections.
- Creates a new results workbook without overwriting the input workbook.
- Writes each job result immediately for recovery after interruption.
- Produces `Results` and `Summary` sheets, including status, UCIDs, support selections, selected components, BOM association, billing/capacity details, timestamps, retry count, and errors.

### Windows operation

- Added the one-click launcher `Run-OCA.cmd` and PowerShell runner `scripts/Run-OCA.ps1`.
- Added first-run setup for the OCA URL, Excel file, output folder, browser profile, environment, and login wait.
- Stores laptop-specific settings in the Git-ignored `.oca-local.json` file.
- Added launcher options for all enabled jobs, one Job ID, failed jobs, offline unit tests, and settings changes.
- Added `docs/WINDOWS_RUN_GUIDE.md` with setup, execution, validation, retry, and troubleshooting instructions.

### Supporting project structure

- Organized implementation into CLI, automation, components, exceptions, Excel, models, and reporting modules.
- Retained earlier working Playwright scripts in `tests/` and `old Working test classes/` for reference.
- Added a sample workbook generator and `input/models.sample.xlsx`.
- Updated the main `README.md` with installation, input, run, reporting, recovery, and architecture guidance.

## Verification completed

The following offline checks passed on 1 September 2026:

```text
npm run typecheck     PASS
npm run test:unit     PASS — 7 tests
```

The unit tests cover CLI options, Excel input mapping and validation, Excel result writing, billing-tier targeting, and approved Support Service selection.

## Output and diagnostic files

- Results workbook: `<output>/<input-name>-results.xlsx`
- Execution log: `<output>/logs/oca-run.jsonl`
- Failure screenshots: `<output>/screenshots/`
- Retained traces: `<output>/traces/`

## Remaining validation

- Run one approved model in the OCA test/integration environment.
- Manually compare the generated configuration, selected components, quantities, Support Services, Billing Tier Setup, and End BOM association with the results workbook.
- Confirm the persistent Windows browser profile and authentication behavior on the target laptop.
- Only after the one-model comparison succeeds, run an approved multi-row batch.

Live OCA execution was not performed as part of the offline verification because it requires authorized network access, manual authentication, and an approved test model.

## Quick start

On Windows, double-click `Run-OCA.cmd`. For command-line use:

```bash
npm install
npm run typecheck
npm run test:unit
npm run oca -- --input ./input/models.xlsx --output ./output --headed --trace
```

Do not place credentials in Excel or commit the local browser profile or `.oca-local.json`.
