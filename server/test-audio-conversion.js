const { convertAudioToAAC } = require('./utils/audio-converter');
const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const ffprobePath = require('@ffprobe-installer/ffprobe').path;

// Set ffprobe path
ffmpeg.setFfprobePath(ffprobePath);

async function testConversion() {
    console.log('Starting audio conversion test...');

    // Generate a 1-second silent WAV file using ffmpeg
    const silentWavPath = path.join(__dirname, 'silent.wav');

    try {
        console.log('Generating silent WAV for testing...');
        await new Promise((resolve, reject) => {
            ffmpeg()
                .input('anullsrc')
                .inputFormat('lavfi')
                .duration(1)
                .save(silentWavPath)
                .on('end', resolve)
                .on('error', reject);
        });
        console.log('Silent WAV generated.');
    } catch (err) {
        console.error('Failed to generate silent WAV:', err);
        return;
    }

    const wavBuffer = fs.readFileSync(silentWavPath);
    const inputBase64 = `data:audio/wav;base64,${wavBuffer.toString('base64')}`;

    // Cleanup silent wav
    fs.unlinkSync(silentWavPath);

    try {
        console.log('Input base64 length:', inputBase64.length);
        const result = await convertAudioToAAC(inputBase64);
        console.log('Conversion successful!');
        console.log('Output base64 prefix:', result.substring(0, 30));
        console.log('Output base64 length:', result.length);

        if (result.startsWith('data:audio/mp4;base64,')) {
            console.log('✅ Output has correct MIME type: audio/mp4');
        } else {
            console.error('❌ Output has incorrect MIME type');
        }

        // Verify codec using ffprobe
        const base64Data = result.replace(/^data:audio\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        const tempPath = path.join(__dirname, 'temp_test_output.m4a');
        fs.writeFileSync(tempPath, buffer);

        await new Promise((resolve, reject) => {
            ffmpeg.ffprobe(tempPath, (err, metadata) => {
                if (err) return reject(err);

                const audioStream = metadata.streams.find(s => s.codec_type === 'audio');
                if (audioStream) {
                    console.log('🔍 FFprobe Analysis:');
                    console.log('   Codec Name:', audioStream.codec_name);
                    console.log('   Codec Long Name:', audioStream.codec_long_name);
                    console.log('   Format Name:', metadata.format.format_name);

                    if (audioStream.codec_name === 'aac') {
                        console.log('✅ Verified: Codec is AAC');
                    } else {
                        console.error('❌ Codec is NOT AAC:', audioStream.codec_name);
                    }
                } else {
                    console.error('❌ No audio stream found');
                }
                resolve();
            });
        });

        // Cleanup
        fs.unlinkSync(tempPath);

    } catch (error) {
        console.error('Test failed:', error);
    }
}

testConversion();
