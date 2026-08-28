@echo off
setlocal EnableDelayedExpansion
echo ==========================================
echo   AOD Tracker - Installation / Upgrade
echo ==========================================
echo.

REM Change to script directory
cd /d "%~dp0"

REM ── Detect upgrade vs fresh install ─────────────────────────────────────────
REM If a database already exists this is an upgrade — use UPDATE.bat instead
if exist "server\database\aod_tracker.db" goto :upgrade
if exist "server\database\app.db"         goto :upgrade
if exist "version.txt"                    goto :upgrade

REM ─────────────────────────────────────────────────────────────────────────────
REM FRESH INSTALL
REM ─────────────────────────────────────────────────────────────────────────────
:fresh
echo  No existing installation detected. Performing fresh install...
echo.

REM Check Node.js
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js is not installed!
    echo.
    echo Please download and install the LTS version from:
    echo   https://nodejs.org/en/download/
    echo.
    start https://nodejs.org/en/download/
    pause
    exit /b 1
)
for /f "tokens=*" %%a in ('node --version') do set NODE_VERSION=%%a
echo  [OK] Node.js %NODE_VERSION%

npm --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: npm is not installed!
    pause
    exit /b 1
)
echo  [OK] npm found

echo.
echo [1/3] Installing dependencies...
call npm install
if errorlevel 1 (
    echo ERROR: npm install failed!
    pause
    exit /b 1
)

REM Server-side deps
if exist "server\package.json" (
    echo  Installing server dependencies...
    cd server
    call npm install
    cd ..
)

REM Save package.json hash so UPDATE.bat can skip reinstall next time
for /f "skip=1 tokens=*" %%h in ('certutil -hashfile package.json MD5 2^>nul') do (
    if not "%%h"=="CertUtil: -hashfile command completed successfully." (
        echo %%h>.last-pkg-hash
        goto :hash_done
    )
)
:hash_done

echo.
echo [2/3] Building application...
call npm run build
if errorlevel 1 (
    echo ERROR: Build failed!
    pause
    exit /b 1
)

echo.
echo [3/3] Writing version info...
REM Read version from package.json (simple extract)
for /f "tokens=2 delims=:, " %%v in ('findstr /i "\"version\"" package.json') do (
    set RAW=%%v
    set VER=!RAW:"=!
    goto :ver_done
)
:ver_done
if not "!VER!"=="" (
    echo !VER!>version.txt
    echo  [OK] Version !VER! recorded
)

echo.
echo ==========================================
echo   Installation Complete!
echo ==========================================
echo.
echo  Next steps:
echo    1. Configure .env file (optional — sets admin password, port, etc.)
echo    2. Run start-clinic-server.bat  OR  double-click AOD Tracker Server
echo    3. Open http://localhost:8080 in your browser
echo.
echo  Default login:
echo    Username: admin
echo    Password: admin123  ^(change via .env: ADMIN_PASSWORD=yourpassword^)
echo.
echo  Multi-computer access:
echo    Find this machine's IP:  ipconfig
echo    Other computers use:     http://[IP-ADDRESS]:8080
echo.
pause
goto :end

REM ─────────────────────────────────────────────────────────────────────────────
REM UPGRADE — hand off to UPDATE.bat
REM ─────────────────────────────────────────────────────────────────────────────
:upgrade
echo  Existing installation detected.
echo  Handing off to the smart updater to preserve your data...
echo.
call "%~dp0UPDATE.bat"
goto :end

:end
endlocal
