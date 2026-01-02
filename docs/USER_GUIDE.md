# 📱 Ephemeral Chat - User Guide

## What is Ephemeral Chat?
Ephemeral Chat is a private messaging app where your conversations disappear after being read, ensuring your messages don't stay online forever. It's perfect for sharing sensitive information or having private conversations without leaving a digital trace.

## ✨ Key Features
- **🔐 End-to-End Encryption**: Messages are encrypted on your device before sending. Even the server cannot read them.
- **🚪 Knock-to-Join**: The room creator controls who enters. Guests wait in a lobby until approved.
- **Disappearing Messages**: Messages are automatically deleted after being read or when the room closes.
- **No Account Needed**: Start chatting immediately without signing up.
- **Private & Secure**: Your conversations stay between you and the people you share them with.

## 🚀 Quick Start
1. Visit [Ephemeral Chat](https://ephemeral-chat-7j66.onrender.com/)
2. Click "New Chat" to create a chat room.
3. Share the **full link** (including the `#` part) with friends.
4. Approve your friends when they "knock" to join.
5. Start chatting securely!

## 📱 How to Use Ephemeral Chat

### 1. Start a New Chat (Become the Host)
1. Go to [Ephemeral Chat](https://ephemeral-chat-7j66.onrender.com/)
2. Click "New Chat" button.
3. A unique chat room will be created. You are now the **Host**.
4. The URL in your browser bar contains a secret key after the `#`. This key is required to decrypt messages.

### 2. Invite Others
1. Click the "Copy Link" button or manually copy the URL.
2. Share this link with the person you want to chat with.
3. **Important**: They must have the full link with the `#hash` to read messages.

### 3. Joining a Room (For Guests)
1. Open the link shared by the host.
2. Enter a nickname and complete the verification.
3. You will see a **"Waiting for Host"** screen.
4. Once the host approves you, you will automatically enter the chat.

### 4. Managing the Room (For Hosts)
1. When someone tries to join, they will appear in your **"Waiting Room"** list.
2. Click the **Check (✓)** icon to let them in.
3. Click the **Cross (X)** icon to deny entry.
4. If you leave the room, the next oldest member will automatically become the new Host.

### 5. Send Messages
1. Type your message in the text box at the bottom.
2. Press Send (or hit Enter).
3. Your message is encrypted on your device, sent to the server, and decrypted only by people in the room.

### 6. What Happens to Messages?
- Messages disappear as soon as they're read by the recipient (if configured) or when the room closes.
- If the chat is closed, all messages are deleted.
- No messages are stored on our servers.

## 🔒 Privacy & Security
- **Client-Side Encryption**: We use AES-GCM encryption. The key is generated on your device and shared via the URL hash. The server never sees this key.
- **No Logs**: We don't store your messages or metadata.
- **No Personal Info**: No email or phone number required.
- **Ephemeral**: Everything is temporary.

## ❓ Frequently Asked Questions

### Q: Why am I stuck on "Waiting for Host"?
A: The room creator (Host) must approve your entry. If they are away or deny you, you won't be able to join.

### Q: What is the `#` part of the URL?
A: That is the **Encryption Key**. It allows your browser to decrypt messages. If you share the link without it, the recipient can join but won't be able to read anything.

### Q: Do I need to create an account?
A: No accounts needed! Just create a chat room and share the link.

### Q: Are my messages really private?
A: Yes! Messages are encrypted **before** they leave your device. Even if our server was compromised, your messages would look like random gibberish.

### Q: Can I use this on my phone?
A: Yes! Visit [Ephemeral Chat](https://ephemeral-chat-7j66.onrender.com/) on your phone's browser. You can also add it to your home screen like an app.

### Q: What happens if the Host leaves?
A: The system will automatically promote the next person in the room to be the new Host, so the chat can continue.

### Q: Can I send photos or files?
A: Yes! You can send images (view-once) and voice notes. These are also encrypted.

## 💡 Tips
- For sensitive conversations, use a secure messaging app to share the chat link
- Don't share chat links publicly
- Each new chat creates a brand new, secure room
- The chat works best with modern browsers like Chrome, Firefox, or Safari

## 📞 Need Help?
For support or questions, please contact us through the app.

---

*Ephemeral Chat - Because some conversations should stay private.*
