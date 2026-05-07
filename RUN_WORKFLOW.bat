@echo off
TITLE Workflow Dashboard Launcher
COLOR 0B

echo ========================================================
echo        WORKFLOW DASHBOARD - ALL-IN-ONE LAUNCHER
echo ========================================================
echo.

:: Detect Local IP - More robust method
for /f "tokens=2 delims=:" %%i in ('ipconfig ^| findstr /i "IPv4" ^| findstr /v "127.0.0.1" ^| findstr "192.168."') do set LOCAL_IP=%%i
if "%LOCAL_IP%"=="" (
    for /f "tokens=2 delims=:" %%i in ('ipconfig ^| findstr /i "IPv4" ^| findstr /v "127.0.0.1"') do set LOCAL_IP=%%i
)
set LOCAL_IP=%LOCAL_IP: =%

echo Detected Local IP: %LOCAL_IP%
echo.

echo [1/2] Starting Backend Server...
start "Workflow Backend" /D "%~dp0" powershell -ExecutionPolicy Bypass -File "%~dp0start-backend.ps1"
timeout /t 5

echo [2/2] Starting Frontend Dashboard...
start "Workflow Frontend" /D "%~dp0" powershell -ExecutionPolicy Bypass -File "%~dp0start-frontend.ps1"

echo.
echo ========================================================
echo  SERVICES ARE STARTING!
echo.
echo  - DASHBOARD URL: http://%LOCAL_IP%:3002
echo  - BACKEND API:   http://%LOCAL_IP%:8000
echo.
echo  Keep the two other windows open while using the app.
echo ========================================================
echo.
pause
