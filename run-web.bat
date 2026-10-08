@echo off
rem One-click launcher for Manuscript (web mode).
rem Installs dependencies and builds when needed, starts the local server and opens your browser.
setlocal
title Manuscript
cd /d "%~dp0"
rem Use UTF-8 so file paths and messages with accents or symbols display correctly.
chcp 65001 >nul

where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo  Manuscript needs Node.js 24 or newer.
  echo  Install it from https://nodejs.org/ and then run this file again.
  echo.
  pause
  exit /b 1
)

node scripts\run-web.mjs %*
set "EXITCODE=%ERRORLEVEL%"
if not "%EXITCODE%"=="0" (
  echo.
  echo  Manuscript stopped with an error ^(exit code %EXITCODE%^). See the messages above.
  echo.
  pause
)
exit /b %EXITCODE%
