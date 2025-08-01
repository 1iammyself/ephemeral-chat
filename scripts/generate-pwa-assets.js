const fs = require('fs');
const { createCanvas, loadImage } = require('canvas');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '../client/public');
const ICON_SIZES = [192, 512];
const THEME_COLOR = '#4F46E5';

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function generateIcons() {
  // Create a simple icon using canvas
  for (const size of ICON_SIZES) {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    
    // Draw background
    ctx.fillStyle = THEME_COLOR;
    ctx.fillRect(0, 0, size, size);
    
    // Draw a simple chat bubble
    const bubbleSize = size * 0.6;
    const bubbleX = (size - bubbleSize) / 2;
    const bubbleY = (size - bubbleSize) / 2;
    
    // Draw rounded rectangle for bubble
    const radius = 20;
    ctx.beginPath();
    ctx.moveTo(bubbleX + radius, bubbleY);
    ctx.lineTo(bubbleX + bubbleSize - radius, bubbleY);
    ctx.quadraticCurveTo(bubbleX + bubbleSize, bubbleY, bubbleX + bubbleSize, bubbleY + radius);
    ctx.lineTo(bubbleX + bubbleSize, bubbleY + bubbleSize - radius);
    ctx.quadraticCurveTo(bubbleX + bubbleSize, bubbleY + bubbleSize, bubbleX + bubbleSize - radius, bubbleY + bubbleSize);
    
    // Draw pointer
    const pointerSize = size * 0.1;
    ctx.lineTo(bubbleX + bubbleSize * 0.7, bubbleY + bubbleSize);
    ctx.lineTo(bubbleX + bubbleSize * 0.6, bubbleY + bubbleSize + pointerSize);
    ctx.lineTo(bubbleX + bubbleSize * 0.4, bubbleY + bubbleSize);
    
    ctx.lineTo(bubbleX + radius, bubbleY + bubbleSize);
    ctx.quadraticCurveTo(bubbleX, bubbleY + bubbleSize, bubbleX, bubbleY + bubbleSize - radius);
    ctx.lineTo(bubbleX, bubbleY + radius);
    ctx.quadraticCurveTo(bubbleX, bubbleY, bubbleX + radius, bubbleY);
    
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    
    // Draw dots for messages
    const dotSize = size * 0.08;
    const dotSpacing = size * 0.12;
    const startX = bubbleX + bubbleSize * 0.3;
    const startY = bubbleY + bubbleSize * 0.4;
    
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(startX + (i * dotSpacing), startY, dotSize, 0, Math.PI * 2);
      ctx.fillStyle = THEME_COLOR;
      ctx.fill();
    }
    
    // Save the icon
    const buffer = canvas.toBuffer('image/png');
    const outputPath = path.join(OUTPUT_DIR, `pwa-${size}x${size}.png`);
    fs.writeFileSync(outputPath, buffer);
    console.log(`Generated ${outputPath}`);
  }
  
  // Create a maskable icon
  const maskableSize = 512;
  const maskableCanvas = createCanvas(maskableSize, maskableSize);
  const maskableCtx = maskableCanvas.getContext('2d');
  
  // Draw background with safe zone
  const safeZone = maskableSize * 0.1;
  maskableCtx.fillStyle = THEME_COLOR;
  maskableCtx.beginPath();
  maskableCtx.roundRect(
    safeZone, 
    safeZone, 
    maskableSize - (2 * safeZone), 
    maskableSize - (2 * safeZone),
    maskableSize * 0.2
  );
  maskableCtx.fill();
  
  // Save the maskable icon
  const maskableBuffer = maskableCanvas.toBuffer('image/png');
  const maskablePath = path.join(OUTPUT_DIR, 'maskable-icon.png');
  fs.writeFileSync(maskablePath, maskableBuffer);
  console.log(`Generated ${maskablePath}`);
  
  // Create a simple splash screen
  const splashSize = 1200;
  const splashCanvas = createCanvas(splashSize, splashSize);
  const splashCtx = splashCanvas.getContext('2d');
  
  // Draw background
  splashCtx.fillStyle = THEME_COLOR;
  splashCtx.fillRect(0, 0, splashSize, splashSize);
  
  // Draw app icon in the center
  const iconSize = splashSize * 0.3;
  const iconX = (splashSize - iconSize) / 2;
  const iconY = (splashSize - iconSize) / 2;
  
  splashCtx.fillStyle = '#FFFFFF';
  splashCtx.beginPath();
  splashCtx.roundRect(
    iconX, 
    iconY, 
    iconSize, 
    iconSize,
    iconSize * 0.2
  );
  splashCtx.fill();
  
  // Save the splash screen
  const splashBuffer = splashCanvas.toBuffer('image/png');
  const splashPath = path.join(OUTPUT_DIR, 'splash-screen.png');
  fs.writeFileSync(splashPath, splashBuffer);
  console.log(`Generated ${splashPath}`);
}

// Run the script
generateIcons().catch(console.error);
