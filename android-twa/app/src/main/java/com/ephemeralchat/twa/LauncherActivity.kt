package com.ephemeralchat.twa

import android.net.Uri
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import androidx.browser.customtabs.CustomTabsIntent

/**
 * Minimal Trusted Web Activity launcher.
 *
 * For a full “no browser UI” experience, your site must be verified via Digital Asset Links.
 */
class LauncherActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val launchUri = Uri.parse(BuildConfig.TWA_LAUNCH_URL)

        // Use a stable Custom Tab launch.
        // Once Digital Asset Links are set up, you can switch back to a full TWA launch.
        val intent = CustomTabsIntent.Builder()
            .setShowTitle(false)
            .build()

        intent.launchUrl(this, launchUri)
        finish()
    }
}
