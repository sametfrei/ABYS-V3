@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%scripts\windows\reset-tais.ps1"
set "EXIT_CODE=%ERRORLEVEL%"
pause
exit /b %EXIT_CODE%
