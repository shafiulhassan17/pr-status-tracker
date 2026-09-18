@echo off
echo ========================================================
echo        STOPPING PR STATUS TRACKER (PORT 3000)
echo ========================================================
echo.

set FOUND=0
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING') do (
    taskkill /F /PID %%a >nul 2>&1
    echo [OK] Stopped process PID: %%a running on port 3000.
    set FOUND=1
)

if "%FOUND%"=="0" (
    echo [INFO] No server process was currently running on port 3000.
) else (
    echo [SUCCESS] Server stopped successfully.
)

echo.
pause
