# Privacy Policy for Ephemeral Chat

**Last Updated: February 5, 2026**

Ephemeral Chat ("the App") is built with a "Privacy by Design" philosophy. Our goal is to provide a secure, anonymous communication platform where your data stays yours.

## 1. Information Collection

- **No Personal Data:** We do not require registration, names, email addresses, or phone numbers.
- **No Message Logs:** Messages are ephemeral. They are held in memory only as long as necessary for delivery and are never permanently stored on our servers.
- **Anonymous Usage:** We do not track individual users or create user profiles.

## 2. Device Permissions

The App requires the following permissions to function:

| Permission | Purpose | Data Handling |
|------------|---------|---------------|
| **Internet Access** | Required to connect to chat rooms and transmit messages/calls. | Encrypted data transmitted to our relay servers. |
| **Microphone** | Used only when you explicitly start a voice call or record a voice note. | Audio is transmitted peer-to-peer or processed for immediate delivery and is not recorded by the developer. |
| **Camera** | Used only when you explicitly capture a photo to share in chat. | Photos are encrypted and transmitted directly to chat recipients. We do not store or access your photos. |
| **File Access** | Used when you choose to send or receive files in chat. | Files are encrypted end-to-end and transmitted directly between users. We do not store or access your files. |
| **Local Storage** | Used to optionally save chat history locally on your device (if you enable persistent mode). | Data is stored only on your device and is never uploaded to our servers. |

## 3. Data Encryption

- All messages are encrypted client-side using **AES-GCM**.
- The encryption keys are stored in the URL hash of your chat room and are **never sent to our servers**.
- Only people with the specific room link can decrypt messages.
- File transfers use end-to-end encryption.

## 4. Local Storage (Persistent Mode)

- If you enable persistent storage, your chat history is saved **only on your device**.
- This data never leaves your device and is not accessible to us.
- You can delete this data at any time through the app settings.

## 5. Third-Party Sharing

- We do **not** sell, trade, or share any information with third parties.
- We do **not** use third-party analytics or advertising trackers.

## 6. Desktop App (Electron)

The desktop application includes additional security features:
- **Screen Capture Protection:** Prevents screenshots and screen recording on Windows.
- **Sandboxed Execution:** The app runs in an isolated environment for security.
- **No Telemetry:** The desktop app does not collect or transmit usage data.

## 7. Data Retention

- **Messages:** Automatically deleted based on room settings (30 seconds to 1 hour).
- **Rooms:** Expire and are deleted after 24 hours of inactivity.
- **Files:** Not stored on our servers; transmitted directly between users.
- **Local Data:** Retained on your device until you delete it.

## 8. Children's Privacy

The App is not intended for children under 13. We do not knowingly collect any information from children.

## 9. Changes to This Policy

We may update this Privacy Policy from time to time. Any changes will be posted on this page with an updated "Last Updated" date.

## 10. Contact

If you have any questions about this Privacy Policy, you can reach out via:
- **GitHub:** https://github.com/1iammyself/ephemeral-chat
- **Website:** https://chat.kyere.me

---

*This privacy policy applies to Ephemeral Chat version 1.1.0 and later.*
