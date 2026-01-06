# 📱 Ephemeral Chat - Comprehensive User Guide

Welcome to **Ephemeral Chat**, the secure, anonymous, and ephemeral messaging application. This guide will take you through every feature of the app, ensuring you can communicate privately and effectively.

## 📚 Table of Contents
1.  [Getting Started](#getting-started)
2.  [Creating a Room (Host)](#creating-a-room-host)
3.  [Joining a Room (Guest)](#joining-a-room-guest)
4.  [Messaging Features](#messaging-features)
    *   [Text Messages](#text-messages)
    *   [🎤 Audio Messages (Voice Notes)](#audio-messages-voice-notes)
    *   [📸 Image Sharing](#image-sharing)
5.  [📞 Audio & Video Calls](#audio--video-calls)
6.  [Room Management](#room-management)
    *   [Knock-to-Join](#knock-to-join)
    *   [Managing Guests](#managing-guests)
    *   [Host Handover](#host-handover)
7.  [Security & Privacy](#security--privacy)
8.  [Troubleshooting](#troubleshooting)

---

## <a name="getting-started"></a>1. Getting Started

**No Account Required**: You do not need to sign up, provide an email, or create a password to use Ephemeral Chat. Just open the app and start chatting.

**Platform Support**:
*   **Desktop**: Chrome, Firefox, Safari, Edge.
*   **Mobile**: iOS (Safari), Android (Chrome, Firefox).
*   **PWA**: You can install the app to your home screen for a native experience.

---

## <a name="creating-a-room-host"></a>2. Creating a Room (Host)

To start a secure conversation, you need to create a room.

1.  **Open the App**: Navigate to the home page.
2.  **Click "New Chat"**: This generates a secure, random 6-digit Room Code.
3.  **Set a Nickname**: Choose a display name for yourself.
4.  **(Optional) Set a Password**: For extra security, you can set a password that guests must enter to join.
5.  **Create**: Click the "Create Room" button.

**You are now the Host.** You have special privileges to control who enters the room.

---

## <a name="joining-a-room-guest"></a>3. Joining a Room (Guest)

There are two ways to join a room:

### Method A: Using a Link (Recommended)
1.  **Get the Link**: Ask the Host to send you the **Full Invite Link**.
    *   *Note*: The link must contain the `#` hash part (e.g., `.../room/123456#xyz...`). This is the **Encryption Key**. Without it, you cannot read messages.
2.  **Open the Link**: Click the link to open the app.
3.  **Enter Nickname**: Choose a display name.
4.  **Join**: Click "Join Room".

### Method B: Using the Room Code
1.  **Get the Code**: Ask the Host for the 6-digit Room Code (e.g., `123456`).
2.  **Enter Code**: On the home page, enter the code in the "Enter Room Code" box.
3.  **Enter Nickname**: Choose a display name.
4.  **Join**: Click "Join Room".
    *   *Warning*: If you join via code, you might not have the Encryption Key unless the Host shares it separately or the room is unencrypted (rare).

---

## <a name="messaging-features"></a>4. Messaging Features

Once in the room, you can communicate in multiple ways.

### Text Messages
*   Type in the input bar at the bottom and press **Enter** or the **Send (➤)** button.
*   **Emojis**: Fully supported.
*   **Links**: URLs are automatically clickable.

### <a name="audio-messages-voice-notes"></a>🎤 Audio Messages (Voice Notes)
Send voice messages that play perfectly on any device.

1.  **Record**: Click the **Microphone (🎤)** icon.
2.  **Speak**: You have up to **30 seconds**. A timer will show your progress.
3.  **Stop/Send**:
    *   Click the **Stop (Square)** button to finish recording and review (if feature available) or send immediately.
    *   Click the **Send (➤)** button to send immediately.
4.  **Cancel**: Click the **Trash (🗑️)** icon to discard the recording.

**Universal Compatibility**:
*   Record on **iPhone** -> Plays on **Android/Windows**.
*   Record on **Android** -> Plays on **iPhone/Mac**.
*   Our server automatically converts all audio to high-quality **AAC** format for universal playback.

### <a name="image-sharing"></a>📸 Image Sharing
Share photos securely.

1.  **Upload**: Click the **Image (🖼️)** icon.
2.  **Select**: Choose a file from your device.
3.  **View Once**: Images are typically "View Once" or ephemeral, disappearing after the room closes.

---

## <a name="audio--video-calls"></a>5. 📞 Audio & Video Calls

Start a real-time call with everyone in the room.

1.  **Start Call**: Click the **Phone (📞)** icon in the input bar.
    *   *Requirement*: There must be at least 2 people in the room.
2.  **Permissions**: Allow microphone access when prompted.
3.  **In Call**: You will see a call interface. You can mute your mic or leave the call at any time.

---

## <a name="room-management"></a>6. Room Management

### Knock-to-Join
For security, new guests cannot enter directly. They are placed in a **Waiting Room**.
*   **Guest View**: "Waiting for Host to approve..."
*   **Host View**: A notification appears with the guest's name.

### Managing Guests
As a Host, you see a list of pending guests in the sidebar (or menu on mobile).
*   **Approve (✓)**: Allows the guest to enter the room and read messages.
*   **Deny (X)**: Rejects the guest. They will be shown an error message.
*   **Kick**: In the User List, you can remove disruptive users (if feature enabled).

### Host Handover
If the Host leaves the room (disconnects or closes tab):
*   The system automatically assigns the **Host** role to the next oldest member of the room.
*   The room does *not* close; the conversation continues.

---

## <a name="security--privacy"></a>7. Security & Privacy

### 🔐 End-to-End Encryption (E2EE)
*   **How it works**: A secret key is generated in your browser when you create a room.
*   **The Key**: It is stored in the URL hash (after the `#`).
*   **Privacy**: This key is **NEVER** sent to our servers. We cannot read your messages even if we wanted to.
*   **Sharing**: You must share the full link (with the `#`) for others to decrypt the chat.

### Ephemeral Nature
*   **No History**: Messages are stored in temporary memory (RAM) only.
*   **Auto-Deletion**: Once all users leave, the room and all messages are permanently destroyed.
*   **TTL (Time-To-Live)**: Rooms have an inactivity timer. If no one sends a message for a set time (e.g., 10 mins), the room closes automatically.

---

## <a name="troubleshooting"></a>8. Troubleshooting

**Q: I can't hear audio messages on my iPhone.**
*   **A**: Ensure your silent switch is off. Our new "Universal Audio" system ensures the format is compatible with iPhone (AAC).

**Q: "Waiting for Host" forever?**
*   **A**: The Host might be away or has ignored your request. Try contacting them via another channel.

**Q: Messages look like gibberish or "Decryption Failed".**
*   **A**: You likely joined without the Encryption Key. Ask the Host to resend the **Full Link** (with the `#` part).

**Q: Call quality is poor.**
*   **A**: Calls use Peer-to-Peer (WebRTC). Quality depends on your internet connection and the connection of other participants. Try moving closer to your router.
