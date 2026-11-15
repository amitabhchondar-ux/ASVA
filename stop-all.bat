@echo off
echo ====================================================
echo   Stopping ASVA Web Platform (Server + Simulator)
echo ====================================================
echo.

echo [1/2] Closing ASVA launcher windows...
taskkill /FI "WINDOWTITLE eq ASVA Hub Server*" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq ASVA ESP32 Simulator*" /T /F >nul 2>&1

echo [2/2] Freeing ports 8080 and 1883...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8080 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :1883 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1

echo.
echo ====================================================
echo   All ASVA services stopped successfully!
echo ====================================================
timeout /t 2 >nul
