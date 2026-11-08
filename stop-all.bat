@echo off
echo ====================================================
echo   Stopping ASVA Web Platform
echo ====================================================

taskkill /FI "WINDOWTITLE eq ASVA Hub Server*" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq ASVA ESP32 Simulator*" /T /F >nul 2>&1

echo Services stopped.
timeout /t 2 >nul

