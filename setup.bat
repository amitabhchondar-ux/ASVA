@echo off
echo ====================================================
echo          ASVA Platform One-Time Setup
echo ====================================================
echo.

echo [1/3] Installing Hub Server dependencies and building...
cd /d %~dp0hub\server
call npm install
call npm run build

echo.
echo [2/3] Installing Web Frontend dependencies and building 3D UI...
cd /d %~dp0hub\web
call npm install
call npm run build

echo.
echo [3/3] Installing Device Simulator dependencies...
cd /d %~dp0hub\simulator
call npm install

echo.
echo ====================================================
echo   SETUP COMPLETED SUCCESSFULLY!
echo.
echo   To launch the entire platform, double-click:
echo   --> start-all.bat
echo ====================================================
echo.
pause
