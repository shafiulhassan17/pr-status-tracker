@echo off
echo =======================================================
echo Opening Port 3000 in Windows Firewall for PR Tracker...
echo =======================================================
netsh advfirewall firewall add rule name=" PR Status Tracker Port 3000\ dir=in action=allow protocol=TCP localport=3000 profile=any
echo.
echo Port 3000 has been opened on all network profiles!
pause
