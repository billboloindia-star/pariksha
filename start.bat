@echo off
title RRB PO exam app
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js is not installed on this computer.
  echo   Install the LTS version from https://nodejs.org
  echo   then double-click this file again.
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo.
  echo   First run - installing dependencies. This takes a minute or two.
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo   npm install failed. Check your internet connection and try again.
    pause
    exit /b 1
  )
)

echo.
echo   Starting the app - your browser will open in a few seconds.
echo   Keep this window open while you use it. Press Ctrl+C to stop.
echo.
start "" cmd /c "timeout /t 5 >nul & start http://localhost:5173"
call npm run dev
pause
