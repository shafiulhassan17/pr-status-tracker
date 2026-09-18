@echo off
title CEPL Procurement Tracker - Custom Link
echo ========================================================
echo       CEPL PROC TRACKER - PUBLIC CUSTOM LINK
echo ========================================================
echo.
echo Starting memorable public tunnel on:
echo https://cepl-proc-tracker.loca.lt
echo.
set PATH=C:\Program Files\nodejs;%PATH%
"%APPDATA%\npm\lt.cmd" --port 3000 --subdomain cepl-proc-tracker
pause
