@echo off
chcp 65001 >nul
title Clinic Tracker - Dev Mode

echo ========================================
echo  Clinic Tracker - Hot Reload Dev Mode
echo ========================================
echo.
echo Opening two windows:
echo   - Frontend: http://localhost:5173
echo   - Backend:  http://localhost:8080
echo.

cd /d "%~dp0"

:: Start backend in new window
start "Clinic Tracker Server" cmd /c "title Server && node server/index.js && pause"

:: Start frontend dev server
start "Clinic Tracker Frontend" cmd /c "title Frontend Dev && npm run dev"

echo.
echo Both servers starting in separate windows...
echo.
echo Frontend:  http://localhost:5173
echo Backend:   http://localhost:8080
echo.

timeout /t 3 /nobreak >nul

:: Try to open browser
start http://localhost:5173

echo Press any key to close this window (servers will keep running)...
pause >nul
