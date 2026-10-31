/**
 * Procedural Cosmic Audio Synthesizer
 * 
 * Inspired by:
 * 1. NASA Chandra X-ray Observatory sonification of the Perseus cluster supermassive black hole
 *    (acoustic pressure waves in intracluster gas, scaled from deep infrasound B-flat).
 * 2. Relativistic turbulent plasma flow in the accretion disk (pink/Brownian noise wind).
 * 3. Gravitational redshift & time dilation (pitch and cutoff frequency drop near the horizon).
 */

export class CosmicAudio {
  constructor() {
    this.ctx = null;
    this.isPlaying = false;
    this.masterGain = null;
    this.subOsc1 = null;
    this.subOsc2 = null;
    this.noiseNode = null;
    this.noiseGain = null;
    this.filter = null;
    this.shimmerOsc = null;
  }

  init() {
    if (this.ctx) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioContext();

    // Master Gain (fades in / out)
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.0001, this.ctx.currentTime);
    this.masterGain.connect(this.ctx.destination);

    // Dynamic Lowpass Filter (simulates acoustic absorption and gravitational redshift)
    this.filter = this.ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.setValueAtTime(140, this.ctx.currentTime);
    this.filter.Q.setValueAtTime(4.2, this.ctx.currentTime);
    this.filter.connect(this.masterGain);

    // 1. Deep Infrasonic Gravitational Drone (NASA Perseus B-Flat harmonic ~43.65 Hz & 58.27 Hz)
    this.subOsc1 = this.ctx.createOscillator();
    this.subOsc1.type = 'sine';
    this.subOsc1.frequency.setValueAtTime(43.65, this.ctx.currentTime); // F1 / B-flat harmonic

    this.subOsc2 = this.ctx.createOscillator();
    this.subOsc2.type = 'triangle';
    this.subOsc2.frequency.setValueAtTime(44.15, this.ctx.currentTime); // Slight 0.5Hz detune for cosmic binaural beating

    const subGain = this.ctx.createGain();
    subGain.gain.setValueAtTime(0.35, this.ctx.currentTime);
    this.subOsc1.connect(subGain);
    this.subOsc2.connect(subGain);
    subGain.connect(this.filter);

    // 2. Relativistic Plasma Wind (Brownian / Pink Noise buffer)
    const bufferSize = this.ctx.sampleRate * 4;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    let lastOut = 0.0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      // Pink / brownian filtering
      lastOut = (lastOut + 0.025 * white) / 1.02;
      output[i] = lastOut * 3.5;
    }

    this.noiseNode = this.ctx.createBufferSource();
    this.noiseNode.buffer = noiseBuffer;
    this.noiseNode.loop = true;

    // Bandpass for plasma swirls
    const plasmaFilter = this.ctx.createBiquadFilter();
    plasmaFilter.type = 'bandpass';
    plasmaFilter.frequency.setValueAtTime(220, this.ctx.currentTime);
    plasmaFilter.Q.setValueAtTime(2.8, this.ctx.currentTime);

    this.noiseGain = this.ctx.createGain();
    this.noiseGain.gain.setValueAtTime(0.28, this.ctx.currentTime);

    this.noiseNode.connect(plasmaFilter);
    plasmaFilter.connect(this.noiseGain);
    this.noiseGain.connect(this.filter);

    // 3. Ethereal Photon Ring Shimmer (High resonant harmonic)
    this.shimmerOsc = this.ctx.createOscillator();
    this.shimmerOsc.type = 'sine';
    this.shimmerOsc.frequency.setValueAtTime(116.54, this.ctx.currentTime); // B-flat 2

    const shimmerGain = this.ctx.createGain();
    shimmerGain.gain.setValueAtTime(0.08, this.ctx.currentTime);
    this.shimmerOsc.connect(shimmerGain);
    shimmerGain.connect(this.filter);

    // 4. Slow LFO for Breathing / Tidal Swells
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.setValueAtTime(0.065, this.ctx.currentTime); // 15-second breathing cycle
    lfoGain.gain.setValueAtTime(55, this.ctx.currentTime);
    lfo.connect(lfoGain);
    lfoGain.connect(this.filter.frequency);

    // Start all procedural sources
    this.subOsc1.start();
    this.subOsc2.start();
    this.noiseNode.start();
    this.shimmerOsc.start();
    lfo.start();
  }

  /**
   * Modulate audio parameters in real time based on camera distance to black hole
   * Near horizon (dist ~ 3.2): deeper redshift, heavier sub-bass, muffled high frequencies
   * Far space (dist ~ 25): lighter, wider cosmic wash
   */
  update(cameraDistance) {
    if (!this.isPlaying || !this.ctx || !this.filter) return;

    // Normalized factor: 0.0 near horizon (r=1.06), 1.0 far out (r=25)
    const factor = Math.min(Math.max((cameraDistance - 1.06) / 24.0, 0.0), 1.0);

    const now = this.ctx.currentTime;
    // Gravitational redshift drops the cutoff and sub frequency near the horizon
    const targetFreq = 90 + factor * 160;
    this.filter.frequency.setTargetAtTime(targetFreq, now, 0.2);

    if (this.subOsc1) {
      const subPitch = 34 + factor * 10; // 34Hz (near horizon) up to 44Hz (far away)
      this.subOsc1.frequency.setTargetAtTime(subPitch, now, 0.2);
    }
    if (this.noiseGain) {
      // Plasma wind roar increases as you get closer to the disk
      const windVolume = 0.42 - factor * 0.22;
      this.noiseGain.gain.setTargetAtTime(windVolume, now, 0.2);
    }
  }

  toggle() {
    this.init();
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    const now = this.ctx.currentTime;
    if (this.isPlaying) {
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
      this.masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);
      this.isPlaying = false;
    } else {
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setValueAtTime(Math.max(this.masterGain.gain.value, 0.0001), now);
      this.masterGain.gain.exponentialRampToValueAtTime(0.35, now + 2.0);
      this.isPlaying = true;
    }
    return this.isPlaying;
  }
}
