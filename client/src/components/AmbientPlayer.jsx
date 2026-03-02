import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Volume2, VolumeX, ChevronRight } from 'lucide-react';

/**
 * AmbientPlayer — Generates ambient soundscapes using Web Audio API.
 * Supports: rain, lofi, whitenoise, campfire, ocean, forest, cafe, jazz.
 * No external audio files needed — all procedural synthesis.
 */

const SOUND_CONFIG = {
    rain: { label: '🌧️ Rain', color: 'text-cyan-400' },
    lofi: { label: '🎵 Lo-fi', color: 'text-purple-400' },
    whitenoise: { label: '📻 White Noise', color: 'text-gray-400' },
    campfire: { label: '🔥 Campfire', color: 'text-orange-400' },
    ocean: { label: '🌊 Ocean', color: 'text-blue-400' },
    forest: { label: '🌿 Forest', color: 'text-green-400' },
    cafe: { label: '☕ Café', color: 'text-amber-400' },
    jazz: { label: '🎷 Jazz', color: 'text-yellow-400' },
};

function createRainSound(audioCtx) {
    const bufferSize = 2 * audioCtx.sampleRate;
    const buffer = audioCtx.createBuffer(2, bufferSize, audioCtx.sampleRate);

    // Brown noise for body of rain
    for (let channel = 0; channel < 2; channel++) {
        const data = buffer.getChannelData(channel);
        let last = 0;
        for (let i = 0; i < bufferSize; i++) {
            const white = (Math.random() * 2 - 1);
            last = (last + (0.02 * white)) / 1.02;
            data[i] = last * 3.5;
        }
    }

    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    // Low pass filter for rain character
    const lowpass = audioCtx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 1200;
    lowpass.Q.value = 0.5;

    // Highpass to remove rumble
    const highpass = audioCtx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 150;

    // Subtle stereo widener via delay
    const delay = audioCtx.createDelay();
    delay.delayTime.value = 0.012;

    const merger = audioCtx.createChannelMerger(2);
    const splitter = audioCtx.createChannelSplitter(2);

    source.connect(lowpass);
    lowpass.connect(highpass);
    highpass.connect(splitter);
    splitter.connect(merger, 0, 0);
    splitter.connect(delay, 1);
    delay.connect(merger, 0, 1);

    return { source, output: merger };
}

function createLofiSound(audioCtx) {
    // Rich lo-fi pad: stacked chord with gentle detuning, vinyl crackle, wobble
    const notes = [220, 261.63, 329.63, 392]; // Am7 chord
    const oscs = notes.map((freq, i) => {
        const osc = audioCtx.createOscillator();
        osc.type = i % 2 === 0 ? 'sine' : 'triangle';
        osc.frequency.value = freq;
        osc.detune.value = (Math.random() - 0.5) * 8; // subtle detuning
        return osc;
    });

    // LFO for tape-wobble effect
    const lfo = audioCtx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.25;
    const lfoGain = audioCtx.createGain();
    lfoGain.gain.value = 4;
    lfo.connect(lfoGain);
    lfoGain.connect(oscs[0].frequency);

    // Low pass for warmth (vinyl character)
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 500;
    filter.Q.value = 0.8;

    // Slight reverb via feedback delay
    const reverbDelay = audioCtx.createDelay();
    reverbDelay.delayTime.value = 0.15;
    const reverbGain = audioCtx.createGain();
    reverbGain.gain.value = 0.2;
    reverbDelay.connect(reverbGain);
    reverbGain.connect(reverbDelay);

    const merger = audioCtx.createGain();
    merger.gain.value = 0.12;

    oscs.forEach(osc => osc.connect(merger));
    merger.connect(filter);
    filter.connect(reverbDelay);

    // Mix dry + wet
    const output = audioCtx.createGain();
    output.gain.value = 1;
    filter.connect(output);
    reverbGain.connect(output);

    oscs.forEach(osc => osc.start());
    lfo.start();

    return { source: { stop: () => { oscs.forEach(o => o.stop()); lfo.stop(); } }, output };
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

function createCampfireSound(audioCtx) {
    // Crackling fire: filtered noise bursts with random amplitude
    const bufferSize = 4 * audioCtx.sampleRate;
    const buffer = audioCtx.createBuffer(2, bufferSize, audioCtx.sampleRate);

    for (let channel = 0; channel < 2; channel++) {
        const data = buffer.getChannelData(channel);
        for (let i = 0; i < bufferSize; i++) {
            // Base: brown noise for roar
            const brown = (Math.random() * 2 - 1) * 0.15;
            // Crackle: random spikes
            const crackle = Math.random() < 0.003 ? (Math.random() * 0.8 - 0.4) : 0;
            // Soft pops
            const pop = Math.random() < 0.0005 ? (Math.random() * 1.2 - 0.6) : 0;
            data[i] = brown + crackle + pop;
        }
    }

    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    // Warm bandpass for fire character
    const bp = audioCtx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 600;
    bp.Q.value = 0.4;

    // High shelf to add brightness for crackle
    const shelf = audioCtx.createBiquadFilter();
    shelf.type = 'highshelf';
    shelf.frequency.value = 3000;
    shelf.gain.value = 4;

    source.connect(bp);
    bp.connect(shelf);

    return { source, output: shelf };
}

function createOceanSound(audioCtx) {
    // Ocean waves: layered noise with slow LFO amplitude modulation
    const bufferSize = 4 * audioCtx.sampleRate;
    const buffer = audioCtx.createBuffer(2, bufferSize, audioCtx.sampleRate);

    for (let channel = 0; channel < 2; channel++) {
        const data = buffer.getChannelData(channel);
        let last = 0;
        for (let i = 0; i < bufferSize; i++) {
            last = (last + (0.02 * (Math.random() * 2 - 1))) / 1.02;
            data[i] = last * 4;
        }
    }

    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    // Low pass for deep ocean body
    const lp = audioCtx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 500;
    lp.Q.value = 0.3;

    // LFO to modulate volume for wave rhythm
    const lfo = audioCtx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.08; // ~one wave every 12s

    const lfoGain = audioCtx.createGain();
    lfoGain.gain.value = 0.4;
    lfo.connect(lfoGain);

    const ampMod = audioCtx.createGain();
    ampMod.gain.value = 0.6;
    lfoGain.connect(ampMod.gain);

    source.connect(lp);
    lp.connect(ampMod);
    lfo.start();

    return { source: { stop: () => { source.stop(); lfo.stop(); }, start: () => source.start() }, output: ampMod };
}

function createForestSound(audioCtx) {
    // Forest: gentle wind noise + sporadic bird-like tones
    const bufferSize = 4 * audioCtx.sampleRate;
    const buffer = audioCtx.createBuffer(2, bufferSize, audioCtx.sampleRate);

    for (let channel = 0; channel < 2; channel++) {
        const data = buffer.getChannelData(channel);
        for (let i = 0; i < bufferSize; i++) {
            // Gentle pink noise for wind
            data[i] = (Math.random() * 2 - 1) * 0.12;
            // Occasional high chirps
            if (Math.random() < 0.00008) {
                const chirpLen = Math.floor(800 + Math.random() * 1200);
                const freq = 2000 + Math.random() * 3000;
                for (let j = 0; j < chirpLen && (i + j) < bufferSize; j++) {
                    data[i + j] += Math.sin(2 * Math.PI * freq * j / audioCtx.sampleRate) *
                        0.06 * Math.sin(Math.PI * j / chirpLen); // envelope
                }
            }
        }
    }

    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    // Bandpass for airy wind
    const bp = audioCtx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1200;
    bp.Q.value = 0.2;

    source.connect(bp);

    return { source, output: bp };
}

function createCafeSound(audioCtx) {
    // Café ambience: murmur (low noise) + sporadic clinks + soft hum
    const bufferSize = 4 * audioCtx.sampleRate;
    const buffer = audioCtx.createBuffer(2, bufferSize, audioCtx.sampleRate);

    for (let channel = 0; channel < 2; channel++) {
        const data = buffer.getChannelData(channel);
        for (let i = 0; i < bufferSize; i++) {
            // Human murmur: bandlimited noise
            data[i] = (Math.random() * 2 - 1) * 0.08;
            // Occasional clink/tap sounds
            if (Math.random() < 0.0001) {
                const clinkFreq = 3000 + Math.random() * 4000;
                const clinkLen = Math.floor(200 + Math.random() * 400);
                for (let j = 0; j < clinkLen && (i + j) < bufferSize; j++) {
                    data[i + j] += Math.sin(2 * Math.PI * clinkFreq * j / audioCtx.sampleRate) *
                        0.05 * Math.exp(-j / (clinkLen * 0.15));
                }
            }
        }
    }

    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    // Bandpass for murmur in voice range
    const bp = audioCtx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 800;
    bp.Q.value = 0.3;

    // Slight reverb feel
    const lp = audioCtx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 4000;

    source.connect(bp);
    bp.connect(lp);

    return { source, output: lp };
}

function createJazzSound(audioCtx) {
    // Smooth jazz: walking bass + muted chord voicings + brush rhythm
    // Walking bass line: cycle of notes
    const bassNotes = [130.81, 146.83, 164.81, 174.61, 196, 174.61, 164.81, 146.83]; // C3 walk
    const bassOscs = bassNotes.map((freq) => {
        const osc = audioCtx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;
        return osc;
    });

    // Only play one bass note at a time via gain modulation
    const bassGain = audioCtx.createGain();
    bassGain.gain.value = 0.08;

    // Chord pad (Cmaj7 voicing)
    const chordFreqs = [261.63, 329.63, 392, 493.88]; // C E G B
    const chordOscs = chordFreqs.map(freq => {
        const osc = audioCtx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        osc.detune.value = (Math.random() - 0.5) * 6;
        return osc;
    });

    const chordGain = audioCtx.createGain();
    chordGain.gain.value = 0.04;

    // Rhodes-like warmth filter
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 800;
    filter.Q.value = 0.5;

    // Brush noise (light high-frequency noise)
    const brushBuffer = audioCtx.createBuffer(1, audioCtx.sampleRate * 2, audioCtx.sampleRate);
    const brushData = brushBuffer.getChannelData(0);
    for (let i = 0; i < brushData.length; i++) {
        brushData[i] = (Math.random() * 2 - 1) * 0.02;
    }
    const brushSource = audioCtx.createBufferSource();
    brushSource.buffer = brushBuffer;
    brushSource.loop = true;

    const brushFilter = audioCtx.createBiquadFilter();
    brushFilter.type = 'highpass';
    brushFilter.frequency.value = 6000;

    const brushGainNode = audioCtx.createGain();
    brushGainNode.gain.value = 0.5;

    // Wire up
    const output = audioCtx.createGain();
    output.gain.value = 1;

    // Use only first bass note for simplicity (steady drone)
    bassOscs[0].connect(bassGain);
    bassGain.connect(filter);

    chordOscs.forEach(o => o.connect(chordGain));
    chordGain.connect(filter);

    brushSource.connect(brushFilter);
    brushFilter.connect(brushGainNode);
    brushGainNode.connect(output);
    filter.connect(output);

    // LFO for gentle vibrato
    const lfo = audioCtx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.15;
    const lfoGain = audioCtx.createGain();
    lfoGain.gain.value = 2;
    lfo.connect(lfoGain);
    lfoGain.connect(chordOscs[0].frequency);

    bassOscs[0].start();
    chordOscs.forEach(o => o.start());
    brushSource.start();
    lfo.start();

    return {
        source: {
            stop: () => {
                bassOscs[0].stop();
                chordOscs.forEach(o => o.stop());
                brushSource.stop();
                lfo.stop();
            }
        },
        output
    };
}

const GENERATORS = {
    rain: createRainSound,
    lofi: createLofiSound,
    whitenoise: createWhiteNoise,
    campfire: createCampfireSound,
    ocean: createOceanSound,
    forest: createForestSound,
    cafe: createCafeSound,
    jazz: createJazzSound,
};

const AmbientPlayer = ({ moodSound, isActive = true }) => {
    const [volume, setVolume] = useState(0.3);
    const [isMuted, setIsMuted] = useState(true);
    const [isMinimized, setIsMinimized] = useState(false);
    const [dragX, setDragX] = useState(0);

    const audioCtxRef = useRef(null);
    const gainNodeRef = useRef(null);
    const sourceRef = useRef(null);
    const currentSoundRef = useRef(null);
    const touchStartRef = useRef(null);

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

        setIsMuted(true);

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
    const emoji = config.label.split(' ')[0];

    // Swipe handlers
    const handleTouchStart = (e) => {
        touchStartRef.current = e.touches[0].clientX;
    };

    const handleTouchMove = (e) => {
        if (touchStartRef.current === null) return;
        const currentX = e.touches[0].clientX;
        const diff = currentX - touchStartRef.current;
        // Swipe in any horizontal direction
        setDragX(diff);
    };

    const handleTouchEnd = () => {
        if (Math.abs(dragX) > 50) {
            setIsMinimized(true);
        }
        setDragX(0);
        touchStartRef.current = null;
    };

    if (isMinimized) {
        return (
            <button
                onClick={() => setIsMinimized(false)}
                className="flex items-center justify-center p-2 bg-black/10 dark:bg-white/5 backdrop-blur-sm rounded-full shadow-sm hover:bg-black/20 dark:hover:bg-white/10 hover:scale-110 active:scale-95 transition-all animate-in zoom-in"
                title="Expand Ambient Sounds"
            >
                <span className={`text-base leading-none ${config.color}`}>{emoji}</span>
            </button>
        );
    }

    return (
        <div
            className="flex items-center space-x-2 px-3 py-1.5 bg-black/10 dark:bg-white/5 backdrop-blur-sm rounded-full text-xs transition-transform touch-none select-none"
            style={{
                transform: `translateX(${dragX}px)`,
                opacity: Math.max(0, 1 - Math.abs(dragX) / 100),
                transition: dragX === 0 ? 'all 0.3s ease-out' : 'none'
            }}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
        >
            <div
                className="cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => setIsMinimized(true)}
                title="Minimize (or swipe to hide)"
            >
                <span className={config.color}>{config.label}</span>
            </div>

            <button
                onClick={() => setIsMuted(!isMuted)}
                className="p-1 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                title={isMuted ? 'Unmute' : 'Mute'}
            >
                {isMuted ? <VolumeX className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" /> : <Volume2 className="w-3.5 h-3.5 text-gray-700 dark:text-gray-300" />}
            </button>

            <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                onChange={(e) => { setVolume(parseFloat(e.target.value)); setIsMuted(false); }}
                className="w-16 h-1 bg-gray-300/50 dark:bg-gray-600/50 rounded-lg appearance-none cursor-pointer accent-gray-600 dark:accent-gray-300"
            />

            <div className="w-px h-3 bg-gray-400/30 mx-0.5" />

            <button
                onClick={() => setIsMinimized(true)}
                className="p-0.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                title="Minimize"
            >
                <ChevronRight className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            </button>
        </div>
    );
};

export default AmbientPlayer;
