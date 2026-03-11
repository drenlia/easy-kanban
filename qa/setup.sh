#!/bin/bash

# Easy Kanban QA Setup Script
# This script sets up the Playwright testing environment

set -e  # Exit on error

echo "🚀 Setting up Easy Kanban QA Tests..."
echo ""

# Check if we're in the qa directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Please run this script from the qa/ directory."
    exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Install Playwright browsers
echo "🌐 Installing Playwright browsers (Chromium)..."
npx playwright install chromium

# Install system dependencies for browsers (if needed)
echo "🔧 Installing system dependencies..."
npx playwright install-deps chromium || echo "⚠️  Some system dependencies may need manual installation"

# Create .env file from example if it doesn't exist
if [ ! -f ".env" ]; then
    echo ""
    echo "📝 Creating .env file from .env.example..."
    cp .env.example .env
    echo "⚠️  IMPORTANT: Edit .env and add your test credentials!"
    echo "   File location: qa/.env"
else
    echo ""
    echo "✓ .env file already exists"
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "⚠️  NEXT STEP: Configure your credentials"
echo "   Edit qa/.env and set:"
echo "   - TEST_USER_EMAIL"
echo "   - TEST_USER_PASSWORD"
echo ""
echo "📝 Then run tests:"
echo "  1. Run tests: npm test"
echo "  2. Run in headed mode: npm run test:headed"
echo "  3. Run with UI: npm run test:ui"
echo "  4. Debug tests: npm run test:debug"
echo ""
echo "📚 See README.md for more information"
