@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install Node.js 22 LTS from https://nodejs.org, then run this file again.
  pause
  exit /b 1
)
node "%~dp0serve.mjs" %*
if errorlevel 1 pause
