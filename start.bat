@echo off
title Clinic Tracker Server
echo.
echo  =============================================
echo   Clinic Tracker - AOD Testing System
echo  =============================================
echo.

:: Check Node.js
node --version >nul 2>&1
if ERRORLEVEL 1 (
    echo  ERROR: Node.js not found.
    echo  Install from https://nodejs.org or run: winget install OpenJS.NodeJS.LTS
    pause
    exit /b 1
)

:: Install dependencies if needed
if not exist "node_modules" (
    echo  Installing frontend dependencies...
    call npm install
)
if not exist "server\node_modules" (
    echo  Installing server dependencies...
    cd server && call npm install && cd ..
)

:: Build frontend if dist/ is missing
if not exist "dist\index.html" (
    echo  Building frontend...
    call npm run build
    if ERRORLEVEL 1 (
        echo  Build failed!
        pause
        exit /b 1
    )
)

echo.
echo  Starting server...
echo  App: http://localhost:8080
echo  Press Ctrl+C to stop.
echo.

set SERVE_FRONTEND=1
node server/index.js
pause
