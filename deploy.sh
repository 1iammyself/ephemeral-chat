#!/bin/bash

echo "🚀 Building Ephemeral Chat for production..."

# Install server dependencies
echo "📦 Installing server dependencies..."
npm install

# Install client dependencies
echo "📦 Installing client dependencies..."
cd client && npm install && cd ..

# Build the frontend
echo "🔨 Building frontend..."
npm run build

# Check if build was successful
if [ -d "client/dist" ]; then
    echo "✅ Frontend build successful!"
    echo "📁 Build directory: client/dist"
else
    echo "❌ Frontend build failed!"
    exit 1
fi

echo "🎉 Build complete! Ready for deployment."
echo "📡 Start the server with: npm start" 