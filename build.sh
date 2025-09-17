#!/bin/bash

# Build script for Easy Kanban Docker application (Development Mode)

echo "🚀 Building Easy Kanban application..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker and try again."
    exit 1
fi

# Interactive questions
echo ""
echo "🔧 Configuration Questions:"
echo ""

# Question 1: Port selection
while true; do
    read -p "What port do you want this app to listen on? (default: 3010): " FRONTEND_PORT
    if [ -z "$FRONTEND_PORT" ]; then
        FRONTEND_PORT=3010
    fi
    
    # Validate port number
    if [[ "$FRONTEND_PORT" =~ ^[0-9]+$ ]] && [ "$FRONTEND_PORT" -ge 1 ] && [ "$FRONTEND_PORT" -le 65535 ]; then
        break
    else
        echo "❌ Please enter a valid port number (1-65535)"
    fi
done

# Question 2: Demo mode
while true; do
    read -p "Do you want to run this app in demo mode? (y/n, default: n): " DEMO_MODE
    if [ -z "$DEMO_MODE" ]; then
        DEMO_MODE="n"
    fi
    
    case $DEMO_MODE in
        [Yy]* ) DEMO_ENABLED="true"; break;;
        [Nn]* ) DEMO_ENABLED="false"; break;;
        * ) echo "❌ Please answer y or n";;
    esac
done

echo ""
echo "📋 Configuration Summary:"
echo "   Frontend Port: $FRONTEND_PORT"
echo "   Demo Mode: $DEMO_ENABLED"
echo ""

# Update docker-compose.yml with user's configuration
echo "🔧 Updating docker-compose.yml with your configuration..."
sed -i "s/- \"[0-9]*:3010\"/- \"$FRONTEND_PORT:3010\"/" docker-compose.yml
sed -i "s/DEMO_ENABLED=[a-z]*/DEMO_ENABLED=$DEMO_ENABLED/" docker-compose.yml

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
    echo "   Frontend: http://localhost:$FRONTEND_PORT"
    echo "   Backend API: http://localhost:3222"
else
    echo "❌ Docker build failed!"
    exit 1
fi
