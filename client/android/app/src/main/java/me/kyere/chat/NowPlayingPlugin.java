package me.kyere.chat;

import android.content.ComponentName;
import android.content.Context;
import android.media.session.MediaController;
import android.media.session.MediaSessionManager;
import android.media.MediaMetadata;
import android.media.session.PlaybackState;
import android.os.Build;
import android.provider.Settings;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.JSObject;
import java.util.List;

/**
 * NowPlayingPlugin — Reads system MediaSession metadata to detect
 * what the user is currently listening to (Spotify, YT Music, etc.).
 *
 * Requires NOTIFICATION_LISTENER permission granted by the user.
 * Falls back gracefully to null if permission not granted.
 */
@CapacitorPlugin(name = "NowPlaying")
public class NowPlayingPlugin extends Plugin {

    @PluginMethod()
    public void getStatus(PluginCall call) {
        try {
            Context ctx = getContext();

            // Check if we have notification listener permission
            if (!isNotificationListenerEnabled(ctx)) {
                JSObject result = new JSObject();
                result.put("nowPlaying", JSObject.NULL);
                result.put("permissionNeeded", true);
                call.resolve(result);
                return;
            }

            MediaSessionManager msm = (MediaSessionManager) ctx.getSystemService(Context.MEDIA_SESSION_SERVICE);
            if (msm == null) {
                call.resolve(emptyResult());
                return;
            }

            ComponentName cn = new ComponentName(ctx, NowPlayingNotificationListener.class);
            List<MediaController> controllers = msm.getActiveSessions(cn);

            for (MediaController controller : controllers) {
                PlaybackState state = controller.getPlaybackState();
                if (state == null || state.getState() != PlaybackState.STATE_PLAYING) {
                    continue;
                }

                MediaMetadata metadata = controller.getMetadata();
                if (metadata == null) continue;

                String title = metadata.getString(MediaMetadata.METADATA_KEY_TITLE);
                String artist = metadata.getString(MediaMetadata.METADATA_KEY_ARTIST);
                String pkg = controller.getPackageName();

                if (title == null || title.isEmpty()) continue;

                // Security: truncate metadata to prevent exfiltration of overly-long strings
                title = title.length() > 120 ? title.substring(0, 120) : title;
                if (artist != null) {
                    artist = artist.length() > 80 ? artist.substring(0, 80) : artist;
                }

                // Security: strip any HTML tags from metadata
                title = title.replaceAll("<[^>]*>", "").trim();
                if (artist != null) {
                    artist = artist.replaceAll("<[^>]*>", "").trim();
                }

                String source = "system";
                if (pkg != null) {
                    if (pkg.contains("spotify")) source = "spotify";
                    else if (pkg.contains("youtube")) source = "youtube";
                    else if (pkg.contains("soundcloud")) source = "soundcloud";
                    else if (pkg.contains("apple.music")) source = "apple-music";
                }

                JSObject np = new JSObject();
                np.put("title", title);
                np.put("artist", artist != null ? artist : "");
                np.put("source", source);

                JSObject result = new JSObject();
                result.put("nowPlaying", np);
                result.put("permissionNeeded", false);
                call.resolve(result);
                return;
            }

            call.resolve(emptyResult());

        } catch (SecurityException e) {
            // Permission not granted
            JSObject result = new JSObject();
            result.put("nowPlaying", JSObject.NULL);
            result.put("permissionNeeded", true);
            call.resolve(result);
        } catch (Exception e) {
            call.resolve(emptyResult());
        }
    }

    @PluginMethod()
    public void requestPermission(PluginCall call) {
        try {
            Context ctx = getContext();
            if (!isNotificationListenerEnabled(ctx)) {
                android.content.Intent intent = new android.content.Intent(
                    Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS
                );
                intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(intent);
            }
            JSObject result = new JSObject();
            result.put("opened", true);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Failed to open permission settings", e);
        }
    }

    private boolean isNotificationListenerEnabled(Context ctx) {
        String pkgName = ctx.getPackageName();
        String flat = Settings.Secure.getString(
            ctx.getContentResolver(),
            "enabled_notification_listeners"
        );
        return flat != null && flat.contains(pkgName);
    }

    private JSObject emptyResult() {
        JSObject result = new JSObject();
        result.put("nowPlaying", JSObject.NULL);
        result.put("permissionNeeded", false);
        return result;
    }
}
