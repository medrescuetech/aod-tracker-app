@echo off
chcp 65001 >nul
title Clinic Tracker - Server Only

echo ========================================
echo  Clinic Tracker - Server (No Controller)
echo ========================================
echo.
echo Server will start on http://localhost:8080
echo.
echo Building frontend first...
echo.

cd /d "%~dp0"
call npm run build

if errorlevel 1 (
    echo.
    echo Build failed! Press any key to exit...
    pause >nul
    exit /b 1
)

echo.
echo Starting server...
echo.

node server/index.js

pause
