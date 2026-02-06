import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'me.kyere.chat',
  appName: 'Ephemeral Chat',
  webDir: 'dist',
  server: {
    // Use the production URL
    url: 'https://chat.kyere.me',
    cleartext: false
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
    // Allow inline media playback
    allowsLinkPreview: false,
    // Scroll to input to prevent keyboard covering input fields
    scrollEnabled: true,
    // Disable long-press link previews for privacy
    limitsNavigationsToAppBoundDomains: true
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
