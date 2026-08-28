@echo off
echo ==========================================
echo   AOD Tracker - Build EXE Launcher
echo ==========================================
echo.

cd /d "%~dp0"

echo Step 1: Checking prerequisites...

REM Check Node.js
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js is not installed!
    echo Please install from https://nodejs.org/
    pause
    exit /b 1
)

echo [OK] Node.js found

REM Check if parent directory has the app
if not exist "..\server\index.js" (
    echo ERROR: Could not find server\index.js in parent directory!
    echo Please ensure electron-launcher is in the AOD Tracker folder.
    pause
    exit /b 1
)

echo [OK] Application found

echo.
echo Step 2: Installing dependencies...
call npm install
if errorlevel 1 (
    echo ERROR: npm install failed
    pause
    exit /b 1
)

echo.
echo Step 3: Building Windows Installer (fastest for daily use)...
echo.
echo Note: Building may take 2-5 minutes...
call npm run build
if errorlevel 1 (
    echo ERROR: Build failed
    pause
    exit /b 1
)

echo.
echo ==========================================
echo   Build Complete!
echo ==========================================
echo.
echo Your installer is located at:
echo   electron-launcher\dist\AOD Tracker Server Setup.exe
echo.
echo Installation:
echo 1. Copy "AOD Tracker Server Setup.exe" to clinic PC
echo 2. Double-click to install
echo 3. Creates Desktop + Start Menu shortcuts
echo 4. Optional: Auto-start on Windows boot
echo.
echo Benefits:
echo - Installs once, runs fast (no unpacking!)
echo - Professional Windows application
echo - System tray integration
echo - Easy to uninstall if needed
echo.
echo Portable version (for USB):
echo   Run: npm run pack
echo.
pause
