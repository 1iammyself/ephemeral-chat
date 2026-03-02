package me.kyere.chat;

import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

/**
 * Minimal NotificationListenerService required for MediaSessionManager
 * to grant us access to active media sessions.
 *
 * The user must enable this service in
 * Settings → Notification access → Ephemeral Chat.
 */
public class NowPlayingNotificationListener extends NotificationListenerService {

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        // no-op — we only need this service registered so
        // MediaSessionManager.getActiveSessions() works
    }

    @Override
    public void onNotificationRemoved(StatusBarNotification sbn) {
        // no-op
    }
}
