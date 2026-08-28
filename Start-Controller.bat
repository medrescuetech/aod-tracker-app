@echo off
chcp 65001 >nul
title Clinic Tracker - Dev Controller

echo ========================================
echo  Clinic Tracker - Development Controller
echo ========================================
echo.
echo Building frontend...
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
echo Starting Controller...
echo.

cd controller
call npm start

pause
