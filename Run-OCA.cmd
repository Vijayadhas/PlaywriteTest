@echo off
setlocal
cd /d "%~dp0"

set "OCA_RUNNER=%~dp0scripts\Run-OCA.ps1"
if not exist "%OCA_RUNNER%" (
  echo [ERROR] The OCA PowerShell runner was not found:
  echo %OCA_RUNNER%
  echo.
  echo Do not run Run-OCA.cmd from inside the ZIP preview and do not copy only this CMD file.
  echo Right-click the downloaded ZIP, choose "Extract All", then open the extracted project folder.
  echo The extracted folder must contain Run-OCA.cmd and the scripts folder together.
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

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%OCA_RUNNER%"
set "OCA_EXIT=%ERRORLEVEL%"

echo.
if not "%OCA_EXIT%"=="0" echo OCA launcher finished with exit code %OCA_EXIT%.
pause
exit /b %OCA_EXIT%
