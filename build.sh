#!/bin/bash

# Build script for Easy Kanban Docker application

echo "🚀 Building Easy Kanban application..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker and try again."
    exit 1
fi

# Build the production image
echo "📦 Building Docker image..."
docker build -t easy-kanban:latest .

if [ $? -eq 0 ]; then
    echo "✅ Docker image built successfully!"
    echo ""
    echo "🎯 To run the application:"
echo "   npm run docker:prod    # Production mode (Docker Compose V2)"
echo "   npm run docker:dev     # Development mode (Docker Compose V2)"
echo "   npm run docker:prod-legacy    # Production mode (Docker Compose V1)"
echo "   npm run docker:dev-legacy     # Development mode (Docker Compose V1)"
echo ""
echo "🔧 To stop the application:"
echo "   npm run docker:stop    # Docker Compose V2"
echo "   npm run docker:stop-legacy    # Docker Compose V1"
echo ""
echo "🧹 To clean up:"
echo "   npm run docker:clean   # Docker Compose V2"
echo "   npm run docker:clean-legacy   # Docker Compose V1"
else
    echo "❌ Docker build failed!"
    exit 1
fi
