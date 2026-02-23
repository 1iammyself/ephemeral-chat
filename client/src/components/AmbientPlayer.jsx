import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Volume2, VolumeX } from 'lucide-react';

/**
 * AmbientPlayer — Generates ambient soundscapes using Web Audio API.
 * Supports: rain, lofi (lo-fi beats), whitenoise, campfire, ocean.
 * No external audio files needed.
 */

const SOUND_CONFIG = {
    rain: { label: '🌧️ Rain', color: 'text-cyan-400' },
    lofi: { label: '🎵 Lo-fi', color: 'text-purple-400' },
    whitenoise: { label: '📻 White Noise', color: 'text-gray-400' },
};

function createRainSound(audioCtx) {
    const bufferSize = 2 * audioCtx.sampleRate;
    const buffer = audioCtx.createBuffer(2, bufferSize, audioCtx.sampleRate);

    for (let channel = 0; channel < 2; channel++) {
        const data = buffer.getChannelData(channel);
        for (let i = 0; i < bufferSize; i++) {
            // Brown noise with low-pass character for rain
            data[i] = (Math.random() * 2 - 1) * 0.5;
        }
    }

    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    // Low pass filter for rain character
    const lowpass = audioCtx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 800;
    lowpass.Q.value = 0.7;

    // Highpass to remove rumble
    const highpass = audioCtx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 200;

    source.connect(lowpass);
    lowpass.connect(highpass);

    return { source, output: highpass };
}

function createLofiSound(audioCtx) {
    // Gentle oscillator-based lo-fi pad
    const osc1 = audioCtx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.value = 220; // A3

    const osc2 = audioCtx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = 277.18; // C#4 (major third)

    const osc3 = audioCtx.createOscillator();
    osc3.type = 'sine';
    osc3.frequency.value = 329.63; // E4 (fifth)

    // LFO for gentle wobble
    const lfo = audioCtx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.3;
    const lfoGain = audioCtx.createGain();
    lfoGain.gain.value = 3;
    lfo.connect(lfoGain);
    lfoGain.connect(osc1.frequency);

    // Low pass for warmth
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 600;
    filter.Q.value = 1;

    const merger = audioCtx.createGain();
    merger.gain.value = 0.15;

    osc1.connect(merger);
    osc2.connect(merger);
    osc3.connect(merger);
    merger.connect(filter);

    osc1.start();
    osc2.start();
    osc3.start();
    lfo.start();

    return { source: { stop: () => { osc1.stop(); osc2.stop(); osc3.stop(); lfo.stop(); } }, output: filter };
}

function createWhiteNoise(audioCtx) {
    const bufferSize = 2 * audioCtx.sampleRate;
    const buffer = audioCtx.createBuffer(2, bufferSize, audioCtx.sampleRate);

    for (let channel = 0; channel < 2; channel++) {
        const data = buffer.getChannelData(channel);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * 0.3;
        }
    }

    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    // Gentle bandpass for pleasant white noise
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 2000;
    filter.Q.value = 0.3;

    source.connect(filter);

    return { source, output: filter };
}

const GENERATORS = {
    rain: createRainSound,
    lofi: createLofiSound,
    whitenoise: createWhiteNoise,
};

const AmbientPlayer = ({ moodSound, isActive = true }) => {
    const [volume, setVolume] = useState(0.3);
    const [isMuted, setIsMuted] = useState(false);
    const audioCtxRef = useRef(null);
    const gainNodeRef = useRef(null);
    const sourceRef = useRef(null);
    const currentSoundRef = useRef(null);

    const cleanup = useCallback(() => {
        try {
            if (sourceRef.current?.source) {
                sourceRef.current.source.stop?.();
            }
        } catch (e) { /* ignore */ }
        sourceRef.current = null;

        if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
            audioCtxRef.current.close().catch(() => { });
        }
        audioCtxRef.current = null;
        gainNodeRef.current = null;
        currentSoundRef.current = null;
    }, []);

    useEffect(() => {
        if (!moodSound || !isActive || !GENERATORS[moodSound]) {
            cleanup();
            return;
        }

        if (currentSoundRef.current === moodSound) return;

        // Cleanup previous sound
        cleanup();

        // Create new audio context
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        audioCtxRef.current = audioCtx;

        const gainNode = audioCtx.createGain();
        gainNode.gain.value = isMuted ? 0 : volume;
        gainNode.connect(audioCtx.destination);
        gainNodeRef.current = gainNode;

        const generator = GENERATORS[moodSound];
        const { source, output } = generator(audioCtx);
        output.connect(gainNode);

        if (source.start) source.start();
        sourceRef.current = { source };
        currentSoundRef.current = moodSound;

        return () => cleanup();
    }, [moodSound, isActive]);

    // Update volume
    useEffect(() => {
        if (gainNodeRef.current) {
            gainNodeRef.current.gain.setValueAtTime(
                isMuted ? 0 : volume,
                audioCtxRef.current?.currentTime || 0
            );
        }
    }, [volume, isMuted]);

    if (!moodSound || !SOUND_CONFIG[moodSound]) return null;

    const config = SOUND_CONFIG[moodSound];

    return (
        <div className="flex items-center space-x-2 px-3 py-1.5 bg-black/10 dark:bg-white/5 backdrop-blur-sm rounded-full text-xs">
            <span className={config.color}>{config.label}</span>
            <button
                onClick={() => setIsMuted(!isMuted)}
                className="p-1 rounded-full hover:bg-white/10 transition-colors"
                title={isMuted ? 'Unmute' : 'Mute'}
            >
                {isMuted ? <VolumeX className="w-3.5 h-3.5 text-gray-400" /> : <Volume2 className="w-3.5 h-3.5 text-gray-300" />}
            </button>
            <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                onChange={(e) => { setVolume(parseFloat(e.target.value)); setIsMuted(false); }}
                className="w-16 h-1 accent-white/60 cursor-pointer"
            />
        </div>
    );
};

export default AmbientPlayer;
