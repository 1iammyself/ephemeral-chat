package me.kyere.chat;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * RootDetectionPlugin — exposes RootTamperCheck to JavaScript.
 *
 * JS calls RootDetection.check() on app launch and on every resume.
 * If the device is compromised the process is killed before resolve() is
 * called — the JS promise simply never settles on a bad device.
 * If the device is clean, resolve() is called with no payload.
 */
@CapacitorPlugin(name = "RootDetection")
public class RootDetectionPlugin extends Plugin {

    @PluginMethod
    public void check(PluginCall call) {
        new Thread(() -> {
            boolean compromised = RootTamperCheck.isCompromised(getContext());
            if (compromised) {
                getActivity().runOnUiThread(() -> {
                    getActivity().finishAndRemoveTask();
                    android.os.Process.killProcess(android.os.Process.myPid());
                });
                // Process is being killed — do not settle the call
            } else {
                call.resolve();
            }
        }).start();
    }
}
