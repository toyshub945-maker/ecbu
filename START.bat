@echo off
TITLE Workflow Dashboard
COLOR 0A
cls

echo.
echo  =========================================================
echo        WORKFLOW DASHBOARD  ^|  Starting Up...
echo  =========================================================
echo.

:: ── Detect local IP ──────────────────────────────────────────
set LOCAL_IP=localhost
for /f "tokens=2 delims=:" %%i in ('ipconfig ^| findstr /i "IPv4" ^| findstr "192.168."') do set LOCAL_IP=%%i
set LOCAL_IP=%LOCAL_IP: =%

:: ── Kill anything already on ports 8000 / 3002 ───────────────
echo  Clearing ports 8000 and 3002...
for /f "tokens=5" %%p in ('netstat -ano 2^>nul ^| findstr ":8000 " ^| findstr "LISTENING"') do taskkill /PID %%p /F >nul 2>&1
for /f "tokens=5" %%p in ('netstat -ano 2^>nul ^| findstr ":3002 " ^| findstr "LISTENING"') do taskkill /PID %%p /F >nul 2>&1
timeout /t 1 /nobreak >nul

:: ── Start Backend ─────────────────────────────────────────────
echo  [1/2] Starting Backend  (port 8000)...
start "WORKFLOW - Backend (port 8000)" /D "%~dp0backend" cmd /k ^
  ".venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"

:: Wait for backend to be ready (max 30s)
echo  Waiting for backend to be ready...
set /a tries=0
:WAIT_BACKEND
timeout /t 2 /nobreak >nul
curl -s http://localhost:8000/health >nul 2>&1
if %ERRORLEVEL%==0 goto BACKEND_READY
set /a tries+=1
if %tries% lss 15 goto WAIT_BACKEND
echo  (Backend taking longer than usual - continuing anyway)
:BACKEND_READY

:: ── Start Frontend ────────────────────────────────────────────
echo  [2/2] Starting Frontend (port 3002)...

:: Write the backend URL for Next.js (always use localhost for the server-side proxy)
(echo NEXT_PUBLIC_BACKEND_URL=http://localhost:8000) > "%~dp0frontend\.env.local"

start "WORKFLOW - Frontend (port 3002)" /D "%~dp0frontend" cmd /k ^
  "set NEXT_PUBLIC_BACKEND_URL=http://localhost:8000 && npm run dev -- -H 0.0.0.0"

:: Wait a moment then open browser
timeout /t 6 /nobreak >nul

:: ── Open browser ──────────────────────────────────────────────
start "" "http://localhost:3002"

:: ── Done ──────────────────────────────────────────────────────
echo.
echo  =========================================================
echo   APP IS RUNNING!
echo.
echo   Dashboard :  http://localhost:3002
echo   Network   :  http://%LOCAL_IP%:3002
echo   Backend   :  http://%LOCAL_IP%:8000
echo.
echo   Close the two server windows to stop the app.
echo  =========================================================
echo.
pause
