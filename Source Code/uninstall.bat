@echo off
rem Stops the MSI Thin Board helper and removes it from Windows startup.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0helper\install.ps1" -Uninstall
pause
