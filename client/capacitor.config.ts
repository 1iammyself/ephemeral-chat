import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'me.kyere.chat',
  appName: 'Ephemeral Chat',
  webDir: 'dist',
  server: {
    // Use the production URL — also enables Android App Links verification
    url: 'https://chat.kyere.me',
    cleartext: false,
    // Allow YouTube and SoundCloud embeds for Watch Party feature
    allowNavigation: [
      'https://*.youtube.com',
      'https://*.youtube-nocookie.com',
      'https://*.soundcloud.com',
      'https://w.soundcloud.com',
    ]
  },
  android: {
    allowMixedContent: false,
    useLegacyBridge: false,
    // Deep Link / App Links: intercept chat.kyere.me URLs in the installed app.
    // The server must serve /.well-known/assetlinks.json with the app's fingerprint.
    appendUserAgent: 'EphemeralChatApp',
  },
  ios: {
    contentInset: 'automatic',
    allowsLinkPreview: false,
    scrollEnabled: true,
    limitsNavigationsToAppBoundDomains: false,
    // Universal Links: add your app domains — requires apple-app-site-association on server.
    appendUserAgent: 'EphemeralChatApp',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#4F46E5',
      showSpinner: false
    },
    // Deep-link handling via @capacitor/app
    // When the OS opens chat.kyere.me links, Capacitor routes them here.
    // The App plugin's 'appUrlOpen' event fires in App.tsx / main.tsx with the full URL.
  }
};

export default config;
