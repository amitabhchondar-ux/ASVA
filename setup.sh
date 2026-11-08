#!/usr/bin/env bash
set -e

echo "===================================================="
echo "          ASVA Platform One-Time Setup"
echo "===================================================="

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"

echo "[1/3] Setting up Web Frontend & 3D Bookshelf..."
cd "$DIR/hub/web"
npm install
npm run build

echo "[2/3] Setting up Hub Server (Fastify + MQTT)..."
cd "$DIR/hub/server"
npm install
npm run build

echo "[3/3] Setting up ESP32 Virtual Simulator..."
cd "$DIR/hub/simulator"
npm install

echo ""
echo "===================================================="
echo "  SETUP COMPLETE! Run ./start-all.sh to start."
echo "===================================================="
