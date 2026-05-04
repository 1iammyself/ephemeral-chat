# Android Security Hardening Design
**Date:** 2026-05-04  
**Status:** Approved — awaiting implementation  
**Branch to implement on:** `tried_something` or a new feature branch off `main`

---

## Context

The Android app is a React/Vite web app running inside Capacitor's WebView. It already has:
- Two custom native Java plugins: `ProximityPlugin.java` (BLE/NSD/WiFi Direct P2P) and `NowPlayingPlugin.java` (MediaSession)
- `FLAG_SECURE` set (anti-screenshot/recording)
- Full E2EE stack in JavaScript: PQXDH + Double Ratchet + MLS encryption
- Deep linking, FileProvider, NotificationListenerService

**This design does NOT migrate away from Capacitor.** The correct description is:

> Harden the existing Capacitor app by writing new native Capacitor plugins that expose hardware security APIs, and fix existing build config gaps.

The React UI, E2EE crypto logic, and existing plugins are all untouched.

---

## Security Gaps (Current State)

| Gap | Risk |
|-----|------|
| `minifyEnabled false` in `build.gradle` | Java/Kotlin code readable from decompiled APK |
| No JS bundle minification check | Business logic readable from extracted APK assets |
| No certificate pinning | TLS interception possible on rooted device |
| E2EE keys live in JavaScript heap | Heap dump on rooted device exposes private keys |
| No Play Integrity / attestation | Tampered APKs can connect to server; no device integrity check |
| No biometric auth gate | App accessible without proving physical presence |
| No root/tamper detection | Rooted device can hook JS bridge via Frida |

---

## What We Are NOT Doing (and Why)

- **Full Kotlin/Compose rewrite**: Risk of introducing cryptographic bugs in PQXDH/Double Ratchet reimplementation outweighs any benefit. The existing crypto is solid — don't touch it.
- **Eliminating the JS bridge**: The bridge carries Watch Party sync, ProximityPlugin, NowPlayingPlugin — all fine. The threat is *key material crossing the bridge*, not the bridge itself. This design ensures keys never cross it.

---

## Solution: Three New Native Plugins + Build Config Fixes

### Overview

```
┌─────────────────────────────────────────────────────┐
│                   React WebView                      │
│  (UI, Double Ratchet state machine, room logic)     │
│                                                      │
│  plaintext → [KeystorePlugin] → ciphertext          │
│  attestationToken ← [IntegrityPlugin]               │
│  biometricResult ← [BiometricPlugin]                │
└─────────────┬───────────────────────────────────────┘
              │ Capacitor JS Bridge (data only, no keys)
┌─────────────▼───────────────────────────────────────┐
│              Native Android Layer                    │
│                                                      │
│  KeystorePlugin     — keys in TEE/StrongBox         │
│  IntegrityPlugin    — Play Integrity API            │
│  BiometricPlugin    — BiometricPrompt + Keystore    │
│                                                      │
│  ProximityPlugin    — existing (unchanged)          │
│  NowPlayingPlugin   — existing (unchanged)          │
└─────────────────────────────────────────────────────┘
              │
┌─────────────▼───────────────────────────────────────┐
│           Android Hardware                           │
│  TEE / StrongBox — key generation & crypto ops      │
│  Play Integrity token — signed by Google            │
│  Biometric sensor — hardware-backed auth            │
└─────────────────────────────────────────────────────┘
```

---

## Component 1: KeystorePlugin (New)

**File:** `client/android/app/src/main/java/me/kyere/chat/KeystorePlugin.java`

**Purpose:** Wrap Android Keystore so that E2EE keys are generated and used inside hardware (TEE). Keys NEVER appear in JavaScript memory. JS passes plaintext in → gets ciphertext out. Or passes ciphertext in → gets plaintext out.

### Plugin Methods

```java
@PluginMethod generateKey(call)
// Generates an AES-256-GCM key inside Android Keystore.
// Input:  { keyAlias: string }
// Output: { success: boolean }
// The key is hardware-bound. It is never returned to JS.

@PluginMethod encrypt(call)
// Input:  { keyAlias: string, plaintext: string (base64) }
// Output: { ciphertext: string (base64), iv: string (base64) }
// AES-GCM encrypt happens entirely in native. Key never leaves hardware.

@PluginMethod decrypt(call)
// Input:  { keyAlias: string, ciphertext: string (base64), iv: string (base64) }
// Output: { plaintext: string (base64) }
// AES-GCM decrypt happens entirely in native.

@PluginMethod deleteKey(call)
// Input:  { keyAlias: string }
// Output: { success: boolean }
// Permanently destroys the key from Keystore.

@PluginMethod keyExists(call)
// Input:  { keyAlias: string }
// Output: { exists: boolean }

@PluginMethod sign(call)
// Input:  { keyAlias: string, data: string (base64) }
// Output: { signature: string (base64) }
// For signing with EC P-256 or RSA keys.

@PluginMethod verify(call)
// Input:  { keyAlias: string, data: string (base64), signature: string (base64) }
// Output: { valid: boolean }
```

### Key Generation Implementation Notes

```java
KeyGenParameterSpec spec = new KeyGenParameterSpec.Builder(
    keyAlias,
    KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
)
.setBlockModes(KeyProperties.BLOCK_MODE_GCM)
.setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
.setKeySize(256)
.setUserAuthenticationRequired(false)  // set true if biometric-bound keys desired
.setUnlockedDeviceRequired(true)       // key only usable when device is unlocked
// For StrongBox (if device supports it):
// .setIsStrongBoxBacked(true)
.build();

KeyGenerator keyGen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
keyGen.init(spec);
keyGen.generateKey();
```

### How JavaScript Uses This

The current E2EE key-store (`client/src/crypto/key-store.js`) stores keys in IndexedDB. The migration path:
1. **New rooms**: When generating a new room key pair or ratchet key, call `KeystorePlugin.generateKey({ keyAlias: roomId + ':ratchet' })` instead of storing in IndexedDB.
2. **Encrypt**: Replace `crypto.subtle.encrypt(...)` calls for room messages with `KeystorePlugin.encrypt({ keyAlias, plaintext })`.
3. **Decrypt**: Replace `crypto.subtle.decrypt(...)` calls with `KeystorePlugin.decrypt({ keyAlias, ciphertext, iv })`.
4. **Existing rooms** (migration): On next open, re-encrypt any existing IndexedDB-stored keys under a Keystore-wrapped key and delete the raw value from IndexedDB.

> **Important**: The Double Ratchet state machine (ratchet chain keys, message keys, header keys) still lives in JavaScript. Only the **leaf message encrypt/decrypt operations** delegate to the Keystore plugin. The ratchet key derivation (HKDF) can continue to use WebCrypto `deriveBits` since derived intermediate keys are ephemeral per-message.

---

## Component 2: IntegrityPlugin (New)

**File:** `client/android/app/src/main/java/me/kyere/chat/IntegrityPlugin.java`

**Purpose:** Generate a Play Integrity API token that proves to your server: (1) the APK is genuine and unmodified, (2) the device passes Google's integrity checks (not rooted/tampered), (3) the user has a licensed copy.

### Prerequisites

- Enable Play Integrity API in Google Play Console for your app (`me.kyere.chat`)
- Add dependency: `implementation 'com.google.android.play:integrity:1.4.0'` in `app/build.gradle`
- Server: add a verification endpoint that calls the Play Integrity decryption API (see Server section below)

### Plugin Methods

```java
@PluginMethod requestIntegrityToken(call)
// Input:  { nonce: string }  — server-generated nonce (base64, 16+ bytes)
// Output: { token: string }  — opaque token to send to your server
// The server then calls Google's API to decrypt and verify the token.

@PluginMethod getDeviceVerdict(call)
// Convenience: requests token with a built-in nonce, decodes locally
// for non-critical use (root detection UI hint only — do NOT trust locally)
// Output: { deviceIntegrity: string, appIntegrity: string, accountDetails: string }
```

### Implementation

```java
IntegrityManager integrityManager = IntegrityManagerFactory.create(getContext());

IntegrityTokenRequest request = IntegrityTokenRequest.builder()
    .setNonce(nonce)
    .build();

integrityManager.requestIntegrityToken(request)
    .addOnSuccessListener(response -> {
        JSObject result = new JSObject();
        result.put("token", response.token());
        call.resolve(result);
    })
    .addOnFailureListener(e -> call.reject("Integrity check failed: " + e.getMessage()));
```

### JavaScript Integration

```javascript
// In room creation / join flow:
const nonce = await fetchNonceFromServer(); // server generates & stores nonce
const { token } = await Plugins.Integrity.requestIntegrityToken({ nonce });
// Include token in the createRoom / joinRoom API request
// Server validates token with Google before processing
```

### Server-Side Verification (Node.js / server/rooms.js area)

```javascript
// POST /api/verify-integrity
// Body: { token, nonce }
// 
// Call Google's Play Integrity API:
// POST https://playintegrity.googleapis.com/v1/{packageName}:decodeIntegrityToken
// Body: { integrity_token: token }
// 
// Verify response:
// - requestDetails.nonce matches stored nonce (prevents replay)
// - appIntegrity.appRecognitionVerdict === 'PLAY_RECOGNIZED'
// - deviceIntegrity.deviceRecognitionVerdict includes 'MEETS_DEVICE_INTEGRITY'
// - accountDetails.appLicensingVerdict === 'LICENSED'
// 
// Return short-lived session token if all pass, reject if any fail.
```

> **Note**: Play Integrity tokens are rate-limited (~5/minute/device). Request once per session, not per message. Cache the verdict for the session duration.

---

## Component 3: BiometricPlugin (New)

**File:** `client/android/app/src/main/java/me/kyere/chat/BiometricPlugin.java`

**Purpose:** Gate app access behind hardware biometric authentication. Runs as a native prompt before the WebView content is accessible. Can optionally be tied to a Keystore key (so the key is only usable after biometric auth).

### Plugin Methods

```java
@PluginMethod authenticate(call)
// Input:  { title: string, subtitle: string, cancelLabel: string }
// Output: { success: boolean, errorCode?: string }
// Shows BiometricPrompt. Returns success only if hardware biometric passes.

@PluginMethod isAvailable(call)
// Output: { available: boolean, reason?: string }
// Checks if device has enrolled biometrics.

@PluginMethod generateBiometricBoundKey(call)
// Input:  { keyAlias: string }
// Output: { success: boolean }
// Generates a Keystore key that requires biometric auth for EVERY use.
// UserAuthenticationRequired = true, UserAuthenticationValidityDurationSeconds = -1
```

### Implementation Notes

```java
BiometricPrompt.PromptInfo promptInfo = new BiometricPrompt.PromptInfo.Builder()
    .setTitle(title)
    .setSubtitle(subtitle)
    .setNegativeButtonText(cancelLabel)
    .setAllowedAuthenticators(
        BiometricManager.Authenticators.BIOMETRIC_STRONG
    )
    .build();

BiometricPrompt biometricPrompt = new BiometricPrompt(getActivity(),
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
            r.put("error", errString.toString());
            call.resolve(r);
        }
        @Override
        public void onAuthenticationFailed() {
            // Called on each failed attempt — do not resolve/reject here
            // BiometricPrompt handles retry UI automatically
        }
    }
);

biometricPrompt.authenticate(promptInfo);
```

### JavaScript Integration

```javascript
// In App.jsx or a new AppLock component, on app foreground:
const { available } = await Plugins.Biometric.isAvailable();
if (available) {
    const { success } = await Plugins.Biometric.authenticate({
        title: 'Unlock Ephemeral Chat',
        subtitle: 'Confirm your identity to continue',
        cancelLabel: 'Cancel'
    });
    if (!success) {
        // Lock the app — do not render room content
    }
}
```

---

## Component 4: Certificate Pinning (Config Only)

**File:** `client/android/app/src/main/res/xml/network_security_config.xml` (create this file)

```xml
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <domain-config cleartextTrafficPermitted="false">
        <domain includeSubdomains="true">chat.kyere.me</domain>
        <pin-set expiration="2027-01-01">
            <!-- Primary pin: SHA-256 of your server's leaf certificate public key -->
            <!-- Get with: openssl x509 -in cert.pem -pubkey -noout | openssl pkey -pubin -outform der | openssl dgst -sha256 -binary | base64 -->
            <pin digest="SHA-256">YOUR_PRIMARY_CERT_PIN_BASE64==</pin>
            <!-- Backup pin: SHA-256 of your CA intermediate or a backup cert -->
            <pin digest="SHA-256">YOUR_BACKUP_CERT_PIN_BASE64==</pin>
        </pin-set>
    </domain-config>
</network-security-config>
```

**Wire it in `AndroidManifest.xml`:**
```xml
<application
    android:networkSecurityConfig="@xml/network_security_config"
    ...>
```

> **Critical**: Always include a backup pin and set an expiration. If you only have one pin and your cert rotates, the app will stop working for all users until an update is released.  
> **To get your pin**: Run `openssl s_client -connect chat.kyere.me:443 | openssl x509 -pubkey -noout | openssl pkey -pubin -outform der | openssl dgst -sha256 -binary | base64`

---

## Component 5: Build Config Fixes

### Enable R8 Minification (`client/android/app/build.gradle`)

```gradle
buildTypes {
    release {
        minifyEnabled true      // was: false — CHANGE THIS
        shrinkResources true    // also enable resource shrinking
        proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
        ...
    }
}
```

### ProGuard Rules (`client/android/app/proguard-rules.pro`)

Add rules to prevent R8 from breaking Capacitor plugins and your custom plugins:

```proguard
# Keep Capacitor plugin classes
-keep class com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keepclassmembers class * extends com.getcapacitor.Plugin {
    @com.getcapacitor.annotation.PluginMethod public *;
}

# Keep your custom plugins
-keep class me.kyere.chat.** { *; }

# Keep Play Integrity
-keep class com.google.android.play.core.integrity.** { *; }

# Keep AndroidX Biometric
-keep class androidx.biometric.** { *; }
```

### Verify JS Bundle Is Minified

Check `client/vite.config.js` (or `vite.config.ts`). In production builds, Vite minifies by default. Confirm:
```javascript
build: {
    minify: 'terser',  // or 'esbuild' — either is fine, just not false
    // ...
}
```

If `minify: false` exists anywhere, remove it.

---

## Plugin Registration

In `client/android/app/src/main/java/me/kyere/chat/MainActivity.java`, register the three new plugins:

```java
@Override
protected void onCreate(Bundle savedInstanceState) {
    registerPlugin(ProximityPlugin.class);
    registerPlugin(NowPlayingPlugin.class);
    registerPlugin(KeystorePlugin.class);    // NEW
    registerPlugin(IntegrityPlugin.class);   // NEW
    registerPlugin(BiometricPlugin.class);   // NEW
    
    super.onCreate(savedInstanceState);
    // ... rest unchanged
}
```

---

## JavaScript Capacitor Plugin Wrappers

Create `client/src/capacitor/security-plugins.js`:

```javascript
import { registerPlugin } from '@capacitor/core';

export const KeystorePlugin = registerPlugin('Keystore');
export const IntegrityPlugin = registerPlugin('Integrity');
export const BiometricPlugin = registerPlugin('Biometric');
```

---

## Implementation Order (Recommended)

Do these in sequence — each is independently shippable and low risk:

### Phase 1 — Zero-risk config changes (1–2 days)
1. Enable R8 (`minifyEnabled true`) + add proguard rules
2. Add `network_security_config.xml` with certificate pins
3. Wire `networkSecurityConfig` into `AndroidManifest.xml`
4. Verify Vite minification is on
5. Build release APK and test — verify nothing breaks

### Phase 2 — BiometricPlugin (3–5 days)
1. Write `BiometricPlugin.java`
2. Register in `MainActivity.java`
3. Create `client/src/capacitor/security-plugins.js`
4. Add biometric gate in `App.jsx` (optional feature flag to disable for users without enrolled biometrics)
5. Test on physical device (emulator biometric is unreliable)

### Phase 3 — KeystorePlugin (1 week)
1. Write `KeystorePlugin.java`
2. Register in `MainActivity.java`
3. Write migration in `client/src/crypto/key-store.js`:
   - On app startup, check if Keystore keys exist for each room
   - If not, migrate: generate Keystore key, re-encrypt stored key material, delete raw from IndexedDB
4. Update E2EE encrypt/decrypt call sites to use KeystorePlugin instead of WebCrypto for final message operations
5. Test: verify messages still decrypt correctly after migration

### Phase 4 — IntegrityPlugin + Server Verification (1–2 weeks)
1. Enable Play Integrity API in Google Play Console
2. Write `IntegrityPlugin.java`
3. Register in `MainActivity.java`
4. Add server endpoint `POST /api/integrity/verify` (decrypts token via Google API)
5. Add nonce generation to server session flow
6. Add token to room create/join request headers
7. Initially: **log only** (don't block) — validate the verdicts look correct in production
8. After 1–2 weeks of data: enable enforcement (block MEETS_BASIC_INTEGRITY failures)

---

## Files to Create

| File | Type |
|------|------|
| `client/android/app/src/main/java/me/kyere/chat/KeystorePlugin.java` | New native plugin |
| `client/android/app/src/main/java/me/kyere/chat/IntegrityPlugin.java` | New native plugin |
| `client/android/app/src/main/java/me/kyere/chat/BiometricPlugin.java` | New native plugin |
| `client/android/app/src/main/res/xml/network_security_config.xml` | New config file |
| `client/src/capacitor/security-plugins.js` | New JS plugin wrappers |

## Files to Modify

| File | Change |
|------|--------|
| `client/android/app/src/main/java/me/kyere/chat/MainActivity.java` | Register 3 new plugins |
| `client/android/app/build.gradle` | `minifyEnabled true`, `shrinkResources true` |
| `client/android/app/proguard-rules.pro` | Add keep rules |
| `client/android/app/src/main/AndroidManifest.xml` | Add `networkSecurityConfig` attribute |
| `client/src/crypto/key-store.js` | Migrate key ops to KeystorePlugin |
| `client/src/App.jsx` | Add biometric gate on foreground |
| `server/rooms.js` (or new file) | Add integrity token verification endpoint |
| `client/vite.config.js` | Confirm `minify` is not false |

---

## Dependencies to Add

In `client/android/app/build.gradle`:
```gradle
dependencies {
    // ... existing deps
    implementation 'com.google.android.play:integrity:1.4.0'
    implementation 'androidx.biometric:biometric:1.2.0-alpha05'
}
```

---

## Security Properties After Implementation

| Threat | Before | After |
|--------|--------|-------|
| APK decompilation (Java) | Code readable | R8 obfuscated |
| APK decompilation (JS) | Bundle readable | Minified + terser obfuscated |
| Key extraction on rooted device | Keys in IndexedDB / JS heap | Keys in hardware TEE, never in memory |
| MITM despite TLS | Possible on rooted device | Blocked by certificate pinning |
| Tampered APK connecting to server | Allowed | Blocked by Play Integrity enforcement |
| Rooted device connecting to server | Allowed | Blocked by Play Integrity device verdict |
| Frida hook on JS bridge | Could intercept key-adjacent calls | No key material crosses bridge |
| App access without user present | No gate | Biometric prompt required |

---

## Notes & Caveats

- **StrongBox**: Not all devices have a dedicated StrongBox HSM (separate from TEE). Check `KeyInfo.isInsideSecureHardware()` after key generation and log it — for devices with StrongBox, call `.setIsStrongBoxBacked(true)`. For others, TEE-backed is still strong.
- **Play Integrity on emulator**: Will return `MEETS_BASIC_INTEGRITY` failure on most emulators. Keep enforcement off during development; test on a real device.
- **Cert pin expiration**: Set a calendar reminder to update the pin before the expiration date in `network_security_config.xml`. An expired pin blocks all users.
- **Biometric fallback**: Some users won't have enrolled biometrics. Make the biometric gate optional or fall back to device PIN (`setAllowedAuthenticators(BIOMETRIC_STRONG | DEVICE_CREDENTIAL)`).
- **Key migration**: The key migration in Phase 3 must be backward-compatible. Rooms where the other party is on web (not Android) still use the JS crypto path. The Keystore plugin is Android-only — the key-store.js migration must only activate when running on Android (`Capacitor.getPlatform() === 'android'`).
