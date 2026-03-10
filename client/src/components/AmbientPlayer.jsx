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
    campfire: { label: '🔥 Solace', color: 'text-rose-400' },
    ocean: { label: '🌊 Abyss', color: 'text-sky-400' },
    forest: { label: '🌿 Verdant', color: 'text-emerald-400' },
    cafe: { label: '☕ Moka', color: 'text-amber-400' },
    jazz: { label: '🎷 Noire', color: 'text-zinc-400' },
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
    const output = audioCtx.createGain();

    // Track 1: Low rumble (Brown Noise)
    const rumbleSource = audioCtx.createBufferSource();
    const rumbleBuffer = audioCtx.createBuffer(1, audioCtx.sampleRate * 2, audioCtx.sampleRate);
    const rumbleData = rumbleBuffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < rumbleData.length; i++) {
        const white = Math.random() * 2 - 1;
        last = (last + (0.02 * white)) / 1.02;
        rumbleData[i] = last * 0.5;
    }
    rumbleSource.buffer = rumbleBuffer;
    rumbleSource.loop = true;
    const rumbleLP = audioCtx.createBiquadFilter();
    rumbleLP.type = 'lowpass';
    rumbleLP.frequency.value = 150;
    rumbleSource.connect(rumbleLP);
    rumbleLP.connect(output);

    // Track 2: Crackling (Random impulses)
    const crackleSource = audioCtx.createBufferSource();
    const crackleBuffer = audioCtx.createBuffer(1, audioCtx.sampleRate * 4, audioCtx.sampleRate);
    const crackleData = crackleBuffer.getChannelData(0);
    for (let i = 0; i < crackleData.length; i++) {
        if (Math.random() < 0.0008) {
            crackleData[i] = (Math.random() * 2 - 1) * 0.8;
        }
    }
    crackleSource.buffer = crackleBuffer;
    crackleSource.loop = true;
    const crackleHP = audioCtx.createBiquadFilter();
    crackleHP.type = 'highpass';
    crackleHP.frequency.value = 2000;
    crackleSource.connect(crackleHP);
    crackleHP.connect(output);

    // Track 3: Warmth (Subtle Sine)
    const warmth = audioCtx.createOscillator();
    warmth.type = 'sine';
    warmth.frequency.value = 80;
    const warmthGain = audioCtx.createGain();
    warmthGain.gain.value = 0.05;
    warmth.connect(warmthGain);
    warmthGain.connect(output);
    warmth.start();

    rumbleSource.start();
    crackleSource.start();

    return {
        source: { stop: () => { rumbleSource.stop(); crackleSource.stop(); warmth.stop(); } },
        output
    };
}

function createOceanSound(audioCtx) {
    const output = audioCtx.createGain();

    // Deep Lapping Waves (Pink Noise filtered)
    const noiseSource = audioCtx.createBufferSource();
    const noiseBuffer = audioCtx.createBuffer(1, audioCtx.sampleRate * 10, audioCtx.sampleRate);
    const noiseData = noiseBuffer.getChannelData(0);
    let b0, b1, b2, b3, b4, b5, b6;
    b0 = b1 = b2 = b3 = b4 = b5 = b6 = 0.0;
    for (let i = 0; i < noiseData.length; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        noiseData[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
        noiseData[i] *= 0.11; b6 = white * 0.115926;
    }
    noiseSource.buffer = noiseBuffer;
    noiseSource.loop = true;

    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 300;

    const waveGain = audioCtx.createGain();
    const lfo = audioCtx.createOscillator();
    lfo.frequency.value = 0.15; // slow modulation
    const lfoGain = audioCtx.createGain();
    lfoGain.gain.value = 0.4;
    lfo.connect(lfoGain);
    lfoGain.connect(waveGain.gain);
    waveGain.gain.value = 0.4;

    // Distant Seagulls (Rare)
    const gullInterval = setInterval(() => {
        if (Math.random() < 0.1) {
            const osc = audioCtx.createOscillator();
            const g = audioCtx.createGain();
            osc.frequency.setValueAtTime(1500 + Math.random() * 1000, audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(800, audioCtx.currentTime + 0.5);
            g.gain.setValueAtTime(0, audioCtx.currentTime);
            g.gain.linearRampToValueAtTime(0.02, audioCtx.currentTime + 0.1);
            g.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.5);
            osc.connect(g); g.connect(output);
            osc.start(); osc.stop(audioCtx.currentTime + 0.5);
        }
    }, 5000);

    noiseSource.connect(filter);
    filter.connect(waveGain);
    waveGain.connect(output);

    lfo.start();
    noiseSource.start();

    return {
        source: { stop: () => { noiseSource.stop(); lfo.stop(); clearInterval(gullInterval); } },
        output
    };
}

function createForestSound(audioCtx) {
    const output = audioCtx.createGain();

    // Track 1: Forest Floor (Low noise/Leaves)
    const floorSource = audioCtx.createBufferSource();
    const floorBuffer = audioCtx.createBuffer(1, audioCtx.sampleRate * 8, audioCtx.sampleRate);
    const floorData = floorBuffer.getChannelData(0);
    for (let i = 0; i < floorData.length; i++) floorData[i] = (Math.random() * 2 - 1) * 0.02;
    floorSource.buffer = floorBuffer;
    floorSource.loop = true;
    const floorLP = audioCtx.createBiquadFilter();
    floorLP.frequency.value = 400;
    floorSource.connect(floorLP);
    floorLP.connect(output);

    // Track 2: Multiple Birds
    const birdInterval = setInterval(() => {
        if (Math.random() < 0.4) {
            const osc = audioCtx.createOscillator();
            const g = audioCtx.createGain();
            const type = Math.random();
            if (type < 0.5) { // Sharp chirp
                osc.type = 'sine';
                const f = 3000 + Math.random() * 2000;
                osc.frequency.setValueAtTime(f, audioCtx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(f * 1.2, audioCtx.currentTime + 0.1);
                g.gain.setValueAtTime(0, audioCtx.currentTime);
                g.gain.linearRampToValueAtTime(0.03, audioCtx.currentTime + 0.05);
                g.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.15);
                osc.start(); osc.stop(audioCtx.currentTime + 0.2);
            } else { // Two-tone call
                osc.frequency.setValueAtTime(1200 + Math.random() * 500, audioCtx.currentTime);
                osc.frequency.setValueAtTime(1000 + Math.random() * 500, audioCtx.currentTime + 0.1);
                g.gain.setValueAtTime(0, audioCtx.currentTime);
                g.gain.linearRampToValueAtTime(0.04, audioCtx.currentTime + 0.05);
                g.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.3);
                osc.start(); osc.stop(audioCtx.currentTime + 0.4);
            }
            osc.connect(g); g.connect(output);
        }
    }, 1500);

    floorSource.start();

    return {
        source: { stop: () => { floorSource.stop(); clearInterval(birdInterval); } },
        output
    };
}

function createCafeSound(audioCtx) {
    const output = audioCtx.createGain();

    // Murmur Base
    const murmurSource = audioCtx.createBufferSource();
    const murmurBuffer = audioCtx.createBuffer(1, audioCtx.sampleRate * 4, audioCtx.sampleRate);
    const murmurData = murmurBuffer.getChannelData(0);
    for (let i = 0; i < murmurData.length; i++) murmurData[i] = (Math.random() * 2 - 1) * 0.1;
    murmurSource.buffer = murmurBuffer;
    murmurSource.loop = true;
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 600;
    filter.Q.value = 1;
    murmurSource.connect(filter);
    filter.connect(output);

    // Occasional Clinks
    const clinkInterval = setInterval(() => {
        if (Math.random() < 0.2) {
            const osc = audioCtx.createOscillator();
            const g = audioCtx.createGain();
            osc.frequency.value = 4000 + Math.random() * 2000;
            g.gain.setValueAtTime(0.02, audioCtx.currentTime);
            g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
            osc.connect(g);
            g.connect(output);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.1);
        }
    }, 3000);

    murmurSource.start();

    return {
        source: { stop: () => { murmurSource.stop(); clearInterval(clinkInterval); } },
        output
    };
}

function createJazzSound(audioCtx) {
    const output = audioCtx.createGain();

    // Soft Electric Piano (layered sine/triangle)
    const chords = [
        [174.61, 220.00, 261.63, 311.13], // Fmaj7
        [155.56, 196.00, 246.94, 293.66], // Ebmaj7
        [146.83, 185.00, 220.00, 277.18], // Dmaj7
        [138.59, 174.61, 207.65, 246.94]  // Dbmaj7
    ];

    const oscs = [0, 1, 2, 3].map(() => {
        const osc = audioCtx.createOscillator();
        osc.type = 'sine';
        const g = audioCtx.createGain();
        g.gain.value = 0.02;
        osc.connect(g); g.connect(output);
        osc.start();
        return { osc, g };
    });

    // Walking Bass
    const bass = audioCtx.createOscillator();
    bass.type = 'triangle';
    const bassGain = audioCtx.createGain();
    bassGain.gain.value = 0.05;
    bass.connect(bassGain); bassGain.connect(output);
    bass.start();

    const bassLine = [87.31, 110.00, 130.81, 116.54]; // F2, A2, C3, Bb2

    let chordIdx = 0;
    let bassIdx = 0;
    const jazzInterval = setInterval(() => {
        
        // Update Chord
        if (bassIdx === 0) {
            const currentChord = chords[chordIdx];
            oscs.forEach((o, i) => {
                o.osc.frequency.exponentialRampToValueAtTime(currentChord[i], audioCtx.currentTime + 1.5);
                o.g.gain.setTargetAtTime(0.04, audioCtx.currentTime, 0.5);
                o.g.gain.setTargetAtTime(0.02, audioCtx.currentTime + 1.5, 1.0);
            });
            chordIdx = (chordIdx + 1) % chords.length;
        }

        // Update Bass
        bass.frequency.exponentialRampToValueAtTime(bassLine[bassIdx], audioCtx.currentTime + 0.1);
        bassIdx = (bassIdx + 1) % bassLine.length;
    }, 2000);

    return {
        source: { stop: () => { oscs.forEach(o => o.osc.stop()); bass.stop(); clearInterval(jazzInterval); } },
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
