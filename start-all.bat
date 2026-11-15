@echo off
echo ================================================================
echo          ASVA Web Platform Launcher (SIH26172)
echo ================================================================
echo.

echo [1/3] Starting Hub Server (Web UI + API + MQTT Broker)...
start "ASVA Hub Server" cmd /k "cd /d %~dp0hub\server && npm start"

echo [2/3] Waiting for server on port 8080...
timeout /t 3 /nobreak >nul

echo [3/3] Starting Virtual ESP32 Simulator...
start "ASVA ESP32 Simulator" cmd /k "cd /d %~dp0hub\simulator && npm run simulate"

echo.
echo ================================================================
echo   SUCCESS! ASVA is running!
echo.
echo   Web Dashboard URLs:
echo   --> http://localhost:8080
echo   --> http://localhost:8080/shelf
echo.
echo   Login Credentials:
echo   --> Email:    admin@example.com
echo   --> Password: admin123 (or password from hub/.env)
echo.
echo   To STOP everything cleanly:
echo   --> Double-click stop-all.bat
echo ================================================================
echo.

:: Automatically launch browser
start http://localhost:8080

pause
