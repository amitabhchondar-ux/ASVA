#!/usr/bin/env bash
set -e

echo "===================================================="
echo "          ASVA Platform One-Time Setup"
echo "===================================================="

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"

echo "[1/4] Setting up Web Frontend & 3D Bookshelf..."
cd "$DIR/hub/web"
npm install
npm run build

echo "[2/4] Setting up Hub Server (Fastify + MQTT)..."
cd "$DIR/hub/server"
npm install
npm run build

echo "[3/4] Setting up ESP32 Virtual Simulator..."
cd "$DIR/hub/simulator"
npm install

echo "[4/4] Bootstrapping security environment (hub/.env)..."
cd "$DIR"
node "$DIR/scripts/bootstrap-env.mjs"

echo ""
echo "===================================================="
echo "  SETUP COMPLETE! Run ./start-all.sh to start."
echo "===================================================="
