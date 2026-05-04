package me.kyere.chat;

import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;

import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.security.InvalidAlgorithmParameterException;
import java.security.NoSuchAlgorithmException;
import java.security.NoSuchProviderException;

import javax.crypto.KeyGenerator;

@CapacitorPlugin(name = "Biometric")
public class BiometricPlugin extends Plugin {

    @PluginMethod
    public void isAvailable(PluginCall call) {
        int result = BiometricManager.from(getContext())
                .canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG);

        JSObject r = new JSObject();
        if (result == BiometricManager.BIOMETRIC_SUCCESS) {
            r.put("available", true);
        } else {
            r.put("available", false);
            switch (result) {
                case BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED:
                    r.put("reason", "NONE_ENROLLED");
                    break;
                case BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE:
                    r.put("reason", "NO_HARDWARE");
                    break;
                case BiometricManager.BIOMETRIC_ERROR_UNSUPPORTED:
                    r.put("reason", "UNSUPPORTED");
                    break;
                case BiometricManager.BIOMETRIC_ERROR_SECURITY_UPDATE_REQUIRED:
                    r.put("reason", "SECURITY_UPDATE_REQUIRED");
                    break;
                default:
                    r.put("reason", "UNSUPPORTED");
                    break;
            }
        }
        call.resolve(r);
    }

    @PluginMethod
    public void authenticate(PluginCall call) {
        String title       = call.getString("title", "Authenticate");
        String subtitle    = call.getString("subtitle", "");
        String cancelLabel = call.getString("cancelLabel", "Cancel");

        call.setKeepAlive(true);

        getActivity().runOnUiThread(() -> {
            BiometricPrompt.PromptInfo promptInfo = new BiometricPrompt.PromptInfo.Builder()
                    .setTitle(title)
                    .setSubtitle(subtitle)
                    .setNegativeButtonText(cancelLabel)
                    .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
                    .build();

            BiometricPrompt biometricPrompt = new BiometricPrompt(
                    getActivity(),
                    ContextCompat.getMainExecutor(getContext()),
                    new BiometricPrompt.AuthenticationCallback() {
                        @Override
                        public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                            JSObject r = new JSObject();
                            r.put("success", true);
                            call.resolve(r);
                        }

                        @Override
                        public void onAuthenticationError(int errorCode, CharSequence errString) {
                            JSObject r = new JSObject();
                            r.put("success", false);
                            r.put("errorCode", String.valueOf(errorCode));
                            r.put("error", errString != null ? errString.toString() : "Authentication error");
                            call.resolve(r);
                        }

                        @Override
                        public void onAuthenticationFailed() {
                            // BiometricPrompt handles retry UI — do not resolve/reject here
                        }
                    }
            );

            biometricPrompt.authenticate(promptInfo);
        });
    }

    @PluginMethod
    public void generateBiometricBoundKey(PluginCall call) {
        String keyAlias = call.getString("keyAlias");
        if (keyAlias == null || keyAlias.isEmpty()) {
            call.reject("keyAlias is required");
            return;
        }

        try {
            KeyGenParameterSpec spec = new KeyGenParameterSpec.Builder(
                    keyAlias,
                    KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
            )
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setKeySize(256)
                    .setUserAuthenticationRequired(true)
                    .setUserAuthenticationValidityDurationSeconds(-1)
                    .setUnlockedDeviceRequired(true)
                    .build();

            KeyGenerator keyGen = KeyGenerator.getInstance(
                    KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            keyGen.init(spec);
            keyGen.generateKey();

            JSObject r = new JSObject();
            r.put("success", true);
            call.resolve(r);
        } catch (NoSuchAlgorithmException | NoSuchProviderException
                 | InvalidAlgorithmParameterException e) {
            String msg = e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName();
            call.reject("Failed to generate biometric-bound key: " + msg);
        }
    }
}
