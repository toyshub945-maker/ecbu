@echo off
TITLE Workflow Inventory Sync
COLOR 0E

echo ========================================================
echo        WORKFLOW - MANUAL INVENTORY SYNC
echo ========================================================
echo.
echo Syncing all 14 Feishu Warehouse sheets...
echo Please wait, this may take up to 2 minutes...
echo.

cd /d "%~dp0backend"
.venv\Scripts\python.exe run_sync.py

echo.
echo ========================================================
echo  SYNC COMPLETE!
echo ========================================================
echo.
pause
