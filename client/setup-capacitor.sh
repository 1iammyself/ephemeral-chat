#!/usr/bin/env bash
set -euo pipefail

# setup-capacitor.sh
# Usage: run from repository root. This script automates local steps to initialize Capacitor
# and prepare the Android project. It does NOT run the Gradle build (may need offline Gradle).

ROOT="$(pwd)"
CLIENT_DIR="$ROOT/client"

echo "1) Ensure you built the web app (client/dist)"
cd "$CLIENT_DIR"
if [ ! -d dist ]; then
  echo "Running npm install and build in client/"
  npm ci
  npm run build
else
  echo "Existing dist/ found. If stale, remove and run: npm ci && npm run build"
fi

echo "2) Install Capacitor CLI (locally)"
# Install only if not present
if ! npm ls @capacitor/cli >/dev/null 2>&1; then
  npm install @capacitor/core @capacitor/cli --save
fi

# Initialize Capacitor project if needed
if [ ! -d android ] || [ ! -f android/gradlew ]; then
  echo "Initializing Capacitor project"
  npx cap init "Ephchat" "me.kyere.chat" --web-dir=dist || true
  # Add Android
  npx cap add android || true
fi

echo "3) Copy web assets to native projects"
npx cap copy android

cat <<'EOF'
4) Next steps (run locally):
   - Open the Android project in Android Studio: npx cap open android
   - Edit MainActivity.java and add inside onCreate():
       getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE);
   - Build from Android Studio or run: ./gradlew assembleDebug

Gradle download issues:
   - If the Gradle wrapper fails to download, see GRADLE_OFFLINE.md for a manual workaround.
   - You can also try increasing the socket timeout before building:
       export GRADLE_OPTS="-Dorg.gradle.internal.http.socketTimeout=60000 -Dhttp.socketTimeout=60000"
     then run ./gradlew assembleDebug again.
EOF

echo "Script finished. Open the Android project to add FLAG_SECURE and sign/build."