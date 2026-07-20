@echo off
cd /d "%~dp0"
echo Starting HySlides at http://127.0.0.1:4173/
echo Keep this window open while you use the app.
echo.
powershell -NoExit -ExecutionPolicy Bypass -File ".\tools\serve.ps1" -Port 4173
