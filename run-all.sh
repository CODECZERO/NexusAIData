#!/bin/bash
echo "🚀 Starting NexusAIData Platform..."

# Ensure we're in the right directory
cd "$(dirname "$0")"

# Kill existing processes on exit
trap 'kill $(jobs -p) 2>/dev/null' EXIT

# Start Python Backend
echo "📦 Starting Python Backend (Port 8000)..."
cd backend
uvicorn main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!
cd ..

# Start Node.js Bridge
echo "🌉 Starting Midnight Bridge..."
cd smartcontract
npm run bridge &
BRIDGE_PID=$!
cd ..

# Start Frontend
echo "💻 Starting React Frontend (Port 5173)..."
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..

echo "✅ All services running! Press Ctrl+C to stop."
echo "🔗 Frontend: http://localhost:5173"
echo "🔗 Backend:  http://localhost:8000"

wait
