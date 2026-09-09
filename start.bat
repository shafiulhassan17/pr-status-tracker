@echo off
title PR Status Tracker Portal
echo ========================================================
echo       PR STATUS TRACKER & SUPPLY CHAIN MONITOR
echo ========================================================
echo.
echo Starting application server...
echo Database located in: .\data\pr_tracker.db
echo.

:: Open default browser after 1 second
start "" http://localhost:3000

:: Run Node Server
node server.js

pause
