@echo off
rem Builds MSI-Thin-Board.zip for a GitHub release: LivelyInfo.json sits at the root of the zip, which is what Lively needs
rem (GitHub's own "Download ZIP" wraps everything in a sub-folder that Lively cannot import). Uses the last commit.
cd /d "%~dp0..\.."
git archive --format=zip -o "%~dp0..\..\MSI-Thin-Board.zip" "HEAD:Source Code"
if errorlevel 1 (echo Failed - commit your changes first.) else (echo Created MSI-Thin-Board.zip - attach it to the GitHub release.)
pause
