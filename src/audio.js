// Procedural Ambient Cosmic Drone using Web Audio API
export class CosmicAudio {
  constructor() {
    this.ctx = null;
    this.isPlaying = false;
    this.gainNode = null;
    this.oscillators = [];
  }

  init() {
    if (this.ctx) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioContext();

    this.gainNode = this.ctx.createGain();
    this.gainNode.gain.setValueAtTime(0.001, this.ctx.currentTime);
    this.gainNode.connect(this.ctx.destination);

    // Deep sub-bass gravitational rumble
    const subOsc = this.ctx.createOscillator();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(43.65, this.ctx.currentTime); // F1

    // Warm resonant mid harmonic
    const midOsc = this.ctx.createOscillator();
    midOsc.type = 'triangle';
    midOsc.frequency.setValueAtTime(65.41, this.ctx.currentTime); // C2

    // Ethereal high chord tone
    const highOsc = this.ctx.createOscillator();
    highOsc.type = 'sine';
    highOsc.frequency.setValueAtTime(130.81, this.ctx.currentTime); // C3

    // Lowpass filter for deep space acoustic dampening
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(160, this.ctx.currentTime);
    filter.Q.setValueAtTime(3.5, this.ctx.currentTime);

    // LFO for slow breathing swells
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.setValueAtTime(0.08, this.ctx.currentTime);
    lfoGain.gain.setValueAtTime(40, this.ctx.currentTime);
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);

    subOsc.connect(filter);
    midOsc.connect(filter);
    highOsc.connect(filter);
    filter.connect(this.gainNode);

    subOsc.start();
    midOsc.start();
    highOsc.start();
    lfo.start();

    this.oscillators = [subOsc, midOsc, highOsc, lfo];
  }

  toggle() {
    this.init();
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    if (this.isPlaying) {
      this.gainNode.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 1.2);
      this.isPlaying = false;
    } else {
      this.gainNode.gain.exponentialRampToValueAtTime(0.22, this.ctx.currentTime + 2.0);
      this.isPlaying = true;
    }
    return this.isPlaying;
  }
}
