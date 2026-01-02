import { registerSW } from 'virtual:pwa-register';

// Check that service workers are supported
if ('serviceWorker' in navigator) {
  // Wait for the 'load' event to not block other work
  window.addEventListener('load', async () => {
    try {
      const updateSW = registerSW({
        onNeedRefresh() {
          if (confirm('New content available! Reload to update?')) {
            updateSW(true);
          }
        },
        onOfflineReady() {
          console.log('App ready to work offline');
        },
        onRegisterError(error) {
          console.error('Error during service worker registration:', error);
        },
      });
    } catch (e) {
      console.error('Error registering service worker:', e);
    }
  });
}
