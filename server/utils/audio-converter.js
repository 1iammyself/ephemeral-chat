const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const fs = require('fs');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');

// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegPath);

/**
 * Convert base64 audio data to AAC (.m4a) format
 * @param {string} base64Audio - The input audio data (base64 string, potentially with data URI prefix)
 * @returns {Promise<string>} - The converted audio as a base64 string (with data:audio/mp4;base64 prefix)
 */
async function convertAudioToAAC(base64Audio) {
  return new Promise((resolve, reject) => {
    // 1. Parse base64 data
    let buffer;
    try {
      // Remove data URI prefix if present
      const base64Data = base64Audio.replace(/^data:audio\/\w+;base64,/, '');
      buffer = Buffer.from(base64Data, 'base64');
    } catch (error) {
      return reject(new Error('Invalid base64 audio data'));
    }

    // 2. Create temporary files
    const tempDir = os.tmpdir();
    const inputId = uuidv4();
    const inputPath = path.join(tempDir, `${inputId}.input`); // Extensionless or generic
    const outputPath = path.join(tempDir, `${inputId}.m4a`);

    // Write input buffer to file
    fs.writeFile(inputPath, buffer, (err) => {
      if (err) return reject(new Error(`Failed to write temp file: ${err.message}`));

      // 3. Convert using ffmpeg
      ffmpeg(inputPath)
        .toFormat('mp4') // AAC is typically in mp4 container for m4a
        .audioCodec('aac')
        .on('end', () => {
          // 4. Read output file
          fs.readFile(outputPath, (err, data) => {
            // Cleanup temp files
            fs.unlink(inputPath, () => {});
            fs.unlink(outputPath, () => {});

            if (err) return reject(new Error(`Failed to read converted file: ${err.message}`));

            // 5. Return as base64
            const base64Output = `data:audio/mp4;base64,${data.toString('base64')}`;
            resolve(base64Output);
          });
        })
        .on('error', (err) => {
          // Cleanup temp files
          fs.unlink(inputPath, () => {});
          fs.unlink(outputPath, () => {});
          reject(new Error(`FFmpeg conversion failed: ${err.message}`));
        })
        .save(outputPath);
    });
  });
}

module.exports = {
  convertAudioToAAC
};
