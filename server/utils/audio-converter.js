const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const fs = require('fs');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('../utils');

// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegPath);
// Set ffprobe path (needed for debugging/probing)
try {
    const ffprobePath = require('@ffprobe-installer/ffprobe').path;
    ffmpeg.setFfprobePath(ffprobePath);
} catch (e) {
    logger.warn('FFprobe not available in audio-converter.js');
}

// Concurrency limit for low-RAM environments (Hetzner/Railway $5 tier)
// This prevents multiple FFmpeg processes from crashing the server
const MAX_CONCURRENT_CONVERSIONS = 2;
let activeConversions = 0;
const conversionQueue = [];

const limitConcurrency = (fn) => {
    return new Promise((resolve, reject) => {
        const execute = async () => {
            activeConversions++;
            try {
                const result = await fn();
                resolve(result);
            } catch (error) {
                reject(error);
            } finally {
                activeConversions--;
                if (conversionQueue.length > 0) {
                    const next = conversionQueue.shift();
                    next();
                }
            }
        };

        if (activeConversions < MAX_CONCURRENT_CONVERSIONS) {
            execute();
        } else {
            conversionQueue.push(execute);
        }
    });
};

/**
 * Convert base64 audio data to AAC (.m4a) format
 * @param {string} base64Audio - The input audio data (base64 string, potentially with data URI prefix)
 * @returns {Promise<string>} - The converted audio as a base64 string (with data:audio/mp4;base64 prefix)
 */
async function convertAudioToAAC(base64Audio) {
    return limitConcurrency(() => {
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
            const inputPath = path.join(tempDir, `${inputId}.input`);
            const outputPath = path.join(tempDir, `${inputId}.m4a`);

            // Write input buffer to file
            fs.writeFile(inputPath, buffer, (err) => {
                if (err) return reject(new Error(`Failed to write temp file: ${err.message}`));

                // Probe input file
                ffmpeg.ffprobe(inputPath, (err, metadata) => {
                    let audioStream = null;
                    if (!err) {
                        audioStream = metadata.streams.find(s => s.codec_type === 'audio');
                    }

                    // 3. Convert using ffmpeg
                    const isAAC = audioStream && audioStream.codec_name === 'aac';

                    let command = ffmpeg(inputPath)
                        .toFormat('mp4')
                        // Web optimization: faststart moves metadata to the front for Safari playback
                        .outputOptions('-movflags +faststart');

                    if (isAAC) {
                        logger.info('[AudioConverter] Input is already AAC. Using stream copy.');
                        command.audioCodec('copy');
                    } else {
                        logger.info('[AudioConverter] Input is not AAC. Re-encoding with optimized settings.');
                        command
                            .audioCodec('aac')
                            .outputOptions([
                                '-ac 1',                // Mono: efficient for voice, 50% less data
                                '-ar 24000',            // 24kHz: perfect for voice messages
                                '-ab 64k',              // 64kbps: High quality for voice
                                '-af aresample=async=1' // Stability for varied sample rates
                            ]);
                    }

                    command
                        .on('start', (commandLine) => {
                            logger.info('[AudioConverter] FFmpeg process started');
                        })
                        .on('end', () => {
                            // 4. Read output file
                            fs.readFile(outputPath, (err, data) => {
                                // Cleanup input always
                                fs.unlink(inputPath, () => { });

                                if (err) {
                                    fs.unlink(outputPath, () => { });
                                    return reject(new Error(`Failed to read converted file: ${err.message}`));
                                }

                                // 5. Cleanup and resolve
                                fs.unlink(outputPath, () => { });
                                const base64Output = `data:audio/mp4;base64,${data.toString('base64')}`;
                                resolve(base64Output);
                            });
                        })
                        .on('error', (err) => {
                            logger.error('[AudioConverter] Error:', err);
                            fs.unlink(inputPath, () => { });
                            fs.unlink(outputPath, () => { });
                            reject(new Error(`FFmpeg conversion failed: ${err.message}`));
                        })
                        .save(outputPath);
                });
            });
        });
    });
}

module.exports = {
    convertAudioToAAC
};
