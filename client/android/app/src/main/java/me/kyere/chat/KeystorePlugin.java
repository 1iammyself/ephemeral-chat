package me.kyere.chat;

import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.security.InvalidAlgorithmParameterException;
import java.security.InvalidKeyException;
import java.security.KeyStore;
import java.security.KeyStoreException;
import java.security.NoSuchAlgorithmException;
import java.security.NoSuchProviderException;
import java.security.PrivateKey;
import java.security.SecureRandom;
import java.security.Signature;
import java.security.SignatureException;
import java.security.UnrecoverableEntryException;
import java.security.cert.CertificateException;

import javax.crypto.BadPaddingException;
import javax.crypto.Cipher;
import javax.crypto.IllegalBlockSizeException;
import javax.crypto.KeyGenerator;
import javax.crypto.NoSuchPaddingException;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(name = "Keystore")
public class KeystorePlugin extends Plugin {

    private static final String KEYSTORE_PROVIDER = "AndroidKeyStore";
    private static final String AES_GCM_CIPHER = "AES/GCM/NoPadding";
    private static final int GCM_TAG_LENGTH_BITS = 128;
    private static final int GCM_IV_LENGTH_BYTES = 12;

    // ─── generateKey ────────────────────────────────────────────────────────────

    @PluginMethod
    public void generateKey(PluginCall call) {
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
                    .setUserAuthenticationRequired(false)
                    .setUnlockedDeviceRequired(true)
                    .build();

            KeyGenerator keyGen = KeyGenerator.getInstance(
                    KeyProperties.KEY_ALGORITHM_AES, KEYSTORE_PROVIDER);
            keyGen.init(spec);
            keyGen.generateKey();

            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);
        } catch (NoSuchAlgorithmException e) {
            call.reject("Algorithm not supported: " + messageOf(e));
        } catch (NoSuchProviderException e) {
            call.reject("KeyStore provider not available: " + messageOf(e));
        } catch (InvalidAlgorithmParameterException e) {
            call.reject("Invalid key generation parameters: " + messageOf(e));
        }
    }

    // ─── encrypt ────────────────────────────────────────────────────────────────

    @PluginMethod
    public void encrypt(PluginCall call) {
        String keyAlias = call.getString("keyAlias");
        if (keyAlias == null || keyAlias.isEmpty()) {
            call.reject("keyAlias is required");
            return;
        }
        String plaintextB64 = call.getString("plaintext");
        if (plaintextB64 == null) {
            call.reject("plaintext is required");
            return;
        }

        try {
            byte[] plaintextBytes = Base64.decode(plaintextB64, Base64.DEFAULT);

            KeyStore keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER);
            keyStore.load(null);
            SecretKey key = (SecretKey) keyStore.getKey(keyAlias, null);
            if (key == null) {
                call.reject("Key not found for alias: " + keyAlias);
                return;
            }

            byte[] iv = new byte[GCM_IV_LENGTH_BYTES];
            new SecureRandom().nextBytes(iv);

            Cipher cipher = Cipher.getInstance(AES_GCM_CIPHER);
            cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(GCM_TAG_LENGTH_BITS, iv));
            byte[] ciphertext = cipher.doFinal(plaintextBytes);

            JSObject result = new JSObject();
            result.put("ciphertext", Base64.encodeToString(ciphertext, Base64.DEFAULT));
            result.put("iv", Base64.encodeToString(iv, Base64.DEFAULT));
            call.resolve(result);
        } catch (KeyStoreException e) {
            call.reject("KeyStore error during encrypt: " + messageOf(e));
        } catch (CertificateException e) {
            call.reject("Certificate error loading KeyStore: " + messageOf(e));
        } catch (NoSuchAlgorithmException e) {
            call.reject("Algorithm not supported: " + messageOf(e));
        } catch (java.io.IOException e) {
            call.reject("IO error loading KeyStore: " + messageOf(e));
        } catch (UnrecoverableEntryException e) {
            call.reject("Unable to recover key from KeyStore: " + messageOf(e));
        } catch (NoSuchPaddingException e) {
            call.reject("Padding scheme not available: " + messageOf(e));
        } catch (InvalidKeyException e) {
            call.reject("Invalid key for encryption: " + messageOf(e));
        } catch (InvalidAlgorithmParameterException e) {
            call.reject("Invalid algorithm parameters for encryption: " + messageOf(e));
        } catch (IllegalBlockSizeException e) {
            call.reject("Illegal block size during encryption: " + messageOf(e));
        } catch (BadPaddingException e) {
            call.reject("Bad padding during encryption: " + messageOf(e));
        }
    }

    // ─── decrypt ────────────────────────────────────────────────────────────────

    @PluginMethod
    public void decrypt(PluginCall call) {
        String keyAlias = call.getString("keyAlias");
        if (keyAlias == null || keyAlias.isEmpty()) {
            call.reject("keyAlias is required");
            return;
        }
        String ciphertextB64 = call.getString("ciphertext");
        if (ciphertextB64 == null) {
            call.reject("ciphertext is required");
            return;
        }
        String ivB64 = call.getString("iv");
        if (ivB64 == null) {
            call.reject("iv is required");
            return;
        }

        try {
            byte[] ciphertextBytes = Base64.decode(ciphertextB64, Base64.DEFAULT);
            byte[] ivBytes = Base64.decode(ivB64, Base64.DEFAULT);

            KeyStore keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER);
            keyStore.load(null);
            SecretKey key = (SecretKey) keyStore.getKey(keyAlias, null);
            if (key == null) {
                call.reject("Key not found for alias: " + keyAlias);
                return;
            }

            Cipher cipher = Cipher.getInstance(AES_GCM_CIPHER);
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(GCM_TAG_LENGTH_BITS, ivBytes));
            byte[] plaintext = cipher.doFinal(ciphertextBytes);

            JSObject result = new JSObject();
            result.put("plaintext", Base64.encodeToString(plaintext, Base64.DEFAULT));
            call.resolve(result);
        } catch (KeyStoreException e) {
            call.reject("KeyStore error during decrypt: " + messageOf(e));
        } catch (CertificateException e) {
            call.reject("Certificate error loading KeyStore: " + messageOf(e));
        } catch (NoSuchAlgorithmException e) {
            call.reject("Algorithm not supported: " + messageOf(e));
        } catch (java.io.IOException e) {
            call.reject("IO error loading KeyStore: " + messageOf(e));
        } catch (UnrecoverableEntryException e) {
            call.reject("Unable to recover key from KeyStore: " + messageOf(e));
        } catch (NoSuchPaddingException e) {
            call.reject("Padding scheme not available: " + messageOf(e));
        } catch (InvalidKeyException e) {
            call.reject("Invalid key for decryption: " + messageOf(e));
        } catch (InvalidAlgorithmParameterException e) {
            call.reject("Invalid algorithm parameters for decryption: " + messageOf(e));
        } catch (IllegalBlockSizeException e) {
            call.reject("Illegal block size during decryption: " + messageOf(e));
        } catch (BadPaddingException e) {
            call.reject("Bad padding during decryption (wrong key or corrupted data): " + messageOf(e));
        }
    }

    // ─── deleteKey ──────────────────────────────────────────────────────────────

    @PluginMethod
    public void deleteKey(PluginCall call) {
        String keyAlias = call.getString("keyAlias");
        if (keyAlias == null || keyAlias.isEmpty()) {
            call.reject("keyAlias is required");
            return;
        }

        try {
            KeyStore keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER);
            keyStore.load(null);

            // Idempotent: no-op if key doesn't exist
            if (keyStore.containsAlias(keyAlias)) {
                keyStore.deleteEntry(keyAlias);
            }

            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);
        } catch (KeyStoreException e) {
            call.reject("KeyStore error during deleteKey: " + messageOf(e));
        } catch (CertificateException e) {
            call.reject("Certificate error loading KeyStore: " + messageOf(e));
        } catch (NoSuchAlgorithmException e) {
            call.reject("Algorithm not supported: " + messageOf(e));
        } catch (java.io.IOException e) {
            call.reject("IO error loading KeyStore: " + messageOf(e));
        }
    }

    // ─── keyExists ──────────────────────────────────────────────────────────────

    @PluginMethod
    public void keyExists(PluginCall call) {
        String keyAlias = call.getString("keyAlias");
        if (keyAlias == null || keyAlias.isEmpty()) {
            call.reject("keyAlias is required");
            return;
        }

        try {
            KeyStore keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER);
            keyStore.load(null);
            boolean exists = keyStore.containsAlias(keyAlias);

            JSObject result = new JSObject();
            result.put("exists", exists);
            call.resolve(result);
        } catch (KeyStoreException e) {
            call.reject("KeyStore error during keyExists: " + messageOf(e));
        } catch (CertificateException e) {
            call.reject("Certificate error loading KeyStore: " + messageOf(e));
        } catch (NoSuchAlgorithmException e) {
            call.reject("Algorithm not supported: " + messageOf(e));
        } catch (java.io.IOException e) {
            call.reject("IO error loading KeyStore: " + messageOf(e));
        }
    }

    // ─── sign ───────────────────────────────────────────────────────────────────

    @PluginMethod
    public void sign(PluginCall call) {
        String keyAlias = call.getString("keyAlias");
        if (keyAlias == null || keyAlias.isEmpty()) {
            call.reject("keyAlias is required");
            return;
        }
        String dataB64 = call.getString("data");
        if (dataB64 == null) {
            call.reject("data is required");
            return;
        }

        try {
            byte[] dataBytes = Base64.decode(dataB64, Base64.DEFAULT);

            KeyStore keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER);
            keyStore.load(null);
            KeyStore.Entry entry = keyStore.getEntry(keyAlias, null);

            if (!(entry instanceof KeyStore.PrivateKeyEntry)) {
                call.reject("Key not found or not a signing key for alias: " + keyAlias);
                return;
            }

            PrivateKey privateKey = ((KeyStore.PrivateKeyEntry) entry).getPrivateKey();
            String keyAlgorithm = privateKey.getAlgorithm();
            String sigAlgorithm = keyAlgorithm.contains("EC") ? "SHA256withECDSA" : "SHA256withRSA";

            Signature sig = Signature.getInstance(sigAlgorithm);
            sig.initSign(privateKey);
            sig.update(dataBytes);
            byte[] signature = sig.sign();

            JSObject result = new JSObject();
            result.put("signature", Base64.encodeToString(signature, Base64.DEFAULT));
            call.resolve(result);
        } catch (KeyStoreException e) {
            call.reject("KeyStore error during sign: " + messageOf(e));
        } catch (CertificateException e) {
            call.reject("Certificate error loading KeyStore: " + messageOf(e));
        } catch (NoSuchAlgorithmException e) {
            call.reject("Algorithm not supported: " + messageOf(e));
        } catch (java.io.IOException e) {
            call.reject("IO error loading KeyStore: " + messageOf(e));
        } catch (UnrecoverableEntryException e) {
            call.reject("Unable to recover key from KeyStore: " + messageOf(e));
        } catch (InvalidKeyException e) {
            call.reject("Invalid key for signing: " + messageOf(e));
        } catch (SignatureException e) {
            call.reject("Signature operation failed: " + messageOf(e));
        }
    }

    // ─── verify ─────────────────────────────────────────────────────────────────

    @PluginMethod
    public void verify(PluginCall call) {
        String keyAlias = call.getString("keyAlias");
        if (keyAlias == null || keyAlias.isEmpty()) {
            call.reject("keyAlias is required");
            return;
        }
        String dataB64 = call.getString("data");
        if (dataB64 == null) {
            call.reject("data is required");
            return;
        }
        String signatureB64 = call.getString("signature");
        if (signatureB64 == null) {
            call.reject("signature is required");
            return;
        }

        try {
            byte[] dataBytes = Base64.decode(dataB64, Base64.DEFAULT);
            byte[] signatureBytes = Base64.decode(signatureB64, Base64.DEFAULT);

            KeyStore keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER);
            keyStore.load(null);
            KeyStore.Entry entry = keyStore.getEntry(keyAlias, null);

            if (!(entry instanceof KeyStore.PrivateKeyEntry)) {
                call.reject("Key not found or not a signing key for alias: " + keyAlias);
                return;
            }

            java.security.PublicKey publicKey =
                    ((KeyStore.PrivateKeyEntry) entry).getCertificate().getPublicKey();
            String keyAlgorithm = publicKey.getAlgorithm();
            String sigAlgorithm = keyAlgorithm.contains("EC") ? "SHA256withECDSA" : "SHA256withRSA";

            Signature sig = Signature.getInstance(sigAlgorithm);
            sig.initVerify(publicKey);
            sig.update(dataBytes);
            boolean valid = sig.verify(signatureBytes);

            JSObject result = new JSObject();
            result.put("valid", valid);
            call.resolve(result);
        } catch (KeyStoreException e) {
            call.reject("KeyStore error during verify: " + messageOf(e));
        } catch (CertificateException e) {
            call.reject("Certificate error loading KeyStore: " + messageOf(e));
        } catch (NoSuchAlgorithmException e) {
            call.reject("Algorithm not supported: " + messageOf(e));
        } catch (java.io.IOException e) {
            call.reject("IO error loading KeyStore: " + messageOf(e));
        } catch (UnrecoverableEntryException e) {
            call.reject("Unable to recover key from KeyStore: " + messageOf(e));
        } catch (InvalidKeyException e) {
            call.reject("Invalid key for verification: " + messageOf(e));
        } catch (SignatureException e) {
            call.reject("Signature verification failed: " + messageOf(e));
        }
    }

    // ─── helpers ────────────────────────────────────────────────────────────────

    private static String messageOf(Exception e) {
        return e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName();
    }
}
