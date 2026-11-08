#!/usr/bin/env bash

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"

echo "===================================================="
echo "          Starting ASVA Web Platform"
echo "===================================================="

echo "[1/2] Starting Hub Server on port 8080..."
cd "$DIR/hub/server"
npm start &
SERVER_PID=$!

sleep 3

echo "[2/2] Starting ESP32 Device Simulator..."
cd "$DIR/hub/simulator"
npm run simulate &
SIM_PID=$!

echo ""
echo "===================================================="
echo "  ASVA Platform is running!"
echo "  Open dashboard: http://localhost:8080"
echo "  Press Ctrl+C to stop all services."
echo "===================================================="

trap "kill $SERVER_PID $SIM_PID 2>/dev/null; exit" SIGINT SIGTERM

wait
