@echo off
title PR Status Tracker - One-Click Launcher
color 0A
cd /d "C:\Users\shafi\OneDrive\Documents\pr-status-tracker"
"C:\Program Files\nodejs\node.exe" launch_all.js
echo.
echo Press any key to open http://localhost:3000 in your browser, or close this window.
pause >nul
start http://localhost:3000
