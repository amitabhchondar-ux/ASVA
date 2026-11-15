#!/usr/bin/env bash

echo "===================================================="
echo "  Stopping ASVA Web Platform (Server + Simulator)"
echo "===================================================="

# Kill processes listening on port 8080 and 1883
lsof -ti:8080 | xargs kill -9 2>/dev/null || true
lsof -ti:1883 | xargs kill -9 2>/dev/null || true

echo "All ASVA services stopped successfully."
