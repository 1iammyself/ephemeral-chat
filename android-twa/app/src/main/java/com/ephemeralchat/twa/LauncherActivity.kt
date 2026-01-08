package com.ephemeralchat.twa

import android.net.Uri
import android.os.Bundle
import com.ephemeralchat.twa.BuildConfig
import androidx.appcompat.app.AppCompatActivity
import androidx.browser.customtabs.CustomTabsClient
import androidx.browser.customtabs.CustomTabsServiceConnection
import androidx.browser.customtabs.CustomTabsSession
import androidx.browser.customtabs.CustomTabsCallback
import androidx.browser.trusted.TrustedWebActivityIntentBuilder
import androidx.browser.trusted.TrustedWebActivityIntent

/**
 * Minimal Trusted Web Activity launcher.
 *
 * For a full “no browser UI” experience, your site must be verified via Digital Asset Links.
 */
class LauncherActivity : AppCompatActivity() {

    private var customTabsSession: CustomTabsSession? = null

    private val connection = object : CustomTabsServiceConnection() {
        override fun onCustomTabsServiceConnected(name: android.content.ComponentName, client: CustomTabsClient) {
            // Warm up / create a session; required for some TWA builder overloads.
            client.warmup(0L)
            customTabsSession = client.newSession(CustomTabsCallback())

            launchTwaIfPossible()
        }

        override fun onServiceDisconnected(name: android.content.ComponentName) {
            customTabsSession = null
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Bind Custom Tabs so we can create a session for TWA.
        // This avoids the overload mismatch you hit previously.
        val ok = CustomTabsClient.bindCustomTabsService(
            this,
            "com.android.chrome",
            connection
        )

        // If Chrome isn't available, we can't do a verified TWA. Close the activity.
        if (!ok) {
            finish()
        }
    }

    private fun launchTwaIfPossible() {
        val session = customTabsSession ?: return
        val launchUri = Uri.parse(BuildConfig.TWA_LAUNCH_URL)

        val twaIntent: TrustedWebActivityIntent = TrustedWebActivityIntentBuilder(launchUri)
            .build(session)

        twaIntent.launchTrustedWebActivity(this)
        finish()
    }

    override fun onDestroy() {
        try {
            unbindService(connection)
        } catch (_: IllegalArgumentException) {
            // Ignore if we were never bound.
        }
        super.onDestroy()
    }
}
