@echo off
echo ==========================================
echo   AOD Tracker - Create Shortcuts
echo ==========================================
echo.

cd /d "%~dp0"

echo Creating shortcuts...
cscript //nologo create-shortcut.vbs

if errorlevel 1 (
    echo.
    echo Failed to create shortcuts.
    pause
    exit /b 1
)

echo.
echo Done! Check your Desktop for "AOD Tracker Server" shortcut.
echo.
pause
