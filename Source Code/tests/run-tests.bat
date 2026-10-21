@echo off
rem Runs every test (see run-tests.ps1). Changes nothing outside a temp folder.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run-tests.ps1"
pause
