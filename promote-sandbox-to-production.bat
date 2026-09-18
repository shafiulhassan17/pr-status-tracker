@echo off
title Promote Sandbox to Production
echo ========================================================
echo   PROMOTE SANDBOX TO LIVE PRODUCTION (PORT 3000)
echo ========================================================
echo.
echo WARNING: This will update production files with:
echo  - Frontend: public/index.html, styles.css, app.js
echo  - Backend: server.js, gdrive_sync.js, google_service_account.json
echo.
pause

set SRC=C:\Users\shafi\OneDrive\Documents\pr-status-tracker-sandbox
set DST=C:\Users\shafi\OneDrive\Documents\pr-status-tracker

echo Backing up current production files...
if not exist "%DST%\backup" mkdir "%DST%\backup"
copy "%DST%\server.js" "%DST%\backup\server.js" /Y
robocopy "%DST%\public" "%DST%\backup\public" /E /NFL /NDL /NJH /NJS

echo Copying updated files to production...
copy "%SRC%\server.js" "%DST%\server.js" /Y
copy "%SRC%\gdrive_sync.js" "%DST%\gdrive_sync.js" /Y
copy "%SRC%\google_service_account.json" "%DST%\google_service_account.json" /Y
copy "%SRC%\public\index.html" "%DST%\public\index.html" /Y
copy "%SRC%\public\styles.css" "%DST%\public\styles.css" /Y
copy "%SRC%\public\app.js" "%DST%\public\app.js" /Y

echo.
echo ========================================================
echo Successfully copied to production!
echo Restart production node server to apply backend changes.
echo ========================================================
pause
