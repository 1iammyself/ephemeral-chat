# Privacy Policy for Ephemeral Chat

**Last Updated: May 25, 2026**

Ephemeral Chat is built with a Privacy by Design philosophy. Our goal is a secure, anonymous communication platform where your data stays yours.

---

## 1. Information We Collect

- **No personal data.** We do not require registration, names, email addresses, or phone numbers.
- **No message logs.** Messages are held in server RAM only as long as necessary for delivery and are never written to disk.
- **No user profiles.** We do not track individual users or correlate sessions.
- **No analytics.** We do not embed third-party tracking or advertising SDKs.

---

## 2. Device Permissions

| Permission                                          | Purpose                                                   | How data is handled                                                                   |
| --------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **Internet**                                  | Connect to chat rooms and relay messages                  | Encrypted before leaving your device                                                  |
| **Microphone**                                | Voice calls and voice notes, only when you initiate them  | Transmitted peer-to-peer or encrypted for delivery; never recorded by us              |
| **Camera**                                    | Photos you choose to share                                | Encrypted and sent directly to recipients; we never store or access them              |
| **File Access**                               | Files you choose to send or receive                       | End-to-end encrypted; we never store or access them                                   |
| **Location (coarse)**                         | Geofenced room enforcement only, when enabled by the host | Used locally to verify you are within the geofence; not transmitted to our servers    |
| **Nearby Devices / Bluetooth / Wi-Fi Direct** | Offline proximity discovery                               | Used only for local device-to-device communication; no data leaves your local network |
| **Local Storage**                             | Saving chat history in persistent mode                    | Stored only on your device; never uploaded                                            |

---

## 3. Encryption

All communication is protected by a multi-layer cryptographic architecture:

**Hybrid Post-Quantum Key Exchange (PQXDH):**
Session keys are established using both X25519 (classical) and ML-KEM-768 (post-quantum). Both algorithms must be broken simultaneously to compromise any session — the design is safe against quantum computers.

**Per-Message Key Derivation:**
1:1 sessions use the Double Ratchet algorithm. Group sessions use Megolm-style Sender Keys. Every individual message is encrypted with a unique key that is immediately discarded. Past messages remain safe even if a future key is somehow exposed.

**Key Transparency:**
Every public key published through our server is committed to a tamper-evident Merkle tree (RFC 6962). Before your device trusts anyone's key, it independently verifies that key's inclusion proof. Silent key substitution is cryptographically detectable.

**Offline Proximity Encryption:**
When devices communicate over local Wi-Fi, Bluetooth, or Wi-Fi Direct with no internet connection, a separate X25519 key exchange is performed directly between the devices. Each pair gets a unique AES-GCM-256 session key derived via HKDF. The server is not involved.

**Secure Key Erasure:**
Where the Rust-compiled WASM module is available, cryptographic key material — including intermediate Diffie-Hellman outputs and message keys — is zeroed from device memory after use using volatile writes that the device's JIT compiler cannot optimize away. If the module is unavailable, the app falls back to best-effort zeroing.

**Server-Side Signatures:**
The server signs all key-bundle events with Ed25519. Your device verifies every signature and pins the server's public key on first connection (Trust On First Use). Any change to the server key on reconnect is flagged as a potential MITM.

**Encryption keys are established peer-to-peer and are never sent to our servers.**

---

## 4. Metadata Protection

- **Oblivious HTTP (OHTTP, RFC 9458):** When an OHTTP relay is configured, HTTP payloads are encapsulated using HPKE and routed through a third-party relay. The relay sees your IP but not the payload; the gateway sees the payload but not your IP; neither party sees both. If no relay is configured, requests fall back to a direct connection to our server.
- **Privacy Pass (RFC 9497/9578):** Anti-abuse validation that does not track you. Uses blind cryptographic tokens on the Ristretto255 curve — the server proves it issued a token without learning which token gets redeemed.
- **Traffic Padding:** Every message is padded to a fixed size. By default the app also adds random timing jitter and injects fake encrypted packets; you can reduce this on the lowest privacy setting. When active, it becomes much harder for a network observer to determine when you send, how often, or how large your messages are.

These metadata protections are applied on a best-effort basis. The level of protection depends on your privacy settings, whether an OHTTP relay is configured, and your network environment. They reduce, but cannot fully eliminate, the metadata observable by a sufficiently capable adversary.

---

## 5. Local Storage

If you enable persistent storage mode, your chat history is saved only on your device. This data never leaves your device and is not accessible to us. You can delete it at any time through the app settings or by clearing app data.

---

## 6. Third-Party Sharing

We do not sell, trade, or share any information with third parties. We do not use third-party analytics, advertising networks, or crash reporting services.

---

## 7. Platform-Specific Features

### Android

- **Screenshot and screen recording protection:** `FLAG_SECURE` prevents any other app on the device from capturing your screen while Ephemeral Chat is open.
- **Device integrity checks:** On every launch and every return from background, the app runs seven independent native-code checks to verify the device has not been modified by root frameworks or active instrumentation tools (e.g. Frida). If the device fails, the app shuts down immediately. These checks run entirely on-device; no data is sent to our servers.
- **Hardware-backed key storage:** Cryptographic keys can be stored via the Android Keystore, which is hardware-backed (TEE) on devices that support it, where they are designed to resist extraction even on a rooted device.
- **Biometric lock:** The app can require fingerprint or face authentication on every open and resume.

### Desktop (Electron)

- **Screen capture blocking:** The Electron shell prevents screenshots and screen recording on Windows.
- **Sandboxed renderer:** The web content runs in an isolated renderer process.
- **No telemetry:** The desktop app collects and transmits no usage data.

---

## 8. Data Retention

| Data type       | Retention                                                                       |
| --------------- | ------------------------------------------------------------------------------- |
| Messages        | Automatically deleted per room TTL setting (30 seconds to 1 hour, or never)     |
| Rooms           | Expire after 24 hours of inactivity; immediately on Panic Burn                  |
| Encryption keys | Wiped from server memory on disconnect; wiped from device memory after each use |
| Files           | Never stored on our servers; transmitted directly between users                 |
| Local history   | Retained on your device until you delete it                                     |

---

## 9. Children's Privacy

This app is not intended for children under 13. We do not knowingly collect any information from children.

---

## 10. Security Limitations & No Warranty

We implement the protections described above as defense-in-depth and on a best-effort basis. However, no software can guarantee absolute security, privacy, or anonymity. The effectiveness of any individual protection depends on your platform, device, app configuration, and network environment, and some protections (for example, screenshot blocking and device integrity checks) are available only on certain platforms. Ephemeral Chat is provided "as is", without warranty of any kind, under the terms of its Apache-2.0 license.

---

## 11. Changes to This Policy

We may update this policy. Changes are posted on this page with an updated date at the top.

---

## 12. Contact

- **GitHub:** https://github.com/cLLeB/ephemeral-chat
- **Website:** https://ephchat.kyere.me

---

*This policy applies to Ephemeral Chat v1.1.0 and later.*
