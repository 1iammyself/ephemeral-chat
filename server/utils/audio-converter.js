const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const fs = require('fs');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');

// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegPath);
// Set ffprobe path (needed for debugging/probing)
try {
    const ffprobePath = require('@ffprobe-installer/ffprobe').path;
    ffmpeg.setFfprobePath(ffprobePath);
} catch (e) {
    console.warn('FFprobe not available in audio-converter.js');
}

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

            console.log(`[AudioConverter] Input file written: ${inputPath}, Size: ${buffer.length} bytes`);

            // Probe input file
            ffmpeg.ffprobe(inputPath, (err, metadata) => {
                if (!err) {
                    console.log('[AudioConverter] Input metadata:', JSON.stringify(metadata.format, null, 2));
                    const audioStream = metadata.streams.find(s => s.codec_type === 'audio');
                    if (audioStream) {
                        console.log('[AudioConverter] Input Audio Stream:', JSON.stringify(audioStream, null, 2));
                    }
                } else {
                    console.warn('[AudioConverter] FFprobe failed on input:', err.message);
                }

                // 3. Convert using ffmpeg
                ffmpeg(inputPath)
                    .toFormat('mp4')
                    .audioCodec('aac')
                    // Robust options for Safari/Mobile compatibility
                    .outputOptions([
                        '-movflags +faststart', // Web optimization
                        '-ac 2',                // Force stereo (normalization)
                        '-ar 44100',            // Force 44.1kHz (normalization)
                        '-af aresample=async=1' // Fix timestamp issues
                    ])
                    .on('start', (commandLine) => {
                        console.log('[AudioConverter] Spawned Ffmpeg with command: ' + commandLine);
                    })
                    .on('end', () => {
                        console.log('[AudioConverter] Conversion finished');
                        // 4. Read output file
                        fs.readFile(outputPath, (err, data) => {
                            if (err) {
                                // Cleanup temp files
                                fs.unlink(inputPath, () => { });
                                fs.unlink(outputPath, () => { });
                                return reject(new Error(`Failed to read converted file: ${err.message}`));
                            }

                            console.log(`[AudioConverter] Output file read, Size: ${data.length} bytes`);

                            // Probe output file to check duration/integrity
                            ffmpeg.ffprobe(outputPath, (probeErr, probeData) => {
                                // Cleanup temp files
                                fs.unlink(inputPath, () => { });
                                fs.unlink(outputPath, () => { });

                                if (!probeErr) {
                                    console.log('[AudioConverter] Output metadata:', JSON.stringify(probeData.format, null, 2));
                                    const outStream = probeData.streams.find(s => s.codec_type === 'audio');
                                    if (outStream) {
                                        console.log('[AudioConverter] Output Audio Stream:', JSON.stringify(outStream, null, 2));
                                    }
                                } else {
                                    console.warn('[AudioConverter] FFprobe failed on output:', probeErr.message);
                                }

                                // 5. Return as base64
                                const base64Output = `data:audio/mp4;base64,${data.toString('base64')}`;
                                resolve(base64Output);
                            });
                        });
                    })
                    .on('error', (err) => {
                        console.error('[AudioConverter] Error:', err);
                        // Cleanup temp files
                        fs.unlink(inputPath, () => { });
                        fs.unlink(outputPath, () => { });
                        reject(new Error(`FFmpeg conversion failed: ${err.message}`));
                    })
                    .save(outputPath);
            });
        });
    });
}

module.exports = {
    convertAudioToAAC
};
