@echo off
echo ==========================================
echo   AOD Tracker - Clinic Server
echo ==========================================
echo.

REM Change to script directory
cd /d "%~dp0"

REM Check if Node.js is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js is not installed!
    echo Please download and install from: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

REM Set environment variables
set PORT=8080
set NODE_ENV=production
set SERVE_FRONTEND=1
set DB_PATH=./server/database/app.db

REM Check for custom admin password
if exist .env (
    echo Loading environment from .env file...
    for /f "tokens=*" %%a in (.env) do (
        echo %%a | findstr /b "ADMIN_PASSWORD" >nul && set %%a
    )
)

if not defined ADMIN_PASSWORD (
    echo WARNING: Using default admin password!
    echo Please set ADMIN_PASSWORD in .env file for security.
    set ADMIN_PASSWORD=admin123
)

echo.
echo Starting AOD Tracker Server...
echo Port: %PORT%
echo Database: %DB_PATH%
echo.
echo Access the application at:
echo   http://localhost:%PORT%
echo   http://%COMPUTERNAME%:%PORT%
echo.
echo Press Ctrl+C to stop the server
echo ==========================================
echo.

node server/index.js

if errorlevel 1 (
    echo.
    echo Server stopped with error.
    pause
)
