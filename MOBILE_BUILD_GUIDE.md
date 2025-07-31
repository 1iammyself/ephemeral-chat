# Mobile APK Build Guide

## Prerequisites

### 1. Install Android Studio
- Download and install [Android Studio](https://developer.android.com/studio)
- Install Android SDK (API level 33 or higher)
- Set up Android Virtual Device (AVD) for testing

### 2. Install Capacitor Dependencies
```bash
cd client
npm install @capacitor/core @capacitor/cli @capacitor/android
```

### 3. Set Environment Variables
Add to your system PATH:
- `ANDROID_HOME` - Path to Android SDK
- `ANDROID_SDK_ROOT` - Path to Android SDK

## Build Steps

### Step 1: Initialize Capacitor
```bash
cd client
npx cap init "Ephemeral Chat" "com.ephemeralchat.app"
```

### Step 2: Add Android Platform
```bash
npx cap add android
```

### Step 3: Build the Web App
```bash
npm run build
```

### Step 4: Sync with Native Project
```bash
npx cap sync
```

### Step 5: Open in Android Studio
```bash
npx cap open android
```

### Step 6: Build APK
In Android Studio:
1. Go to `Build` → `Build Bundle(s) / APK(s)` → `Build APK(s)`
2. Or use command line: `cd android && ./gradlew assembleDebug`

## Alternative: Quick Build Script

Run this command to build APK directly:
```bash
cd client
npm run android:build-apk
```

## APK Location
The generated APK will be in:
```
client/android/app/build/outputs/apk/debug/app-debug.apk
```

## Important Notes

### Server Configuration
For mobile app, you'll need to update the server URL in `client/src/socket.js`:

```javascript
const SERVER_URL = 'https://ephemeral-chat-7j66.onrender.com';
```

### Permissions
The app will need these permissions in `android/app/src/main/AndroidManifest.xml`:
- Internet access
- Network state

### Testing
- Use Android Studio's AVD for testing
- Or install APK on physical device (enable "Install from unknown sources")

## Troubleshooting

### Common Issues:
1. **Gradle sync failed**: Update Android Studio and SDK
2. **Build failed**: Check Java version (use JDK 17)
3. **APK not installing**: Enable "Install from unknown sources" on device

### Commands for Debugging:
```bash
# Check Capacitor status
npx cap doctor

# Clean and rebuild
cd android && ./gradlew clean && ./gradlew assembleDebug

# Check Android SDK
sdkmanager --list
```

## Distribution

### Debug APK
- Use for testing
- Larger file size
- Can be installed directly

### Release APK
For production release:
1. Generate keystore
2. Configure signing in `android/app/build.gradle`
3. Run `./gradlew assembleRelease`

## Next Steps
- Test the APK on different devices
- Optimize for mobile performance
- Add mobile-specific features (push notifications, etc.)
- Consider publishing to Google Play Store 