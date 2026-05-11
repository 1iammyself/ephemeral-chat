/**
 * LSB Steganography via Canvas API
 *
 * Embeds AES-encrypted text into the least-significant bits of the
 * blue channel of a PNG image. JPEG carriers are converted to PNG
 * first because JPEG re-compression destroys LSB data.
 *
 * Passphrase is shared out-of-band. The resulting image is visually
 * indistinguishable from the original.
 *
 * Capacity: floor((width * height) / 8) bytes of ciphertext
 */

const MAGIC = new Uint8Array([0x53, 0x54, 0x45, 0x47]); // 'STEG'
const SALT_LEN = 16;
const IV_LEN = 12;

// ── Key derivation ────────────────────────────────────────────────

async function deriveKey(passphrase, salt) {
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// ── Canvas helpers ────────────────────────────────────────────────

function blobToImageData(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      resolve({ canvas, ctx, data: ctx.getImageData(0, 0, canvas.width, canvas.height) });
    };
    img.onerror = reject;
    img.src = url;
  });
}

async function toPNG(blob) {
  if (blob.type === 'image/png') return blob;
  const { canvas } = await blobToImageData(blob);
  return new Promise(res => canvas.toBlob(res, 'image/png'));
}

function canvasToBlob(canvas) {
  return new Promise(res => canvas.toBlob(res, 'image/png'));
}

// ── LSB write/read (blue channel, 1 bit per pixel) ────────────────

function writeBits(pixels, byteArray) {
  // Store length header (4 bytes) + magic (4 bytes) + payload
  const header = new Uint8Array(4);
  const view = new DataView(header.buffer);
  view.setUint32(0, byteArray.length, false);
  const payload = new Uint8Array([...MAGIC, ...header, ...byteArray]);

  if (payload.length * 8 > pixels.data.length / 4) {
    throw new Error('Image too small to carry this payload');
  }

  for (let i = 0; i < payload.length; i++) {
    const byte = payload[i];
    for (let bit = 7; bit >= 0; bit--) {
      const pixelIdx = (i * 8 + (7 - bit)) * 4 + 2; // blue channel
      pixels.data[pixelIdx] = (pixels.data[pixelIdx] & 0xfe) | ((byte >> bit) & 1);
    }
  }
}

function readBits(pixels) {
  const totalPixels = pixels.data.length / 4;
  const headerBytes = MAGIC.length + 4; // magic + length
  if (totalPixels < headerBytes * 8) return null;

  const readByte = (byteIdx) => {
    let byte = 0;
    for (let bit = 7; bit >= 0; bit--) {
      const pixelIdx = (byteIdx * 8 + (7 - bit)) * 4 + 2;
      byte |= (pixels.data[pixelIdx] & 1) << bit;
    }
    return byte;
  };

  // Verify magic
  for (let i = 0; i < MAGIC.length; i++) {
    if (readByte(i) !== MAGIC[i]) return null;
  }

  // Read length
  const lenView = new DataView(new ArrayBuffer(4));
  for (let i = 0; i < 4; i++) lenView.setUint8(i, readByte(MAGIC.length + i));
  const len = lenView.getUint32(0, false);

  if (len > (totalPixels / 8) - headerBytes) return null;

  const payload = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    payload[i] = readByte(headerBytes + i);
  }
  return payload;
}

// ── Public API ────────────────────────────────────────────────────

/**
 * Embed `secretText` into `carrierBlob` (PNG/JPEG) using `passphrase`.
 * Returns a PNG Blob with the hidden message.
 */
export async function embed(carrierBlob, secretText, passphrase) {
  const pngBlob = await toPNG(carrierBlob);
  const { canvas, ctx, data } = await blobToImageData(pngBlob);

  const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
  const key = await deriveKey(passphrase, salt);
  const enc = new TextEncoder();
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(secretText))
  );

  // Layout: [salt (16)] [iv (12)] [ciphertext]
  const payload = new Uint8Array(SALT_LEN + IV_LEN + ciphertext.length);
  payload.set(salt, 0);
  payload.set(iv, SALT_LEN);
  payload.set(ciphertext, SALT_LEN + IV_LEN);

  writeBits(data, payload);
  ctx.putImageData(data, 0, 0);
  return canvasToBlob(canvas);
}

/**
 * Extract the hidden text from `carrierBlob` using `passphrase`.
 * Returns the decrypted string, or null if nothing found / wrong passphrase.
 */
export async function extract(carrierBlob, passphrase) {
  try {
    const pngBlob = await toPNG(carrierBlob);
    const { data } = await blobToImageData(pngBlob);
    const payload = readBits(data);
    if (!payload || payload.length < SALT_LEN + IV_LEN) return null;

    const salt = payload.slice(0, SALT_LEN);
    const iv = payload.slice(SALT_LEN, SALT_LEN + IV_LEN);
    const ciphertext = payload.slice(SALT_LEN + IV_LEN);

    const key = await deriveKey(passphrase, salt);
    const dec = new TextDecoder();
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    return dec.decode(plain);
  } catch {
    return null; // wrong passphrase or no hidden data
  }
}
