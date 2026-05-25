# Ephemeral Chat: User Guide

Welcome to Ephemeral Chat. This app works differently from every other messenger you have used. There are no accounts, no message logs, and no way for anyone — including us — to read what you send.

---

## Getting In

You do not need an account, email address, or real name.

### Creating a Room (Host)

1. Tap **"Create New Room"** on the home screen.
2. **Pick a nickname** — visible only to others in this room, for this session only.
3. **Set a password (optional)** — strongly recommended. Anyone with the room link will need it to join.

> **Stealth Entry:** When typing your password you will not see characters appear on screen. This prevents anyone nearby from counting your keystrokes. Type confidently and hit join.

### Joining a Room (Guest)

Click or paste the room link. You will be prompted for a nickname and the password if one was set.

---

## Chat Features

### Slash Commands

Type these directly into the message bar and press Send:

| Command | What it does |
|---|---|
| `/camera` or `/photo` | Take or pick a photo to share securely |
| `/voice` or `/note` | Record an encrypted voice note |
| `/poll` | Create a synchronized room poll |
| `/pulse` | Send a haptic vibration to everyone in the room |
| `/ice` | Drop a random icebreaker question into the chat |
| `/media [url]` | Start a synchronized Watch Party |

### Targeted Messaging

To send a message that only specific people in the room can decrypt:

1. Open the **User List** (people icon, top right).
2. Tap the names you want to include — they highlight.
3. Return to the chat. A blue bar shows **"Sending to X specific users"**.
4. Send. Everyone else receives nothing decryptable.
5. Tap **"Clear selection"** to return to broadcasting to the whole room.

### View Once Media

Toggle a photo as **View Once** before sending. When the recipient dismisses it, the decryption keys are immediately destroyed on their device. The image cannot be recovered.

---

## Privacy Features

### Privacy Blur

The moment you switch apps or the window loses focus, the entire chat blurs itself. Screen recorders and shoulder surfers see nothing useful.

### Ghost Watermarking

Faint, shifting text drifts across the chat background. This defeats AI-based character recognition from cameras pointed at your screen.

### Panic Burn

If you are the host and something goes wrong, triggering Panic Burn sends a cryptographic kill signal to every connected device simultaneously. All local chat state is wiped on all devices in milliseconds.

### Traffic Padding

The app continuously sends random encrypted packets to the server at unpredictable intervals. Anyone monitoring your network connection — including your ISP — cannot tell when you are sending a real message, how often you send, or how large the messages are.

---

## Offline Proximity Chat

When you have no internet connection, Ephemeral Chat can discover nearby devices over local Wi-Fi, Bluetooth, or Wi-Fi Direct and establish a direct encrypted channel between them.

**How it works:**
1. Both devices must be within Bluetooth or LAN range.
2. Discovery is automatic when you open the Nearby Transfer screen.
3. A cryptographic key exchange happens invisibly during the initial handshake — each device pair gets a unique session key that never leaves the devices.
4. All messages and files sent over the local mesh are end-to-end encrypted, even without a server.

There is no internet required, no server involved, and no one outside the physical vicinity can intercept the communication.

---

## Device Security (Android)

Ephemeral Chat protects itself from tampering at the hardware level. Every time the app opens and every time it returns from the background, it silently verifies that the device has not been modified by an attacker. This includes checking for active instrumentation tools like Frida and for root frameworks like Magisk.

If the device fails these checks, the app shuts down completely with no explanation shown. This is intentional — revealing why the check failed would help an attacker bypass it.

**What this means for you:** If you are on a stock, unmodified Android device, you will never notice these checks. They complete in under a second and the app opens normally.

---

## How the Encryption Works (Plain Language)

Every message you send goes through several layers before it ever leaves your device:

1. **A unique key is agreed with each person** using math that is hard even for quantum computers to break. The server sees this exchange but cannot derive the keys.
2. **Every message gets its own key.** Even if an attacker somehow obtained one message key, no other message in the past or future is affected.
3. **The server only ever sees scrambled bytes.** It has no key, no ability to decrypt, and stores nothing permanently.
4. **Every public key published is recorded in a tamper-evident log.** Before your device trusts anyone's key, it verifies that key's inclusion proof in that log — making silent key substitution detectable.
5. **Keys are erased from device memory the instant they are no longer needed,** using hardware-level volatile writes that cannot be optimized away by the device's processor.

---

## FAQ

**Q: Do my messages stay on your server?**
**A:** No. The server holds messages in RAM only long enough to relay them. Once delivered (or the room expires), they are gone. The server cannot read them regardless — it only ever sees ciphertext.

**Q: I sent a message but the other person did not receive it after reconnecting. Why?**
**A:** Ephemeral Chat is hyper-synchronous. If a device disconnects before establishing a shared ratchet key, it cannot decrypt messages sent while it was offline. This is by design — it prevents past messages from being exposed when someone rejoins.

**Q: What happens if I lose the room link?**
**A:** Ask the host to share it again. Room codes can also be found in the room settings panel.

**Q: Is the offline proximity chat safe?**
**A:** Yes. Each pair of nearby devices negotiates a unique cryptographic key during the discovery handshake. No one outside Bluetooth or Wi-Fi range can intercept, and even someone on the same local network cannot read messages between two other devices because each pair has a different key.

**Q: Why did the app close on its own on Android?**
**A:** The device integrity check detected something unexpected about the device's state. This protects your keys and messages from being accessed by instrumentation tools. If you are on a standard device and this keeps happening, please report it as a bug.

---

*Need help? Rejoin the room to reset your session state, or open an issue at [github.com/cLLeB/ephemeral-chat](https://github.com/cLLeB/ephemeral-chat).*
