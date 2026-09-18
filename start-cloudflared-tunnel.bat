@echo off
title Cloudflare Public HTTPS Tunnel - PR Status Tracker
echo ========================================================
echo       CLOUDFLARE PUBLIC HTTPS TUNNEL FOR PR TRACKER
echo ========================================================
echo.
echo Starting secure public tunnel to http://localhost:3000 ...
echo Once connected, look for the 'https://...trycloudflare.com' link below.
echo.
"C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --edge-ip-version 4 --protocol http2 --url http://localhost:3000
pause
