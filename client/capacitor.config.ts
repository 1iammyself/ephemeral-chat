import type { CapacitorConfig } from '@capacitor/cli';
import { KeyboardResize } from '@capacitor/keyboard';

const config: CapacitorConfig = {
  appId: 'me.kyere.chat',
  appName: 'Ephemeral Chat',
  webDir: 'dist',
  server: {
    cleartext: false,
    // Allow YouTube embeds for Watch Party feature
    allowNavigation: [
      'https://*.youtube.com',
      'https://*.youtube-nocookie.com',
      'https://*.soundcloud.com',
      'https://*.sndcdn.com',
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
    Keyboard: {
      resize: KeyboardResize.Body,
      resizeOnFullScreen: true
    },
    SplashScreen: {
      launchShowDuration: 0,
      launchAutoHide: true,
      showSpinner: false
    },
    // Deep-link handling via @capacitor/app
    // When the OS opens chat.kyere.me links, Capacitor routes them here.
    // The App plugin's 'appUrlOpen' event fires in App.tsx / main.tsx with the full URL.
  }
};

export default config;
