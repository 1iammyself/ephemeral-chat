import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'me.kyere.chat',
  appName: 'Ephemeral Chat',
  webDir: 'dist',
  server: {
    // Use the production URL
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
    // Enable mixed content for WebSocket connections
    allowMixedContent: false,
    // Use Chrome WebView
    useLegacyBridge: false
  },
  ios: {
    // iOS-specific configuration
    contentInset: 'automatic',
    // Allow inline media playback (required for Watch Party sync)
    allowsLinkPreview: false,
    // Scroll to input to prevent keyboard covering input fields
    scrollEnabled: true,
    // IMPORTANT: Must be false when using allowNavigation for embeds.
    // If true, WKWebView blocks all navigations outside the app domain,
    // which kills YouTube/SoundCloud iframe embeds.
    limitsNavigationsToAppBoundDomains: false
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#4F46E5',
      showSpinner: false
    }
  }
};

export default config;
