@echo off
echo ========================================================
echo        CHECKING PR STATUS TRACKER (PORT 3000)
echo ========================================================
echo.

netstat -aon | findstr :3000 | findstr LISTENING >nul
if %ERRORLEVEL% equ 0 (
    echo [ACTIVE] PR Status Tracker is actively RUNNING on port 3000!
    echo Opening portal at http://localhost:3000 ...
    start "" http://localhost:3000
) else (
    echo [OFFLINE] Server is NOT running on port 3000.
    echo.
    echo To start the server:
    echo   - Double-click 'start-background.vbs' (Runs silently in background)
    echo   - OR double-click 'start.bat' (Runs with console window)
)

echo.
pause
