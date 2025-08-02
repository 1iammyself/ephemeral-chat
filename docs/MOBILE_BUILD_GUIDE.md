# Mobile APK Build Guide (Using Bubblewrap)

This guide explains how to generate an Android APK for Ephemeral Chat using Google's Bubblewrap CLI, which is the recommended way to package PWAs as Android apps.

## Prerequisites

1. **Node.js** (v14 or higher)
   - Download from [nodejs.org](https://nodejs.org/)
   - Verify installation: `node --version`

2. **Java Development Kit (JDK) 11**
   - Download from [Adoptium](https://adoptium.net/)
   - Verify installation: `java -version`

3. **Android Command Line Tools**
   - Download from [Android Developers](https://developer.android.com/studio#command-tools)
   - Extract to a known location (e.g., `~/android-sdk`)

4. **Set Environment Variables**
   - `JAVA_HOME`: Path to your JDK installation
   - `ANDROID_HOME`: Path to your Android SDK
   - Add both to your system PATH

## Installation

1. **Install Bubblewrap CLI globally**
   ```bash
   npm install -g @bubblewrap/cli
   ```

2. **Initialize a new project**
   ```bash
   mkdir ephemeral-chat-android
   cd ephemeral-chat-android
   bubblewrap init --manifest=https://your-deployed-app.com/manifest.json
   ```
   
   Replace the URL with your deployed PWA's manifest URL.

## Building the APK

1. **Generate the signing key** (first time only)
   ```bash
   keytool -genkey -v -keystore ./ephemeral-chat.keystore -alias ephemeral-chat -keyalg RSA -keysize 2048 -validity 10000
   ```
   - Store the keystore password and key password securely

2. **Build the APK**
   ```bash
   bubblewrap build --generateAppVersion
   ```
   - This will generate a `app-release-signed.apk` in the `app/release/` directory

## Testing the APK

1. **Install on a device**
   ```bash
   adb install -r app/release/app-release-signed.apk
   ```

2. **Test thoroughly**
   - Verify all PWA features work correctly
   - Test push notifications if implemented
   - Check offline functionality

## Publishing to Google Play Store

1. **Create a Google Play Developer Account**
   - Visit [Google Play Console](https://play.google.com/console/)
   - Pay the one-time $25 registration fee

2. **Prepare store listing**
   - Create app icon (512x512 px)
   - Prepare feature graphic (1024x500 px)
   - Write app description and screenshots

3. **Generate App Bundle (AAB)**
   ```bash
   bubblewrap build --generateAppVersion --aab
   ```

4. **Upload to Play Console**
   - Go to Production → Create new release
   - Upload the generated AAB file
   - Complete content rating and pricing
   - Submit for review

## Troubleshooting

- **Build failures**: Check Java and Android SDK versions
- **Missing features**: Ensure your PWA manifest includes all required permissions
- **Performance issues**: Test on multiple devices and Android versions

## Notes

- Keep your keystore file secure and backed up
- Update your PWA before generating new APK versions
- Follow Google's [PWA Quality Checklist](https://web.dev/pwa-checklist/) for best results