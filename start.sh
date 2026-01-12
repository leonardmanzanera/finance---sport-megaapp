#!/bin/bash

# Function to handle script termination
cleanup() {
    echo ""
    echo "🛑 Stopping all servers..."
    # Kill all child processes involved in this script group
    kill $(jobs -p) 2>/dev/null
    exit
}

# Trap SIGINT (Ctrl+C) and SIGTERM
trap cleanup SIGINT SIGTERM

echo "============================================="
echo "   🚀 Finance & Sport MegaApp Launcher 🚀    "
echo "============================================="

# 1. Frontend Dependencies
echo "📦 Checking Frontend dependencies..."
if [ ! -d "node_modules" ]; then
    echo "   -> Installing Frontend dependencies (npm install)..."
    npm install
else
    echo "   -> Frontend dependencies already installed."
fi

# 2. Backend Dependencies
echo "📦 Checking Backend dependencies..."
if [ ! -d "backend/node_modules" ]; then
    echo "   -> Installing Backend dependencies (cd backend && npm install)..."
    cd backend && npm install && cd ..
else
    echo "   -> Backend dependencies already installed."
fi

echo "============================================="

# 3. Start Backend
echo "🔥 Starting Backend Server..."
cd backend
npm start &
BACKEND_PID=$!
cd ..

# Wait a moment to ensure backend initializes
sleep 2

# 4. Start Frontend
echo "🔥 Starting Frontend Server..."
npm run dev &
FRONTEND_PID=$!

echo "============================================="
echo "✅  Application is running!"
echo "👉  Frontend: http://localhost:3000"
echo "👉  Backend:  http://localhost:3001"
echo "============================================="
echo "Press CTRL+C to stop everything."

# Wait for background processes
wait $BACKEND_PID $FRONTEND_PID
