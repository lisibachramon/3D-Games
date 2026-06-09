@echo off
REM FLOTSAM launcher for Windows. Double-click this file.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install it from https://nodejs.org ^(LTS^) and try again.
  pause
  exit /b 1
)
if not exist node_modules (
  echo First run: installing dependencies...
  call npm install --omit=dev
)
if "%PORT%"=="" set PORT=8080
echo.
echo   FLOTSAM is starting on http://localhost:%PORT%
echo   Play with friends: share your LAN IPv4 address (run: ipconfig) as http://YOUR.IP:%PORT%
echo.
start "" "http://localhost:%PORT%"
call npm start
pause
