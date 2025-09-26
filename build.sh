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

# Generate a random JWT secret
echo "🔐 Generating secure JWT secret..."
if command -v openssl >/dev/null 2>&1; then
    JWT_SECRET=$(openssl rand -base64 64 | tr -d "=+/" | cut -c1-64)
    echo "   JWT Secret generated using OpenSSL: ${JWT_SECRET:0:8}..."
else
    # Fallback method using /dev/urandom
    JWT_SECRET=$(head -c 64 /dev/urandom | base64 | tr -d "=+/" | cut -c1-64)
    echo "   JWT Secret generated using /dev/urandom: ${JWT_SECRET:0:8}..."
fi

# Update docker-compose files with user's configuration
echo "🔧 Updating docker-compose files with your configuration..."
for compose_file in docker-compose*.yml; do
    if [ -f "$compose_file" ]; then
        echo "   Updating $compose_file..."
        sed -i "s/- \"[0-9]*:3010\"/- \"$FRONTEND_PORT:3010\"/" "$compose_file"
        sed -i "s/DEMO_ENABLED=[a-z]*/DEMO_ENABLED=$DEMO_ENABLED/" "$compose_file"
        sed -i "s/JWT_SECRET=your-super-secret-jwt-key-change-in-production/JWT_SECRET=$JWT_SECRET/" "$compose_file"
    fi
done

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
    echo ""
    echo "🔐 ==========================================="
    echo "   ADMIN ACCOUNT CREDENTIALS"
    echo "==========================================="
    echo "   Email: admin@kanban.local"
    echo "   Password: [Generated randomly - check Docker logs]"
    echo "==========================================="
    echo ""
    echo "🔑 ==========================================="
    echo "   JWT SECRET INFORMATION"
    echo "==========================================="
    echo "   JWT Secret: [Generated securely and updated in docker-compose files]"
    echo "   Secret Preview: ${JWT_SECRET:0:8}..."
    echo "   Length: ${#JWT_SECRET} characters"
    echo "==========================================="
    echo ""
    echo ""
    echo -e "\033[1;33m💡 ==========================================="
    echo -e "   🔑 HOW TO GET THE ADMIN PASSWORD"
    echo -e "==========================================="
    echo -e "   Run this command to see the password:"
    echo -e "   \033[1;36mdocker compose logs | grep -A 5 'ADMIN ACCOUNT'\033[0m"
    echo -e "===========================================\033[0m"
else
    echo "❌ Docker build failed!"
    exit 1
fi
