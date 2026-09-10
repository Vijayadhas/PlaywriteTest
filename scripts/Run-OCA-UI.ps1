[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$ConfigPath = Join-Path $ProjectRoot '.oca-local.json'
$SetupMarkerPath = Join-Path $ProjectRoot '.oca-setup-complete'
$PackageLockPath = Join-Path $ProjectRoot 'package-lock.json'
$UiProcess = $null

function Read-WithDefault {
    param([string]$Prompt, [string]$Default)
    $value = Read-Host "$Prompt [$Default]"
    if ([string]::IsNullOrWhiteSpace($value)) { return $Default }
    return $value.Trim().Trim('"')
}

function Resolve-ProjectPath {
    param([string]$Value)
    if ([System.IO.Path]::IsPathRooted($Value)) {
        return [System.IO.Path]::GetFullPath($Value)
    }
    return [System.IO.Path]::GetFullPath((Join-Path $ProjectRoot $Value))
}

function New-UiConfiguration {
    Write-Host ''
    Write-Host 'OCA UI first-time configuration' -ForegroundColor Cyan
    Write-Host 'These settings are saved only on this laptop.'
    $environmentName = Read-WithDefault 'Environment name' 'Integration'
    $baseUrl = Read-WithDefault 'OCA login URL' 'https://ngc-itg-oca-internal.its.hpecorp.net/ocaPreForkM1/OCAInternalLogin'
    $profileInput = Read-WithDefault 'Browser profile folder' '.oca-profile'
    $authWait = Read-WithDefault 'Manual login wait in seconds' '120'
    $seconds = 0
    if (-not [int]::TryParse($authWait, [ref]$seconds) -or $seconds -lt 10) {
        throw 'Manual login wait must be a whole number of at least 10 seconds.'
    }
    $settings = [ordered]@{
        environmentName = $environmentName
        baseUrl = $baseUrl
        excelPath = Resolve-ProjectPath 'input\models.xlsx'
        outputPath = Resolve-ProjectPath 'output'
        profilePath = Resolve-ProjectPath $profileInput
        authWaitMs = $seconds * 1000
    }
    $settings | ConvertTo-Json | Set-Content -LiteralPath $ConfigPath -Encoding UTF8
    return [pscustomobject]$settings
}

function Get-UiConfiguration {
    if (-not (Test-Path -LiteralPath $ConfigPath)) { return New-UiConfiguration }
    try {
        return Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
    } catch {
        throw "Cannot read $ConfigPath. Delete it and run this launcher again. $($_.Exception.Message)"
    }
}

function Confirm-Prerequisites {
    if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) {
        throw 'Node.js is not installed or is not on PATH. Install Node.js LTS, then run this launcher again.'
    }
    if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
        throw 'npm is not available on PATH. Reinstall Node.js LTS, then run this launcher again.'
    }

    $expressPath = Join-Path $ProjectRoot 'node_modules\express\package.json'
    $installPackages = -not (Test-Path -LiteralPath $expressPath)
    if (-not $installPackages -and (Test-Path -LiteralPath $SetupMarkerPath) -and (Test-Path -LiteralPath $PackageLockPath)) {
        $installPackages = (Get-Item -LiteralPath $PackageLockPath).LastWriteTimeUtc -gt (Get-Item -LiteralPath $SetupMarkerPath).LastWriteTimeUtc
    }
    if ($installPackages) {
        Write-Host 'Installing or updating project packages...' -ForegroundColor Yellow
        & npm.cmd ci
        if ($LASTEXITCODE -ne 0) { throw "npm install failed with exit code $LASTEXITCODE." }
    }
    if (-not (Test-Path -LiteralPath $SetupMarkerPath)) {
        Write-Host 'Installing the Playwright Chromium browser (first run only)...' -ForegroundColor Yellow
        & npx.cmd playwright install chromium
        if ($LASTEXITCODE -ne 0) { throw "Playwright browser installation failed with exit code $LASTEXITCODE." }
    }
    Set-Content -LiteralPath $SetupMarkerPath -Value 'Setup completed successfully.' -Encoding ASCII
}

try {
    Set-Location -LiteralPath $ProjectRoot
    Confirm-Prerequisites
    $settings = Get-UiConfiguration
    $env:OCA_BASE_URL = [string]$settings.baseUrl
    $env:OCA_AUTH_WAIT_MS = [string]$settings.authWaitMs
    $env:OCA_PROFILE_DIR = [string]$settings.profilePath
    if ([string]::IsNullOrWhiteSpace($env:OCA_UI_PORT)) { $env:OCA_UI_PORT = '4173' }
    New-Item -ItemType Directory -Force -Path ([string]$settings.profilePath) | Out-Null

    $url = "http://localhost:$($env:OCA_UI_PORT)"
    Write-Host ''
    Write-Host '=== OCA Control Center ===' -ForegroundColor Cyan
    Write-Host "Environment: $($settings.environmentName)"
    Write-Host "Dashboard:   $url"
    Write-Host 'Keep this window open while using the dashboard.' -ForegroundColor Yellow
    Write-Host 'Press Ctrl+C here to stop the UI server.' -ForegroundColor DarkGray
    Write-Host ''

    $UiProcess = Start-Process -FilePath 'npm.cmd' -ArgumentList @('run', 'ui') -WorkingDirectory $ProjectRoot -NoNewWindow -PassThru
    $ready = $false
    for ($attempt = 0; $attempt -lt 40; $attempt++) {
        if ($UiProcess.HasExited) { throw "The UI server stopped with exit code $($UiProcess.ExitCode)." }
        try {
            $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 1
            if ($response.StatusCode -eq 200) { $ready = $true; break }
        } catch { Start-Sleep -Milliseconds 500 }
    }
    if (-not $ready) { throw "The UI server did not become available at $url." }
    Start-Process $url
    Write-Host "OCA Control Center opened in your browser: $url" -ForegroundColor Green
    $UiProcess.WaitForExit()
    exit $UiProcess.ExitCode
} catch {
    Write-Host ''
    Write-Host "[ERROR] $($_.Exception.Message)" -ForegroundColor Red
    exit 1
} finally {
    if ($null -ne $UiProcess -and -not $UiProcess.HasExited) {
        Stop-Process -Id $UiProcess.Id -Force -ErrorAction SilentlyContinue
    }
}
