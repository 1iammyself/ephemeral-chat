package me.kyere.chat;

import android.content.Context;
import android.content.pm.PackageManager;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;
import java.net.InetSocketAddress;
import java.net.Socket;

/**
 * RootTamperCheck — device integrity checks for release builds.
 *
 * Detects active instrumentation (Frida), root frameworks (Magisk / KernelSU / APatch),
 * Xposed, and su binaries. All checks are file-system or loopback-socket based so they
 * work correctly for sideloaded release APKs (Play Integrity would flag those as
 * unverified regardless of device state and is NOT used here).
 *
 * Call isCompromised() from a background thread — isFridaActive() opens sockets.
 */
final class RootTamperCheck {

    private RootTamperCheck() {}

    /**
     * Returns true if any integrity check fires.
     * Must NOT be called on the main thread (socket I/O).
     */
    static boolean isCompromised(Context ctx) {
        return isFridaActive()
            || isMapsContaminated()
            || isMagiskPresent()
            || isSystemMountedRw()
            || isXposedPresent()
            || isRootPackageInstalled(ctx)
            || isSuBinaryPresent();
    }

    // ── Frida ────────────────────────────────────────────────────────────────

    // Frida Server listens on 27042 (default) or 27043 when the default is taken.
    // Connecting succeeds only if the server is actually running — negligible FP risk.
    private static boolean isFridaActive() {
        int[] ports = {27042, 27043};
        for (int port : ports) {
            try (Socket s = new Socket()) {
                s.connect(new InetSocketAddress("127.0.0.1", port), 80);
                return true;
            } catch (Exception ignored) {}
        }
        return false;
    }

    // Frida Gadget or an Xposed module injected as a shared library shows up here.
    private static boolean isMapsContaminated() {
        try (BufferedReader br = new BufferedReader(new FileReader("/proc/self/maps"))) {
            String line;
            while ((line = br.readLine()) != null) {
                String l = line.toLowerCase();
                if (l.contains("frida") || l.contains("gadget") || l.contains("xposed")) {
                    return true;
                }
            }
        } catch (Exception ignored) {}
        return false;
    }

    // ── Root frameworks ──────────────────────────────────────────────────────

    private static boolean isMagiskPresent() {
        // /data/adb/* and /sbin/* are blocked by SELinux on Android 9+ so we
        // target paths that a normal app context can actually stat.
        String[] paths = {
            "/system/app/MagiskManager.apk",        // legacy system-mode install
            "/system/priv-app/MagiskManager.apk",
            "/system/app/SuperSU.apk",
            "/system/xbin/daemonsu",                // SuperSU daemon
            "/system/xbin/sugote",
            "/system/bin/.ext/.su",
            "/system/usr/we-need-root/su-backup",
            "/dev/magisk",                           // Magisk daemon socket (sometimes accessible)
        };
        for (String path : paths) {
            if (new File(path).exists()) return true;
        }
        return false;
    }

    // /system mounted rw means the system partition has been modified.
    // On Android 10+ with Project Treble this should never be true on stock firmware.
    private static boolean isSystemMountedRw() {
        try (BufferedReader br = new BufferedReader(new FileReader("/proc/mounts"))) {
            String line;
            while ((line = br.readLine()) != null) {
                // Each line: device mountpoint fstype options ...
                String[] parts = line.split("\\s+");
                if (parts.length >= 4
                        && "/system".equals(parts[1])
                        && parts[3].startsWith("rw")) {
                    return true;
                }
            }
        } catch (Exception ignored) {}
        return false;
    }

    // ── Xposed / LSPosed ─────────────────────────────────────────────────────

    private static boolean isXposedPresent() {
        try {
            Class.forName("de.robv.android.xposed.XposedBridge");
            return true;
        } catch (ClassNotFoundException ignored) {
            return false;
        }
    }

    // ── Root management apps ─────────────────────────────────────────────────

    private static final String[] ROOT_PACKAGES = {
        "com.topjohnwu.magisk",           // Magisk Manager
        "eu.chainfire.supersu",            // SuperSU
        "com.noshufou.android.su",         // Superuser
        "com.koushikdutta.superuser",      // CWM Superuser
        "com.thirdparty.superuser",
        "com.yellowes.su",
        "me.weishu.kernelflasher",         // KernelFlasher
        "org.lsposed.manager",             // LSPosed Manager
        "de.robv.android.xposed.installer",// Xposed Installer
    };

    private static boolean isRootPackageInstalled(Context ctx) {
        PackageManager pm = ctx.getPackageManager();
        for (String pkg : ROOT_PACKAGES) {
            try {
                pm.getPackageInfo(pkg, 0);
                return true;
            } catch (PackageManager.NameNotFoundException ignored) {}
        }
        return false;
    }

    // ── su binary ────────────────────────────────────────────────────────────

    private static boolean isSuBinaryPresent() {
        String[] paths = {
            "/system/bin/su",
            "/system/xbin/su",
            "/sbin/su",
            "/vendor/bin/su",
            "/data/local/xbin/su",
            "/data/local/bin/su",
            "/data/local/su",
            "/system/sd/xbin/su",
            "/system/bin/failsafe/su",
        };
        for (String path : paths) {
            if (new File(path).exists()) return true;
        }
        return false;
    }
}
