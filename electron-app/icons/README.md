# App Icons

Place your application icons here:

## Required Files

1. **icon.png** (512x512 or larger)
   - Used as the base icon
   - Required for Linux builds
   - electron-builder will use this to generate other formats if missing

2. **icon.ico** (Windows)
   - Multi-resolution icon containing: 16x16, 32x32, 48x48, 64x64, 128x128, 256x256
   - Use a tool like [RealFaviconGenerator](https://realfavicongenerator.net/) or [ICOConvert](https://icoconvert.com/)

3. **icon.icns** (macOS)
   - Apple icon format
   - Can be generated from PNG using:
     ```bash
     # On macOS:
     iconutil -c icns icon.iconset
     
     # Or use electron-icon-maker:
     npx electron-icon-maker --input=icon.png --output=./
     ```

## Quick Generation

You can use `electron-icon-maker` to generate all formats from a single PNG:

```bash
npx electron-icon-maker --input=icon.png --output=./icons
```

## Placeholder

Until you add real icons, the app will use Electron's default icon.
