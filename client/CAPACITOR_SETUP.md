Capacitor setup for Ephemeral Chat

This file documents the steps to wrap the existing web app with Capacitor and produce an Android APK that supports FLAG_SECURE (screenshot blocking).

Prereqs (local machine):
- Node.js and npm installed
- Java JDK 17+ installed and JAVA_HOME set
- Android SDK + Android Studio (command-line tools) installed
- Android emulator or device for testing

High-level steps:
1. Build the web app
   - cd client
   - npm ci
   - npm run build

2. Install and initialize Capacitor
   - cd client
   - npm install @capacitor/core @capacitor/cli --save
   - npx cap init "Ephchat" "me.kyere.chat" --web-dir=dist

3. Add Android platform
   - npx cap add android

4. Copy web assets and open Android project
   - npx cap copy android
   - npx cap open android

5. Add FLAG_SECURE (prevent screenshots)
   - Open Android project in Android Studio (or edit files by hand)
   - In `android/app/src/main/java/<your/package>/MainActivity.java` add inside onCreate or onStart:

     getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE);

   - Save and rebuild.

6. Build APK
   - From Android Studio: Build > Build Bundle(s) / APK(s) > Build APK(s)
   - Or from command-line:

     cd android
     ./gradlew assembleDebug

Troubleshooting: Gradle download failures
- If the Gradle wrapper times out downloading the distribution, see `GRADLE_OFFLINE.md` for an offline workaround (manually download and drop the Gradle ZIP into the wrapper cache).

Notes:
- A Capacitor-based app will not show a browser URL bar and will be a proper native app.
- Assetlinks/verification: Capacitor apps are not TWA. If you need Digital Asset Links for authentication with the browser, you'll lose the TWA automatic verification behavior.
- You retain your React UI unchanged; Capacitor hosts it in a native WebView.

Security plugin options:
- You can implement FLAG_SECURE directly in `MainActivity` (recommended).
- There are community plugins to prevent screenshots; alternatively add native code for full control.

If you want, I can generate a starter Capacitor configuration and a small script to automate these steps locally. I cannot run npm install or Gradle downloads here without network access, but the script will run on your machine.
