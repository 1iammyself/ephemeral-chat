/**
 * LSB Steganography via Canvas API
 *
 * Two independent hidden slots per image:
 *   Primary slot  — R + G channel LSBs (2 bits/pixel, ~2× old capacity)
 *   Decoy slot    — B channel LSB       (1 bit/pixel, optional plausible deniability)
 *
 * Each slot is independently AES-GCM encrypted with its own salt + IV.
 * Giving the decoy passphrase reveals only the innocent message; the primary
 * slot is undetectable without its separate passphrase.
 *
 * Backward-compat: legacy images embedded with the old blue-channel 'STEG'
 * format are still extracted correctly.
 *
 * Secret can be plain text or any binary file.
 * Capacity (approx, before encryption overhead):
 *   primary = floor(w × h × 2 / 8) bytes
 *   decoy   = floor(w × h     / 8) bytes
 */

const MAGIC_PRIMARY = new Uint8Array([0x53, 0x54, 0x47, 0x32]); // 'STG2'
const MAGIC_DECOY   = new Uint8Array([0x44, 0x43, 0x4F, 0x59]); // 'DCOY'
const MAGIC_LEGACY  = new Uint8Array([0x53, 0x54, 0x45, 0x47]); // 'STEG' (read-only compat)

const CHANNELS_RG = [0, 1]; // R, G
const CHANNELS_B  = [2];    // B

const SALT_LEN = 16;
const IV_LEN   = 12;
const GCM_TAG  = 16;
const HDR_LEN  = 8; // 4 magic + 4 length

// ── Key derivation ────────────────────────────────────────────────────────────

async function deriveKey(passphrase, salt) {
  const base = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// ── Canvas helpers ────────────────────────────────────────────────────────────

function blobToImageData(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width  = img.naturalWidth;
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

// ── Multi-channel LSB write/read ──────────────────────────────────────────────

function writeBitsToChannels(pixels, magic, byteArray, channelOffsets) {
  const lenBuf = new Uint8Array(4);
  new DataView(lenBuf.buffer).setUint32(0, byteArray.length, false);
  const packet = new Uint8Array([...magic, ...lenBuf, ...byteArray]);

  const bpp = channelOffsets.length;
  if (packet.length * 8 > (pixels.data.length / 4) * bpp) {
    throw new Error('Image too small to carry this payload');
  }

  let bitPos = 0;
  for (let i = 0; i < packet.length; i++) {
    const byte = packet[i];
    for (let bit = 7; bit >= 0; bit--) {
      const val      = (byte >> bit) & 1;
      const pixelNum = Math.floor(bitPos / bpp);
      const chanIdx  = bitPos % bpp;
      const idx      = pixelNum * 4 + channelOffsets[chanIdx];
      pixels.data[idx] = (pixels.data[idx] & 0xfe) | val;
      bitPos++;
    }
  }
}

function readBitsFromChannels(pixels, magic, channelOffsets) {
  const bpp         = channelOffsets.length;
  const totalPixels = pixels.data.length / 4;
  if (totalPixels * bpp < HDR_LEN * 8) return null;

  const readByte = (byteIdx) => {
    let byte = 0;
    for (let bit = 7; bit >= 0; bit--) {
      const bitPos   = byteIdx * 8 + (7 - bit);
      const pixelNum = Math.floor(bitPos / bpp);
      const chanIdx  = bitPos % bpp;
      const idx      = pixelNum * 4 + channelOffsets[chanIdx];
      byte |= (pixels.data[idx] & 1) << bit;
    }
    return byte;
  };

  for (let i = 0; i < magic.length; i++) {
    if (readByte(i) !== magic[i]) return null;
  }

  const lenView = new DataView(new ArrayBuffer(4));
  for (let i = 0; i < 4; i++) lenView.setUint8(i, readByte(magic.length + i));
  const len = lenView.getUint32(0, false);

  const maxPayload = Math.floor((totalPixels * bpp) / 8) - HDR_LEN;
  if (len > maxPayload || len === 0) return null;

  const payload = new Uint8Array(len);
  for (let i = 0; i < len; i++) payload[i] = readByte(HDR_LEN + i);
  return payload;
}

// ── Payload encrypt/decrypt ───────────────────────────────────────────────────

async function encryptSecret(secret, passphrase) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN));
  const iv   = crypto.getRandomValues(new Uint8Array(IV_LEN));
  const key  = await deriveKey(passphrase, salt);

  let plaintext;
  if (typeof secret === 'string') {
    const textBytes = new TextEncoder().encode(secret);
    plaintext = new Uint8Array(1 + textBytes.length);
    plaintext[0] = 0x00; // type: text
    plaintext.set(textBytes, 1);
  } else {
    // File object
    const fileBytes = new Uint8Array(await secret.arrayBuffer());
    const nameBytes = new TextEncoder().encode(secret.name);
    const nameLenBuf = new Uint8Array(2);
    new DataView(nameLenBuf.buffer).setUint16(0, nameBytes.length, false);
    plaintext = new Uint8Array(1 + 2 + nameBytes.length + fileBytes.length);
    plaintext[0] = 0x01; // type: file
    plaintext.set(nameLenBuf, 1);
    plaintext.set(nameBytes, 3);
    plaintext.set(fileBytes, 3 + nameBytes.length);
  }

  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext)
  );
  const payload = new Uint8Array(SALT_LEN + IV_LEN + ciphertext.length);
  payload.set(salt, 0);
  payload.set(iv, SALT_LEN);
  payload.set(ciphertext, SALT_LEN + IV_LEN);
  return payload;
}

async function decryptPayload(raw, passphrase) {
  try {
    if (raw.length < SALT_LEN + IV_LEN + 1) return null;
    const salt       = raw.slice(0, SALT_LEN);
    const iv         = raw.slice(SALT_LEN, SALT_LEN + IV_LEN);
    const ciphertext = raw.slice(SALT_LEN + IV_LEN);
    const key        = await deriveKey(passphrase, salt);
    const plain      = new Uint8Array(
      await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
    );

    const type = plain[0];
    if (type === 0x00) {
      return { type: 'text', text: new TextDecoder().decode(plain.slice(1)) };
    }
    if (type === 0x01) {
      const nameLen  = new DataView(plain.buffer, 1, 2).getUint16(0, false);
      const name     = new TextDecoder().decode(plain.slice(3, 3 + nameLen));
      const fileData = plain.slice(3 + nameLen);
      return { type: 'file', name, blob: new Blob([fileData], { type: guessMime(name) }) };
    }
    return null;
  } catch {
    return null;
  }
}

function guessMime(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const map = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
    pdf: 'application/pdf', txt: 'text/plain', json: 'application/json',
    mp3: 'audio/mpeg', mp4: 'video/mp4', zip: 'application/zip',
  };
  return map[ext] || 'application/octet-stream';
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns the approximate byte capacity of an image for each slot.
 * Subtract your plaintext overhead (~GCM tag 16B + type byte 1B) from primary/decoy.
 */
export async function getCapacity(blob) {
  const { canvas } = await blobToImageData(await toPNG(blob));
  const px       = canvas.width * canvas.height;
  const overhead = HDR_LEN + SALT_LEN + IV_LEN + GCM_TAG + 1; // +1 type byte
  return {
    primary: Math.max(0, Math.floor(px * 2 / 8) - overhead),
    decoy:   Math.max(0, Math.floor(px     / 8) - overhead),
  };
}

/**
 * Embed a secret into the carrier image.
 *
 * @param {Blob}           carrierBlob
 * @param {string|File}    secret       Plain text string or a File object
 * @param {string}         passphrase   Passphrase for the real message
 * @param {object}         [options]
 * @param {string}         [options.decoyText]       Optional decoy message (text only)
 * @param {string}         [options.decoyPassphrase] Passphrase for the decoy message
 * @returns {Promise<Blob>} PNG blob with hidden data
 */
export async function embed(carrierBlob, secret, passphrase, options = {}) {
  const pngBlob = await toPNG(carrierBlob);
  const { canvas, ctx, data } = await blobToImageData(pngBlob);

  const primaryPayload = await encryptSecret(secret, passphrase);
  writeBitsToChannels(data, MAGIC_PRIMARY, primaryPayload, CHANNELS_RG);

  if (options.decoyText && options.decoyPassphrase) {
    const decoyPayload = await encryptSecret(options.decoyText, options.decoyPassphrase);
    writeBitsToChannels(data, MAGIC_DECOY, decoyPayload, CHANNELS_B);
  }

  ctx.putImageData(data, 0, 0);
  return canvasToBlob(canvas);
}

/**
 * Extract a hidden message from an image.
 * Tries primary slot (R+G), then decoy slot (B), then legacy blue-channel slot.
 *
 * @param {Blob}   carrierBlob
 * @param {string} passphrase
 * @returns {Promise<{type:'text',text:string}|{type:'file',name:string,blob:Blob}|null>}
 */
export async function extract(carrierBlob, passphrase) {
  const pngBlob = await toPNG(carrierBlob);
  const { data } = await blobToImageData(pngBlob);

  const slots = [
    [MAGIC_PRIMARY, CHANNELS_RG],
    [MAGIC_DECOY,   CHANNELS_B],
    [MAGIC_LEGACY,  CHANNELS_B],
  ];

  for (const [magic, channels] of slots) {
    const raw = readBitsFromChannels(data, magic, channels);
    if (raw) {
      const result = await decryptPayload(raw, passphrase);
      if (result !== null) return result;
    }
  }
  return null;
}
