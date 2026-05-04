package me.kyere.chat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.play.integrity.IntegrityManager;
import com.google.android.play.integrity.IntegrityManagerFactory;
import com.google.android.play.integrity.IntegrityTokenRequest;
import com.google.android.play.integrity.IntegrityTokenResponse;

@CapacitorPlugin(name = "Integrity")
public class IntegrityPlugin extends Plugin {

    /**
     * Request a Play Integrity token bound to a server-generated nonce.
     *
     * Input:  { nonce: string } — server-generated nonce (base64, 16+ bytes)
     * Output: { token: string } — opaque token to send to server for verification
     */
    @PluginMethod
    public void requestIntegrityToken(PluginCall call) {
        String nonce = call.getString("nonce");
        if (nonce == null || nonce.isEmpty()) {
            call.reject("nonce required");
            return;
        }

        // Mark call as long-lived — Play Integrity uses async Task callbacks
        call.setKeepAlive(true);

        IntegrityManager manager = IntegrityManagerFactory.create(getContext());
        IntegrityTokenRequest request = IntegrityTokenRequest.builder()
                .setNonce(nonce)
                .build();

        manager.requestIntegrityToken(request)
                .addOnSuccessListener(response -> {
                    JSObject result = new JSObject();
                    result.put("token", response.token());
                    call.resolve(result);
                })
                .addOnFailureListener(e ->
                        call.reject("Integrity check failed: " + e.getMessage()));
    }

    /**
     * Convenience method that requests a Play Integrity token with a built-in
     * random nonce.  Intended for UI hints only — server-side trust uses
     * requestIntegrityToken + the /api/integrity/verify endpoint.
     *
     * Output: { token: string }
     * (Server does the actual verdict decoding — do not attempt to decode locally)
     */
    @PluginMethod
    public void getDeviceVerdict(PluginCall call) {
        // Generate a random 24-byte nonce for non-critical / UI-hint use
        byte[] nonceBytes = new byte[24];
        new java.security.SecureRandom().nextBytes(nonceBytes);
        String nonce = android.util.Base64.encodeToString(nonceBytes, android.util.Base64.NO_WRAP);

        // Mark call as long-lived — Play Integrity uses async Task callbacks
        call.setKeepAlive(true);

        IntegrityManager manager = IntegrityManagerFactory.create(getContext());
        IntegrityTokenRequest request = IntegrityTokenRequest.builder()
                .setNonce(nonce)
                .build();

        manager.requestIntegrityToken(request)
                .addOnSuccessListener(response -> {
                    JSObject result = new JSObject();
                    result.put("token", response.token());
                    call.resolve(result);
                })
                .addOnFailureListener(e ->
                        call.reject("Integrity check failed: " + e.getMessage()));
    }
}
