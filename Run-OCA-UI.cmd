@echo off
setlocal
cd /d "%~dp0"

set "OCA_UI_RUNNER=%~dp0scripts\Run-OCA-UI.ps1"
if not exist "%OCA_UI_RUNNER%" (
  echo [ERROR] The OCA UI PowerShell launcher was not found:
  echo %OCA_UI_RUNNER%
  echo.
  echo Extract the complete project folder before running this file.
  echo Run-OCA-UI.cmd and the scripts folder must remain together.
  pause
  exit /b 1
)

where powershell.exe >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Windows PowerShell was not found.
  echo Install PowerShell or ask IT for help.
  pause
  exit /b 1
)

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%OCA_UI_RUNNER%"
set "OCA_UI_EXIT=%ERRORLEVEL%"

echo.
if not "%OCA_UI_EXIT%"=="0" echo OCA UI launcher finished with exit code %OCA_UI_EXIT%.
pause
exit /b %OCA_UI_EXIT%
