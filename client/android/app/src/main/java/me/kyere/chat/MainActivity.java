package me.kyere.chat;

import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Root/tamper detection — runs before the Capacitor bridge or WebView initialise.
        // Socket I/O (Frida port check) requires a background thread.
        final boolean[] compromised = {false};
        Thread detectionThread = new Thread(() ->
            compromised[0] = RootTamperCheck.isCompromised(getApplicationContext())
        );
        detectionThread.start();
        try { detectionThread.join(600); } catch (InterruptedException ignored) {}

        if (compromised[0]) {
            finishAndRemoveTask();
            android.os.Process.killProcess(android.os.Process.myPid());
            return;
        }

        // Register Capacitor plugins before super.onCreate
        registerPlugin(ProximityPlugin.class);
        registerPlugin(NowPlayingPlugin.class);
        registerPlugin(BiometricPlugin.class);
        registerPlugin(KeystorePlugin.class);
        registerPlugin(IntegrityPlugin.class);
        
        super.onCreate(savedInstanceState);
        
        // Block screenshots and screen recording
        getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_SECURE,
            WindowManager.LayoutParams.FLAG_SECURE
        );

        // Allow inline media playback without user gesture (needed for
        // Watch Party sync — when another user presses play, the sync
        // event must be able to auto-play the video on this device)
        WebView webView = getBridge().getWebView();
        if (webView != null) {
            WebSettings settings = webView.getSettings();
            settings.setMediaPlaybackRequiresUserGesture(false);
            // Allow third-party cookies for YouTube embeds
            android.webkit.CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);
        }
    }
}
