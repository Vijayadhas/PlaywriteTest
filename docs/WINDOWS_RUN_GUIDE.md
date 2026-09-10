# OCA Automation Tool — Windows Run Guide

## Purpose

This guide explains how to run the OCA Automation Tool on Windows after the repository has been cloned, dependencies installed, and local verification completed.

The following setup steps are assumed to be complete:

- Node.js and Git are installed.
- The `PlaywriteTest` repository is cloned.
- `npm install`, Playwright browser installation, linting, type checking, and unit tests have completed successfully.

> Run the first automation trial with one approved model in the OCA test/integration environment. Do not start a large production batch until the result has been manually verified.

## Recommended — one-click launcher

For the web interface, double-click `Run-OCA-UI.cmd`. On its first run, enter the OCA URL, browser
profile, and login wait when prompted. It installs missing packages and Chromium, starts the local
dashboard, and opens `http://localhost:4173` automatically. Import Excel or enter models manually in
the browser, then click **Start automation**. Keep the launcher window open for the entire run.

The existing `Run-OCA.cmd` remains available for the command-line menu workflow described below.

1. Install the Node.js LTS release if it is not already installed.
2. If the project was downloaded as a ZIP, right-click it and choose **Extract All**. Do not open or run files directly inside the ZIP preview.
3. Open the complete extracted project folder in File Explorer. Confirm that `Run-OCA.cmd` and the `scripts` folder are both present.
4. Double-click `Run-OCA.cmd`.
5. On the first run, enter the OCA URL and Excel path. Press Enter to accept each displayed default.
6. Choose `2` to run one approved Job ID first. After verification, choose `1` for all enabled rows.

Windows may temporarily copy only `Run-OCA.cmd` when it is launched from a ZIP preview. In that case,
`scripts\Run-OCA.ps1` will be missing and PowerShell cannot start. Always extract the entire project
first; copying only the CMD file is not sufficient.

The launcher works when the project is located at
`D:\KES Doc new\EndBOM\PlaywriteTest-main\PlaywriteTest-main`; it does not hard-code that path.
Laptop-specific values are saved in `.oca-local.json` and are not committed to Git. Choose option
`5` whenever the URL, environment, or Excel file changes. The manual steps below remain useful for
troubleshooting or command-line operation.

## Step 4 — Prepare the Excel input

The sample input is available at:

```text
C:\workspace\PlaywriteTest\input\models.sample.xlsx
```

Create a working copy so that the original sample remains available:

```powershell
Copy-Item ".\input\models.sample.xlsx" ".\input\models.xlsx"
```

Open `input\models.xlsx` in Microsoft Excel and enter or verify these columns:

| Column | Description |
|---|---|
| Job ID | Unique identifier for the row, for example `JOB-001` |
| Model Number | Exact OCA model number |
| Solution Name | Optional business description |
| Solution | `Yes` for the Solution Wizard flow; `No` or blank for the normal Menu flow (`Solutions` is also accepted) |
| Quotation Mode | Must be `aaS` |
| Processor | Processor product number or `Default` |
| Processor Qty | Required processor quantity |
| Memory | Memory product number or `Default` |
| Memory Qty | Required memory quantity |
| Smart Chassis Product | Product/configuration value, `Default`, or `Automatic` |
| Smart Chassis Qty | Required Smart Chassis quantity |
| Chassis Config | Required configuration text or `Default` |
| Power Supply | Power-supply product number or `Default` |
| Power Qty | Required power-supply quantity |
| Service | Required service type, such as `Default` or `Lite` |
| Generate End BOM | `Yes` or `No` |
| Enabled | `Yes` to process the row; `No` to skip it |

Important rules:

- Use exact OCA product numbers and visible configuration names.
- Do not put Playwright selectors or passwords in Excel.
- Use a unique Job ID for every row.
- Keep Quotation Mode set to `aaS`.
- Close the workbook in Excel before starting automation. Excel may lock the file while it is open.

## Step 5 — Configure the Windows environment

Open PowerShell in the project directory:

```powershell
cd C:\workspace\PlaywriteTest
```

Set the OCA URL, authentication window, and persistent browser-profile folder:

```powershell
$env:OCA_BASE_URL = "https://ngc-itg-oca-internal.its.hpecorp.net/ocaPreForkM1/OCAInternalLogin"
$env:OCA_AUTH_WAIT_MS = "60000"
$env:OCA_PROFILE_DIR = "C:\oca-automation\browser-profile"
```

Notes:

- `OCA_AUTH_WAIT_MS=60000` provides a 60-second manual-login window.
- Increase it if authentication normally takes longer.
- The browser-profile folder preserves the authenticated session.
- Do not share, commit, or copy the browser-profile folder because it can contain session data.
- Do not delete the profile between normal runs. Delete it only when login recovery is required.
- Connect to the required HPE network or VPN before running the tool.

These environment variables apply to the current PowerShell window. Set them again when using a new window.

## Step 6 — Run one approved job

Start with one Excel job:

```powershell
npm run oca -- `
  --input ".\input\models.xlsx" `
  --output ".\output" `
  --profile "C:\oca-automation\browser-profile" `
  --job-id "JOB-001" `
  --headed `
  --trace
```

The same command on one line is:

```powershell
npm run oca -- --input ".\input\models.xlsx" --output ".\output" --profile "C:\oca-automation\browser-profile" --job-id "JOB-001" --headed --trace
```

When Chromium opens:

1. Complete manual authentication if requested.
2. Leave the Chromium window open.
3. Allow the automation to continue after login.
4. Do not click or type in the OCA window while a model is running.
5. Monitor the PowerShell progress messages.

The launcher disables classic Command Prompt QuickEdit mode where Windows permits it. Without this
protection, clicking or selecting text in the console can pause the entire automation process. If a
console ever shows a selection highlight and appears frozen, press `Esc` or `Enter` to resume it.

Example progress:

```text
[1/1] P72176-B21 - Running
[1/1] P72176-B21 - Success - UCID12345
```

To request a graceful stop, press `Ctrl+C` once. The tool will finish the current model before stopping where possible.

## Step 7 — Verify the result

The output workbook is created without overwriting the input:

```text
output\models-results.xlsx
```

Open the output workbook and check the `Results` sheet:

- Execution Status is `Success`.
- UCID is populated.
- Quotation Mode is `aaS`.
- OCA Config Status confirms the save.
- End BOM Status confirms generation and association when requested.
- End BOM ID is populated when End BOM was requested.
- Error Step and Error Message are empty for successful jobs.

Also check the `Summary` sheet for total, successful, failed, skipped, unsupported, and End BOM counts.

Manually open the created OCA configuration and confirm:

- Correct model
- Processor and quantity
- Memory and quantity
- Smart Chassis product and configuration
- Power supply and quantity
- Service type
- Billing Tier Setup
- End BOM association

Do not approve the tool for batch execution until this comparison is successful.

## Step 8 — Review failure evidence

If a model fails, check:

```text
output\models-results.xlsx
output\logs\oca-run.jsonl
output\screenshots\
output\traces\
```

The report provides the failing automation step and error message. Screenshots show the visible OCA state at failure. A retained trace can be opened with:

```powershell
npx playwright show-trace ".\output\traces\<trace-file>.zip"
```

Replace `<trace-file>` with the actual ZIP filename.

## Step 9 — Retry failed jobs

After correcting the input or resolving the OCA issue, retry only failed or unsupported results:

```powershell
npm run oca -- --input ".\input\models.xlsx" --output ".\output" --profile "C:\oca-automation\browser-profile" --retry-failed --headed --trace
```

The tool uses the existing output workbook to identify retry candidates. Keep the same input filename and output folder when using `--retry-failed`.

## Step 10 — Run an approved batch

After one-job validation, enable the approved rows in Excel and run without `--job-id`:

```powershell
npm run oca -- --input ".\input\models.xlsx" --output ".\output" --profile "C:\oca-automation\browser-profile" --headed --trace
```

Jobs are processed sequentially. A failed model is recorded and the tool continues with the remaining enabled rows.

On a normal run, every enabled job executes again, including jobs previously recorded as successful in the matching output workbook.

## Common issues

### Browser does not open

Run:

```powershell
npx playwright install chromium
```

Then retry the automation command.

### Login is not completed before automation continues

Increase the authentication window:

```powershell
$env:OCA_AUTH_WAIT_MS = "120000"
```

This allows two minutes for authentication.

### Excel file is locked

Close the input and result workbooks in Microsoft Excel, then retry.

### Authentication session is invalid

Close all Chromium instances using the automation profile. Rename the existing profile instead of deleting it immediately:

```powershell
Rename-Item "C:\oca-automation\browser-profile" "browser-profile-backup"
```

Run the tool again and complete a fresh login. The old profile remains recoverable as the backup folder.

### One product or quantity cannot be selected

Check the failure screenshot, trace, Error Step, and Error Message. Confirm that the Excel value exactly matches the product/configuration visible in OCA. Do not repeatedly retry an incorrect input.

## Execution safety

- Begin with the OCA test/integration environment.
- Use only approved model and component combinations.
- Do not store credentials in Excel, source code, logs, or screenshots.
- Do not interact with the browser during active automation.
- Do not run multiple tool instances with the same browser profile.
- Review the output workbook after every trial run.
- Obtain explicit approval before running a large production batch.
