# OCA Automation Tool

Production-oriented, data-driven Playwright automation for HPE One Config Advanced. The CLI reads
enabled jobs and component instructions from Excel, reuses one authenticated persistent Chromium
session, processes each job independently, and writes every result immediately to a new workbook.

The original working Playwright tests remain unchanged under `tests/` and can still be run separately.

## Install and verify

```bash
npm install
npm run typecheck
npm run test:unit
```

The unit test command does not connect to OCA. The production OCA workflow is never run by local
verification commands.

## Create a sample input

```bash
npm run sample:excel
```

This creates `input/models.sample.xlsx` with one business-friendly `Models` worksheet. Copy it before
adding real job data if you want to preserve the example.

### Recommended single-sheet columns

`Job ID`, `Model Number`, `Solution Name`, `Quotation Mode`, `Processor`, `Processor Qty`, `Memory`,
`Memory Qty`, `Smart Chassis Product`, `Smart Chassis Qty`, `Chassis Config`, `Power Supply`,
`Power Qty`, `Service`, `Generate End BOM`, `Enabled`

Use `Default` when OCA should retain its default selection. Use `Automatic` for an automatically
managed Smart Chassis choice. Quotation Mode must be `aaS`. If Job ID is blank, the tool assigns
`ROW-<worksheet-row>`.

Only components with a non-default product value are modified. Quantities are verified against the
visible committed OCA row after recalculation.

### Optional advanced Components sheet

For models that need additional or repeated component instructions, add a `Components` worksheet
with these columns:

`Job ID`, `Section`, `Product Number`, `Description`, `Quantity`, `Selection Type`,
`Configuration Text`, `Sequence`

When this worksheet exists, it becomes the component source and the `Models` worksheet only supplies
job-level fields. Supported selection types are `radio`, `quantity`, `checkbox`, `configuration`, `automatic`, and
`default`. Selectors do not belong in Excel. Products are found from the visible section and exact
product number, with optional description disambiguation.

`automatic` verifies OCA's committed quantity without modifying it. This is mandatory for the known
`P74787-B21` processor dependency.

## Run

```bash
npm run oca -- --input ./input/models.xlsx --output ./output --headed --trace
```

Optional flags:

- `--profile <path>` — persistent Chromium profile (default `./.oca-profile`)
- `--start-row <n>` — start at a Models sheet row, including the header as row 1
- `--job-id <id>` — run one job
- `--retry-failed` — run only jobs previously recorded as Failed or Unsupported
- `--trace` — retain Playwright traces for failed jobs
- `--headless` — available for future unattended environments; headed is the default

Manual authentication is allowed once when the shared browser opens. Configure the environment with:

```text
OCA_BASE_URL
OCA_AUTH_WAIT_MS
OCA_PROFILE_DIR
OCA_ACTION_TIMEOUT_MS
OCA_NAVIGATION_TIMEOUT_MS
OCA_EXPECTED_PAGE_TEXT
```

Do not put credentials in the workbook.

## Results and recovery

The CLI creates `<input-name>-results.xlsx` in the output directory, never overwriting the input.
It contains `Results` and `Summary` sheets. Each job is flushed immediately. Existing successful jobs
are skipped on a normal resume; `--retry-failed` selects only failed or unsupported prior jobs.

Failure artifacts are stored under `output/screenshots`, `output/traces`, and `output/logs`. SIGINT or
SIGTERM requests a graceful stop after the current job. One failed job does not stop the remaining batch.

## Architecture and migration notes

- `src/app` — CLI argument parsing
- `src/automation` — session, search, generic engine, billing, save, and End BOM flows
- `src/components` — radio, quantity, configuration, and automatic-dependency behavior
- `src/exceptions` — small registry for genuinely unusual interactions
- `src/excel` — strict input parsing/validation and incremental output writing
- `src/reporting` — JSONL logs, screenshots, and traces
- `src/models` — job, instruction, source, and result contracts

The persistent browser/manual authentication, overlay waits, exact CTO-card selection, stable row
quantity verification, save acknowledgement, and End BOM UCID extraction are derived from the proven
existing page/test logic. Model data now lives in Excel rather than complete per-model classes.

Known special behavior stays isolated: `P72221-B21` uses its Smart Chassis handler and asserts that
`P72227-B21` is not selected; `P74787-B21` is verification-only. Add future exceptions by implementing
`ComponentExceptionHandler` and registering the handler, without adding model-number switches to the
generic engine.

Reference-based sources (UCID, BOM, Smart Template, API, or database) are represented in the typed job
model but intentionally not executed in this Excel-detailed MVP.

## Legacy Playwright tests

```bash
npx playwright test
npx playwright test tests/oca-config2-P72176-B21-fresh-recording.spec.ts --headed
```

These commands require live OCA access and manual authentication. Do not run them against production
without explicit confirmation.
