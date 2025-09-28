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

# Question 3: Allowed origins for CORS
echo ""
echo "🌐 CORS Configuration:"
echo "   This determines which domains can access your application."
echo "   Examples:"
echo "   - For local development: http://localhost:3000,http://localhost:5173"
echo "   - For production: https://yourdomain.com,https://www.yourdomain.com"
echo "   - For any domain (less secure): true"
echo ""
while true; do
    read -p "What URL(s) will be used to access this app? (comma-separated, default: http://localhost:$FRONTEND_PORT,http://localhost:5173): " ALLOWED_ORIGINS_INPUT
    if [ -z "$ALLOWED_ORIGINS_INPUT" ]; then
        ALLOWED_ORIGINS="http://localhost:$FRONTEND_PORT,http://localhost:5173"
        break
    fi
    
    # Validate that it's not empty and contains valid characters
    if [[ -n "$ALLOWED_ORIGINS_INPUT" ]]; then
        ALLOWED_ORIGINS="$ALLOWED_ORIGINS_INPUT"
        break
    else
        echo "❌ Please enter at least one URL"
    fi
done

echo ""
echo "📋 Configuration Summary:"
echo "   Frontend Port: $FRONTEND_PORT"
echo "   Demo Mode: $DEMO_ENABLED"
echo "   Allowed Origins: $ALLOWED_ORIGINS"
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

# Create docker-compose.yml based on user's choice
echo "🔧 Creating docker-compose.yml based on your configuration..."

# Choose the base template based on demo mode
if [ "$DEMO_ENABLED" = "true" ]; then
    BASE_TEMPLATE="docker-compose-demo.yml"
    echo "   Using demo template: $BASE_TEMPLATE"
else
    BASE_TEMPLATE="docker-compose-dev.yml"
    echo "   Using development template: $BASE_TEMPLATE"
fi

# Copy the base template to docker-compose.yml
if [ -f "$BASE_TEMPLATE" ]; then
    cp "$BASE_TEMPLATE" "docker-compose.yml"
    echo "   Created docker-compose.yml from $BASE_TEMPLATE"
    
    # Update the docker-compose.yml with user's configuration
    echo "   Updating configuration..."
    
    # Update port mapping
    sed -i "s/- \"[0-9]*:3010\"/- \"$FRONTEND_PORT:3010\"/" "docker-compose.yml"
    
    # Update DEMO_ENABLED
    sed -i "s/DEMO_ENABLED=[a-z]*/DEMO_ENABLED=$DEMO_ENABLED/" "docker-compose.yml"
    
    # Update JWT_SECRET (use a more robust approach)
    # First, let's ensure the JWT_SECRET doesn't contain any problematic characters
    JWT_SECRET_CLEAN=$(echo "$JWT_SECRET" | tr -d '\n\r')
    
    # Use sed with a more specific pattern
    sed -i "s|- JWT_SECRET=.*|- JWT_SECRET=$JWT_SECRET_CLEAN|" "docker-compose.yml"
    
    # Update ALLOWED_ORIGINS (use perl for better handling of special characters)
    perl -i -pe "s|- ALLOWED_ORIGINS=.*|- ALLOWED_ORIGINS=$ALLOWED_ORIGINS|" "docker-compose.yml"
    
    # Extract hostnames from ALLOWED_ORIGINS for Vite allowedHosts
    echo "   Configuring Vite allowedHosts..."
    VITE_ALLOWED_HOSTS="localhost,127.0.0.1"
    
    # Parse ALLOWED_ORIGINS to extract hostnames
    IFS=',' read -ra ORIGINS <<< "$ALLOWED_ORIGINS"
    for origin in "${ORIGINS[@]}"; do
        # Remove protocol (http:// or https://) and port if present
        hostname=$(echo "$origin" | sed 's|^https\?://||' | sed 's|:.*||')
        if [[ "$hostname" != "localhost" && "$hostname" != "127.0.0.1" && "$hostname" != "true" ]]; then
            VITE_ALLOWED_HOSTS="$VITE_ALLOWED_HOSTS,$hostname"
        fi
    done
    
    # Add VITE_ALLOWED_HOSTS to docker-compose.yml
    if ! grep -q "VITE_ALLOWED_HOSTS" "docker-compose.yml"; then
        # Add it after ALLOWED_ORIGINS
        sed -i "/ALLOWED_ORIGINS=.*/a\\      - VITE_ALLOWED_HOSTS=$VITE_ALLOWED_HOSTS" "docker-compose.yml"
    else
        # Update existing VITE_ALLOWED_HOSTS
        sed -i "s|VITE_ALLOWED_HOSTS=.*|VITE_ALLOWED_HOSTS=$VITE_ALLOWED_HOSTS|" "docker-compose.yml"
    fi
    
    echo "   ✅ Configuration updated successfully"
else
    echo "   ❌ Template file $BASE_TEMPLATE not found!"
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
