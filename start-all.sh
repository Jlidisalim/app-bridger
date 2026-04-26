#!/bin/bash
# Bridger - Start all services
# Run in Terminal.app: ./start-all.sh

DIR="$(cd "$(dirname "$0")" && pwd)"

# Trap: when this script exits (Ctrl+C on Expo), don't kill background services
trap '' HUP

echo "Killing old processes..."
pkill -9 -f "node.*ts-node.*server" 2>/dev/null
pkill -9 -f "node --require ts-node" 2>/dev/null
pkill -9 -f "uvicorn app.main" 2>/dev/null
pkill -9 -f "node server.js" 2>/dev/null
lsof -ti :3002 2>/dev/null | xargs kill -9 2>/dev/null
lsof -ti :3000 2>/dev/null | xargs kill -9 2>/dev/null
lsof -ti :8001 2>/dev/null | xargs kill -9 2>/dev/null
lsof -ti :8081 2>/dev/null | xargs kill -9 2>/dev/null
sleep 2

echo ""
echo "Starting Backend (port 3002)..."
cd "$DIR/backend"
nohup env PORT=3002 npm run dev > /tmp/backend.log 2>&1 &
disown

echo "Starting Baileys WhatsApp (port 3000)..."
cd "$DIR/baileys-server"
nohup node server.js > /tmp/baileys.log 2>&1 &
disown

echo "Starting Face Verification (port 8001)..."
cd "$DIR/face-verification-service"
nohup ./venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8001 > /tmp/face-service.log 2>&1 &
disown

echo ""
echo "Waiting 30 seconds for services..."
sleep 30

echo ""
echo "=== SERVICE STATUS ==="
curl -s --connect-timeout 2 http://localhost:3002/health >/dev/null 2>&1 && echo "Backend (3002): RUNNING" || echo "Backend (3002): FAILED - run: cat /tmp/backend.log"
curl -s --connect-timeout 2 http://localhost:3000/health >/dev/null 2>&1 && echo "Baileys (3000): RUNNING" || echo "Baileys (3000): FAILED - run: cat /tmp/baileys.log"
curl -s --connect-timeout 2 http://localhost:8001/health >/dev/null 2>&1 && echo "Face Service (8001): RUNNING" || echo "Face Service (8001): FAILED - run: cat /tmp/face-service.log"

echo ""
echo "Starting Expo (press Ctrl+C to stop Expo only - services keep running)..."
cd "$DIR" && npx expo start --clear
