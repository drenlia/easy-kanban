#!/bin/bash

# Build script for Easy Kanban Docker application (Development Mode)

echo "🚀 Building Easy Kanban application..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker and try again."
    exit 1
fi

# Build the development image
echo "📦 Building Docker image..."
docker build -t easy-kanban:latest .

if [ $? -eq 0 ]; then
    echo "✅ Docker image built successfully!"
    echo ""
    echo "🎯 To run the application:"
    echo "   npm run docker:dev    # Development mode with hot reloading"
    echo ""
    echo "🔧 To stop the application:"
    echo "   npm run docker:stop"
    echo ""
    echo "🧹 To clean up:"
    echo "   npm run docker:clean"
    echo ""
    echo "🌐 Access your application at:"
    echo "   Frontend: http://localhost:3010"
    echo "   Backend API: http://localhost:3222"
else
    echo "❌ Docker build failed!"
    exit 1
fi
