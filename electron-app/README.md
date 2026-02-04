# Ephemeral Chat - Desktop App

Native desktop application for Ephemeral Chat built with Electron.

## Features

- 🖥️ **Native Desktop Experience** - Runs as a standalone app on Windows, macOS, and Linux
- 🔒 **Enhanced Security** - Screen capture protection, DevTools disabled in production
- 📌 **System Tray** - Minimize to tray, quick access menu
- ⌨️ **Global Shortcuts** - `Alt+Shift+E` to show/hide, `Alt+Shift+N` for new room
- 🎯 **Single Instance** - Only one instance allowed, focuses existing window
- 💾 **Settings Persistence** - Window size, preferences saved locally
- 🚀 **Auto-launch** - Option to start minimized
- 🔔 **Desktop Notifications** - Native OS notifications for messages
- 🔄 **Auto-Updates** - Automatic updates from GitHub releases

## Development

### Prerequisites

- Node.js 18+
- npm or yarn

### Setup

```bash
cd electron-app
npm install
```

### Run in Development

```bash
npm start
```

### Build for Distribution

```bash
# Build for current platform
npm run build

# Build for specific platforms
npm run build:win    # Windows (.exe installer + portable)
npm run build:mac    # macOS (.dmg + .zip)
npm run build:linux  # Linux (.AppImage + .deb)

# Build for all platforms
npm run build:all
```

Built packages will be in the `dist/` folder.

## Code Signing (Windows)

To avoid Windows SmartScreen warnings, you need to sign your executables.

### Option 1: Purchase a Code Signing Certificate (Recommended)

**Providers:**
| Provider | Type | Price/Year |
|----------|------|------------|
| Certum | OV Code Signing | ~$59-79 |
| SSL.com | OV Code Signing | ~$74 |
| Sectigo | OV Code Signing | ~$99 |
| DigiCert | EV Code Signing | ~$400+ |

**OV** = Organization Validation (cheaper, builds reputation over time)
**EV** = Extended Validation (instant trust, no SmartScreen warnings)

### Setup Signing

1. Purchase and download your certificate (.pfx file)

2. Create `electron-builder.env` (copy from `electron-builder.env.example`):
   ```env
   CSC_LINK=C:/path/to/your/certificate.pfx
   CSC_KEY_PASSWORD=your_certificate_password
   ```

3. Build with signing:
   ```bash
   # Windows (PowerShell)
   $env:CSC_LINK="C:\path\to\certificate.pfx"
   $env:CSC_KEY_PASSWORD="your_password"
   npm run build:win

   # Or use dotenv
   npm run build:win
   ```

### Option 2: Use Azure Trusted Signing (Cheaper for individuals)

Microsoft's new [Trusted Signing](https://azure.microsoft.com/en-us/products/trusted-signing) service:
- ~$9.99/month
- Provides EV-level trust
- Integrates with electron-builder via SignTool

### Option 3: Self-Signed (Testing Only)

```powershell
# Create self-signed cert (PowerShell as Admin)
New-SelfSignedCertificate -Type CodeSigning -Subject "CN=Ephemeral Chat" -KeyUsage DigitalSignature -FriendlyName "Ephemeral Chat Code Signing" -CertStoreLocation "Cert:\CurrentUser\My" -NotAfter (Get-Date).AddYears(5)
```

Note: Self-signed certs still trigger SmartScreen warnings.

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Alt+Shift+E` | Show/Hide window |
| `Alt+Shift+N` | Create new room |
| `Ctrl+N` | New room |
| `Ctrl+H` | Go to home |
| `Ctrl+R` | Reload |
| `F11` | Toggle fullscreen |

## System Tray Menu

- Open Ephemeral Chat
- Create New Room
- Always on Top (toggle)
- Start Minimized (toggle)
- Quit

## Security Features

1. **Content Protection** (Windows) - Blocks screenshots and screen recording
2. **DevTools Disabled** - In production builds, DevTools cannot be opened
3. **External Link Handling** - Links open in default browser
4. **Navigation Blocking** - Cannot navigate away from the app
5. **Context Isolation** - Renderer has no direct Node.js access
6. **Sandbox Mode** - Enhanced process isolation

## Icons

Place your app icons in the `icons/` folder:

- `icon.png` - 512x512 PNG (used for Linux and as base)
- `icon.ico` - Windows icon (256x256 multi-resolution)
- `icon.icns` - macOS icon

## Configuration

Settings are stored using `electron-store`:

| Setting | Default | Description |
|---------|---------|-------------|
| `windowBounds` | `{width: 1200, height: 800}` | Window size |
| `startMinimized` | `false` | Start in system tray |
| `minimizeToTray` | `true` | Hide to tray instead of closing |
| `alwaysOnTop` | `false` | Keep window above others |

## License

MIT
