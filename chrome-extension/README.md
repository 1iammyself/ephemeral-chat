# Ephemeral Chat - Chrome Extension

A Chrome extension for quick access to Ephemeral Chat secure chat rooms.

## Features

- 🚀 **Quick Access** - Create or join chat rooms from any tab
- 📝 **Recent Rooms** - Keep track of your recently visited rooms
- 🔔 **Notifications** - Get desktop notifications for new messages
- ⚙️ **Settings** - Customize your experience
- 🔒 **Secure** - Works with end-to-end encrypted chat

## Installation (Developer Mode)

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right corner)
3. Click **Load unpacked**
4. Select the `chrome-extension` folder from this project
5. The extension icon should appear in your toolbar

## Adding Icons

Before loading the extension, you need to add icon files:

1. Create PNG icons in the following sizes:
   - `icons/icon16.png` (16x16 pixels)
   - `icons/icon32.png` (32x32 pixels)
   - `icons/icon48.png` (48x48 pixels)
   - `icons/icon128.png` (128x128 pixels)

2. You can use your existing app icon and resize it, or use a tool like:
   - https://www.icoconverter.com/
   - https://realfavicongenerator.net/

## Usage

1. Click the extension icon in your Chrome toolbar
2. **Create Room** - Opens chat.kyere.me to create a new room
3. **Join Room** - Enter a 10-character room code to join
4. **Recent Rooms** - Click any recent room to rejoin

## Project Structure

```
chrome-extension/
├── manifest.json      # Extension configuration
├── background.js      # Service worker for background tasks
├── content.js         # Script injected into chat.kyere.me
├── content.css        # Styles for content script
├── popup/
│   ├── popup.html     # Extension popup UI
│   ├── popup.css      # Popup styles
│   └── popup.js       # Popup functionality
└── icons/
    ├── icon16.png
    ├── icon32.png
    ├── icon48.png
    └── icon128.png
```

## Publishing to Chrome Web Store

To publish:

1. Create a ZIP file of the `chrome-extension` folder
2. Go to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
3. Pay the one-time $5 developer fee
4. Upload your extension
5. Fill in the listing details
6. Submit for review

## Permissions Explained

- `storage` - Save recent rooms and settings
- `notifications` - Show desktop notifications
- `alarms` - Schedule cleanup tasks
- `host_permissions` - Access chat.kyere.me for integration

## Development

To make changes:

1. Edit the files in this folder
2. Go to `chrome://extensions/`
3. Click the refresh icon on the extension
4. Test your changes

## License

MIT License - Part of the Ephemeral Chat project
