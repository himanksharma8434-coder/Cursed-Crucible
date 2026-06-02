/**
 * The Cursed Crucible - Audio Engine
 * Procedural Synthesis using the Web Audio API
 * Avoids external network requests, ensuring immediate and latency-free dark fantasy atmosphere.
 * Enhanced with richer layered sounds, combo multiplier audio cues, and atmospheric depth.
 */

class DarkAudioEngine {
    constructor() {
        this.ctx = null;
        this.isMutedBGM = false;
        this.isMutedSFX = false;
        
        // Audio nodes for Ambient BGM
        this.bgmNode = null;
        this.droneOsc1 = null;
        this.droneOsc2 = null;
        this.windNoise = null;
        this.bgmGain = null;
        
        // State
        this.initialized = false;
        this.mergeCount = 0;
    }

    /**
     * Initializes the AudioContext upon user gesture
     */
    init() {
        if (this.initialized) return;

        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContextClass();
            this.bgmGain = this.ctx.createGain();
            this.bgmGain.gain.setValueAtTime(0, this.ctx.currentTime);
            this.bgmGain.connect(this.ctx.destination);
            
            this.initialized = true;
            this.startBGM();
        } catch (e) {
            console.error("Failed to initialize Web Audio API:", e);
        }
    }

    /**
     * Resumes the AudioContext if it is suspended (browser security)
     */
    async resume() {
        this.init();
        if (this.ctx && this.ctx.state === 'suspended') {
            await this.ctx.resume();
        }
    }

    /**
     * Synthesizes a seamless low-frequency cello-like BGM drone with cold ambient wind noise.
     * Enhanced with sub-bass, ethereal pad, and subtle chime layer.
     */
    startBGM() {
        if (!this.initialized || this.bgmNode || this.isMutedBGM) return;

        const now = this.ctx.currentTime;

        // 1. Synth Drone Oscillator 1 (Cello Root - A1 55Hz)
        this.droneOsc1 = this.ctx.createOscillator();
        this.droneOsc1.type = 'sawtooth';
        this.droneOsc1.frequency.setValueAtTime(55, now);
        
        // Lowpass filter to make it soft and dark
        const filter1 = this.ctx.createBiquadFilter();
        filter1.type = 'lowpass';
        filter1.frequency.setValueAtTime(140, now);
        filter1.Q.setValueAtTime(1.5, now);

        // LFO for slow volume swells
        const lfo = this.ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.setValueAtTime(0.08, now); // Very slow 12s cycle
        const lfoGain = this.ctx.createGain();
        lfoGain.gain.setValueAtTime(0.04, now);
        
        const droneGain1 = this.ctx.createGain();
        droneGain1.gain.setValueAtTime(0.06, now);

        // Connect LFO to drone volume swell
        lfo.connect(lfoGain);
        lfoGain.connect(droneGain1.gain);

        this.droneOsc1.connect(filter1);
        filter1.connect(droneGain1);
        droneGain1.connect(this.bgmGain);

        // 2. Synth Drone Oscillator 2 (Fifth Harmonic - E2 82.4Hz)
        this.droneOsc2 = this.ctx.createOscillator();
        this.droneOsc2.type = 'sine';
        this.droneOsc2.frequency.setValueAtTime(82.4, now);

        const droneGain2 = this.ctx.createGain();
        droneGain2.gain.setValueAtTime(0.08, now);
        this.droneOsc2.connect(droneGain2);
        droneGain2.connect(this.bgmGain);

        // 2.5 Sub-bass layer (27.5Hz - A0 sub-octave)
        const subOsc = this.ctx.createOscillator();
        subOsc.type = 'sine';
        subOsc.frequency.setValueAtTime(27.5, now);
        const subGain = this.ctx.createGain();
        subGain.gain.setValueAtTime(0.05, now);
        subOsc.connect(subGain);
        subGain.connect(this.bgmGain);

        // 2.6 Ethereal pad shimmer (high, barely audible)
        const padOsc = this.ctx.createOscillator();
        padOsc.type = 'sine';
        padOsc.frequency.setValueAtTime(440, now);
        const padFilter = this.ctx.createBiquadFilter();
        padFilter.type = 'lowpass';
        padFilter.frequency.setValueAtTime(500, now);
        padFilter.Q.setValueAtTime(8, now);
        const padGain = this.ctx.createGain();
        padGain.gain.setValueAtTime(0.008, now);

        // Slow pad LFO for volume breathing
        const padLfo = this.ctx.createOscillator();
        padLfo.type = 'sine';
        padLfo.frequency.setValueAtTime(0.03, now); // 33s cycle
        const padLfoGain = this.ctx.createGain();
        padLfoGain.gain.setValueAtTime(0.006, now);
        padLfo.connect(padLfoGain);
        padLfoGain.connect(padGain.gain);

        padOsc.connect(padFilter);
        padFilter.connect(padGain);
        padGain.connect(this.bgmGain);

        // 3. Ambient Wind Noise generator
        const bufferSize = 2 * this.ctx.sampleRate;
        const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            output[i] = Math.random() * 2 - 1;
        }

        const whiteNoise = this.ctx.createBufferSource();
        whiteNoise.buffer = noiseBuffer;
        whiteNoise.loop = true;

        // Bandpass filter centered at 300Hz with high resonance
        const windFilter = this.ctx.createBiquadFilter();
        windFilter.type = 'bandpass';
        windFilter.frequency.setValueAtTime(350, now);
        windFilter.Q.setValueAtTime(3.0, now);

        // Modulate wind frequency slowly
        const windLFO = this.ctx.createOscillator();
        windLFO.type = 'sine';
        windLFO.frequency.setValueAtTime(0.04, now);
        const windLFOGain = this.ctx.createGain();
        windLFOGain.gain.setValueAtTime(100, now);
        windLFO.connect(windLFOGain);
        windLFOGain.connect(windFilter.frequency);

        const windGain = this.ctx.createGain();
        windGain.gain.setValueAtTime(0.015, now);

        whiteNoise.connect(windFilter);
        windFilter.connect(windGain);
        windGain.connect(this.bgmGain);

        // Start BGM nodes
        this.droneOsc1.start(now);
        this.droneOsc2.start(now);
        subOsc.start(now);
        padOsc.start(now);
        padLfo.start(now);
        lfo.start(now);
        windLFO.start(now);
        whiteNoise.start(now);

        // Fade-in BGM gently
        this.bgmGain.gain.cancelScheduledValues(now);
        this.bgmGain.gain.setValueAtTime(0, now);
        this.bgmGain.gain.linearRampToValueAtTime(1, now + 3);

        // Keep references to stop them later
        this.bgmNodes = [this.droneOsc1, this.droneOsc2, subOsc, padOsc, padLfo, lfo, windLFO, whiteNoise];
    }

    /**
     * Stops background music nodes
     */
    stopBGM() {
        if (!this.initialized || !this.bgmNodes) return;

        const now = this.ctx.currentTime;
        this.bgmGain.gain.cancelScheduledValues(now);
        this.bgmGain.gain.linearRampToValueAtTime(0, now + 0.5);

        setTimeout(() => {
            if (this.bgmNodes) {
                this.bgmNodes.forEach(node => {
                    try { node.stop(); } catch(e) {}
                });
                this.bgmNodes = null;
            }
        }, 600);
    }

    /**
     * Toggles BGM mute state
     */
    toggleMusic() {
        this.isMutedBGM = !this.isMutedBGM;
        if (this.isMutedBGM) {
            this.stopBGM();
        } else {
            this.resume().then(() => this.startBGM());
        }
        return this.isMutedBGM;
    }

    /**
     * Toggles SFX mute state
     */
    toggleSound() {
        this.isMutedSFX = !this.isMutedSFX;
        return this.isMutedSFX;
    }

    /**
     * Play Drop Sound (Thud into Liquid Cauldron)
     * Fast pitch-down sweep + low-pass filter + subtle splash layer
     */
    playDrop() {
        if (!this.initialized || this.isMutedSFX) return;

        const now = this.ctx.currentTime;
        
        // Primary oscillator for liquid impact
        const osc = this.ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(30, now + 0.35);

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(180, now);
        filter.frequency.exponentialRampToValueAtTime(60, now + 0.3);

        const gainNode = this.ctx.createGain();
        gainNode.gain.setValueAtTime(0.45, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.4);

        osc.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.45);

        // Subtle splash noise layer
        const splashSize = 0.06 * this.ctx.sampleRate;
        const splashBuf = this.ctx.createBuffer(1, splashSize, this.ctx.sampleRate);
        const splashData = splashBuf.getChannelData(0);
        for (let i = 0; i < splashSize; i++) {
            splashData[i] = (Math.random() * 2 - 1) * (1 - i / splashSize);
        }
        const splashSrc = this.ctx.createBufferSource();
        splashSrc.buffer = splashBuf;
        const splashFilter = this.ctx.createBiquadFilter();
        splashFilter.type = 'bandpass';
        splashFilter.frequency.setValueAtTime(800, now);
        splashFilter.Q.setValueAtTime(2, now);
        const splashGain = this.ctx.createGain();
        splashGain.gain.setValueAtTime(0.12, now);
        splashGain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        splashSrc.connect(splashFilter);
        splashFilter.connect(splashGain);
        splashGain.connect(this.ctx.destination);
        splashSrc.start(now + 0.05);
        splashSrc.stop(now + 0.15);
    }

    /**
     * Play Merge Sound (Crunch & Magic Pop)
     * Enhanced with harmonic overtone and pitch variation based on merge count
     */
    playMerge() {
        if (!this.initialized || this.isMutedSFX) return;

        const now = this.ctx.currentTime;
        this.mergeCount++;

        // Pitch variation for successive merges (rising pitch = excitement)
        const pitchBonus = Math.min(this.mergeCount * 30, 200);

        // --- THE POP: Resonant magic bell ---
        const oscPop = this.ctx.createOscillator();
        oscPop.type = 'sine';
        oscPop.frequency.setValueAtTime(260 + pitchBonus, now);
        oscPop.frequency.exponentialRampToValueAtTime(520 + pitchBonus, now + 0.12);

        const gainPop = this.ctx.createGain();
        gainPop.gain.setValueAtTime(0.3, now);
        gainPop.gain.exponentialRampToValueAtTime(0.01, now + 0.25);

        oscPop.connect(gainPop);
        gainPop.connect(this.ctx.destination);
        oscPop.start(now);
        oscPop.stop(now + 0.3);

        // --- Harmonic overtone ---
        const overtone = this.ctx.createOscillator();
        overtone.type = 'sine';
        overtone.frequency.setValueAtTime((260 + pitchBonus) * 2, now);
        const overtoneGain = this.ctx.createGain();
        overtoneGain.gain.setValueAtTime(0.08, now);
        overtoneGain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        overtone.connect(overtoneGain);
        overtoneGain.connect(this.ctx.destination);
        overtone.start(now);
        overtone.stop(now + 0.2);

        // --- THE CRUNCH: Bone/Wisp crackle ---
        const noiseSize = 0.08 * this.ctx.sampleRate;
        const buffer = this.ctx.createBuffer(1, noiseSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < noiseSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noiseSrc = this.ctx.createBufferSource();
        noiseSrc.buffer = buffer;

        const crunchFilter = this.ctx.createBiquadFilter();
        crunchFilter.type = 'bandpass';
        crunchFilter.frequency.setValueAtTime(1800 + pitchBonus * 2, now);

        const gainCrunch = this.ctx.createGain();
        gainCrunch.gain.setValueAtTime(0.2, now);
        gainCrunch.gain.exponentialRampToValueAtTime(0.01, now + 0.08);

        noiseSrc.connect(crunchFilter);
        crunchFilter.connect(gainCrunch);
        gainCrunch.connect(this.ctx.destination);

        noiseSrc.start(now);
        noiseSrc.stop(now + 0.1);

        // Reset merge count after a timeout (combo window)
        clearTimeout(this._mergeResetTimer);
        this._mergeResetTimer = setTimeout(() => {
            this.mergeCount = 0;
        }, 2000);
    }

    /**
     * Play Game Over Sound (Sinister Metallic Gong with Whispers)
     * FM synthesis-like deep bell + noise swell
     */
    playGameOver() {
        if (!this.initialized || this.isMutedSFX) return;

        const now = this.ctx.currentTime;

        // 1. Fundamental Low Gong (Root: 73.4Hz - D2)
        const carrier = this.ctx.createOscillator();
        carrier.type = 'sawtooth';
        carrier.frequency.setValueAtTime(73.4, now);

        // 2. Modulator (FM synthesis for sinister metallic ring)
        const modulator = this.ctx.createOscillator();
        modulator.type = 'sine';
        modulator.frequency.setValueAtTime(113, now);

        const modGain = this.ctx.createGain();
        modGain.gain.setValueAtTime(150, now);

        // Lowpass filter to suppress harsh saw highs
        const gongFilter = this.ctx.createBiquadFilter();
        gongFilter.type = 'lowpass';
        gongFilter.frequency.setValueAtTime(220, now);

        const gainGong = this.ctx.createGain();
        gainGong.gain.setValueAtTime(0.7, now);
        gainGong.gain.exponentialRampToValueAtTime(0.01, now + 2.5);

        // Connections
        modulator.connect(modGain);
        modGain.connect(carrier.frequency);
        
        carrier.connect(gongFilter);
        gongFilter.connect(gainGong);
        gainGong.connect(this.ctx.destination);

        // 3. Sinister whisper noise swell
        const bufferSize = 1.8 * this.ctx.sampleRate;
        const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for(let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noiseNode = this.ctx.createBufferSource();
        noiseNode.buffer = noiseBuffer;

        const noiseFilter = this.ctx.createBiquadFilter();
        noiseFilter.type = 'bandpass';
        noiseFilter.frequency.setValueAtTime(450, now);
        noiseFilter.Q.setValueAtTime(5.0, now);

        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(0, now);
        noiseGain.gain.linearRampToValueAtTime(0.12, now + 0.4);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 1.8);

        noiseNode.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(this.ctx.destination);

        // 4. Descending doom tone
        const doomOsc = this.ctx.createOscillator();
        doomOsc.type = 'sine';
        doomOsc.frequency.setValueAtTime(200, now);
        doomOsc.frequency.exponentialRampToValueAtTime(40, now + 2.0);
        const doomGain = this.ctx.createGain();
        doomGain.gain.setValueAtTime(0.15, now);
        doomGain.gain.exponentialRampToValueAtTime(0.001, now + 2.0);
        doomOsc.connect(doomGain);
        doomGain.connect(this.ctx.destination);

        // Trigger notes
        modulator.start(now);
        carrier.start(now);
        noiseNode.start(now);
        doomOsc.start(now);

        modulator.stop(now + 2.6);
        carrier.stop(now + 2.6);
        noiseNode.stop(now + 2.0);
        doomOsc.stop(now + 2.2);
    }
}

// Global Audio Engine Instance
const gameAudio = new DarkAudioEngine();
window.gameAudio = gameAudio;
