@echo off
setlocal EnableDelayedExpansion
echo ==========================================
echo   AOD Tracker - Smart Update
echo ==========================================
echo.

REM ── Verify we're in the right place ─────────────────────────────────────────
cd /d "%~dp0"
if not exist "server\index.js" (
    echo ERROR: Run this script from the AOD Tracker application folder.
    pause
    exit /b 1
)

REM ── Read current installed version ──────────────────────────────────────────
set "CURRENT_VER=unknown"
if exist "version.txt" (
    set /p CURRENT_VER=<version.txt
)

REM ── Read incoming version (from version.txt in the same folder if re-run,
REM    or from a NEW_VERSION env var set by an outer installer) ─────────────────
set "NEW_VER=%NEW_VERSION%"
if "!NEW_VER!"=="" (
    if exist "version.txt" set "NEW_VER=!CURRENT_VER!"
)

echo   Installed version : !CURRENT_VER!
if not "!NEW_VER!"=="" (
    echo   Incoming version  : !NEW_VER!
)
echo.

REM ── Step 1: Check server not running ────────────────────────────────────────
echo [1/5] Checking for running server...
tasklist /FI "IMAGENAME eq node.exe" 2>NUL | find /I "node.exe" >NUL 2>&1
if not errorlevel 1 (
    echo.
    echo  WARNING: A Node.js process is running.
    echo  Please stop AOD Tracker Server before updating.
    echo    - Right-click the tray icon and choose Quit
    echo    - Or close the server window
    echo.
    pause
    exit /b 1
)
echo  [OK] Server not running

REM ── Step 2: Backup database and uploads ─────────────────────────────────────
echo.
echo [2/5] Backing up data...

if not exist "backups" mkdir backups

REM Date/time stamp: YYYYMMDD-HHMM
for /f "tokens=2 delims==" %%a in ('wmic OS Get localdatetime /value') do set DT=%%a
set "STAMP=!DT:~0,8!-!DT:~8,4!"

set "BACKED_UP=0"

if exist "server\database\aod_tracker.db" (
    copy /Y "server\database\aod_tracker.db" "backups\aod_tracker-%STAMP%.db" >nul
    echo  [OK] Database backed up  ^(backups\aod_tracker-%STAMP%.db^)
    set "BACKED_UP=1"
)
REM Legacy name
if exist "server\database\app.db" (
    copy /Y "server\database\app.db" "backups\app-%STAMP%.db" >nul
    echo  [OK] Legacy database backed up
    set "BACKED_UP=1"
)
if "!BACKED_UP!"=="0" (
    echo  [--] No existing database found ^(first install?^)
)

REM ── Step 3: Detect what changed ─────────────────────────────────────────────
echo.
echo [3/5] Detecting changes...

set "DEPS_CHANGED=0"
set "BUILD_NEEDED=0"

REM Compare package.json hash — if it changed, dependencies need reinstalling
REM We store a hash of package.json after the last successful install
if exist ".last-pkg-hash" (
    REM Use certutil to get current hash
    for /f "skip=1 tokens=*" %%h in ('certutil -hashfile package.json MD5 2^>nul') do (
        if not "%%h"=="CertUtil: -hashfile command completed successfully." (
            set "CUR_HASH=%%h"
            goto :hash_done
        )
    )
    :hash_done
    set /p LAST_HASH=<.last-pkg-hash
    if not "!CUR_HASH!"=="!LAST_HASH!" (
        set "DEPS_CHANGED=1"
        echo  [!!] package.json changed — dependencies will be updated
    ) else (
        echo  [OK] Dependencies unchanged
    )
) else (
    set "DEPS_CHANGED=1"
    echo  [!!] First run — will install dependencies
)

REM Always rebuild the frontend (fast, ensures dist/ is current)
set "BUILD_NEEDED=1"
echo  [!!] Frontend will be rebuilt

REM ── Step 4: Update dependencies if needed ───────────────────────────────────
echo.
echo [4/5] Updating application...

if "!DEPS_CHANGED!"=="1" (
    echo  Installing Node.js dependencies...
    call npm install
    if errorlevel 1 (
        echo.
        echo  ERROR: npm install failed. Update aborted.
        echo  Your database has been backed up and is untouched.
        pause
        exit /b 1
    )
    REM Also update server-side deps
    if exist "server\package.json" (
        echo  Installing server dependencies...
        cd server
        call npm install
        cd ..
    )
    REM Save new hash
    for /f "skip=1 tokens=*" %%h in ('certutil -hashfile package.json MD5 2^>nul') do (
        if not "%%h"=="CertUtil: -hashfile command completed successfully." (
            echo %%h>.last-pkg-hash
            goto :hash_saved
        )
    )
    :hash_saved
    echo  [OK] Dependencies installed
) else (
    echo  [OK] Skipping npm install ^(no changes^)
)

if "!BUILD_NEEDED!"=="1" (
    echo  Building frontend...
    call npm run build
    if errorlevel 1 (
        echo.
        echo  ERROR: Build failed. Update aborted.
        echo  Your database has been backed up and is untouched.
        pause
        exit /b 1
    )
    echo  [OK] Frontend built
)

REM ── Step 5: Write new version stamp ─────────────────────────────────────────
echo.
echo [5/5] Finalising...

if not "!NEW_VER!"=="" (
    if not "!NEW_VER!"=="!CURRENT_VER!" (
        echo !NEW_VER!>version.txt
        echo  [OK] Version updated: !CURRENT_VER! ^-^> !NEW_VER!
    )
)

REM Prune old backups — keep only the 10 most recent .db files
echo  Pruning old backups ^(keeping 10 most recent^)...
set "COUNT=0"
for /f "skip=10 delims=" %%f in ('dir /b /o-d "backups\*.db" 2^>nul') do (
    del "backups\%%f" >nul 2>&1
    set /a COUNT+=1
)
if !COUNT! GTR 0 (
    echo  [OK] Removed !COUNT! old backup^(s^)
)

echo.
echo ==========================================
echo   Update Complete!
echo ==========================================
echo.
echo  What was preserved:
echo    - Database           : server\database\
echo    - Uploads            : server\uploads\
echo    - Environment config : .env
echo    - Backups            : backups\
echo.
echo  Backup created:
if "!BACKED_UP!"=="1" (
    echo    backups\aod_tracker-%STAMP%.db
) else (
    echo    ^(no database existed^)
)
echo.
echo  You can now start AOD Tracker Server.
echo.
pause
