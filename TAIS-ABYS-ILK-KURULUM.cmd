@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%scripts\windows\first-setup.ps1"
set "EXIT_CODE=%ERRORLEVEL%"
echo.
if not "%EXIT_CODE%"=="0" echo Kurulum basarisiz oldu. Yukaridaki adim ve log bilgisini kontrol edin.
pause
exit /b %EXIT_CODE%
