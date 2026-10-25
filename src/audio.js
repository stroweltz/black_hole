/**
 * Procedural & NASA Sonification Cosmic Audio Engine
 *
 * Implements real-time relativistic gravitational audio warping:
 * 1. Gravitational blueshift / redshift & time dilation (AudioBufferSourceNode playbackRate & oscillator detune).
 * 2. Relativistic energy flux volume scaling with brickwall DynamicsCompressor safety limiting.
 * 3. Accretion disk Doppler splitting (approaching side blue-shifted & beamed, receding side red-shifted).
 * 4. Photon ring feedback delay line (Johnson et al. 2020 factor e^-pi ~= 0.043; delay 0.75s / gamma).
 * 5. Celestial horizon stereo narrowing (width = 1 - shadowFrac).
 * 6. 3D spatial positioning (HRTF PannerNode at singularity with AudioListener camera tracking).
 *
 * Attribution:
 * Sonification: NASA/CXC/SAO/K.Arcand, SYSTEM Sounds (M. Russo, A. Santaguida)
 * Chandra Media Use Policy: https://chandra.si.edu/about/copyright.html
 */

export const DEFAULT_AUDIO_URL = './audio/Data Sonification_ Black Hole at the Center of the Perseus Galaxy Cluster (X-ray).mp3';

export const AUDIO_CONFIG = {
  shiftMode: 'blue',          // 'blue' (gravitational blueshift for falling observer) or 'red'
  enableGravShift: true,      // 1. Relativistic frequency & time warp
  enableVolumeScaling: true,  // 2. Relativistic energy volume boost with limiter
  enableDopplerLayers: true,  // 3. Accretion disk Doppler splitting (approaching/receding)
  enablePhotonRingEcho: true, // 4. Photon ring feedback delay (feedback e^-pi = 0.043)
  enableStereoNarrowing: true,// 5. Celestial horizon stereo narrowing (1 - shadowFrac)
  enableSpatialPanner: true   // 6. 3D spatial anchor at singularity + AudioListener
};

export const AUDIO_ATTRIBUTION = {
  nasa: {
    ru: {
      title: 'О звуке',
      desc: 'Звук основан на сонификации данных рентгеновской обсерватории Chandra: волны давления горячего газа в скоплении Персея преобразованы в звук и подняты на 57 октав в слышимый диапазон.',
      credit: 'Sonification: NASA/CXC/SAO/K.Arcand, SYSTEM Sounds (M. Russo, A. Santaguida)',
      sourceBadge: 'Текущий источник: Сонификация NASA Perseus'
    },
    en: {
      title: 'About the Sound',
      desc: "Based on NASA's sonification of data from the Chandra X-ray Observatory: pressure waves in the hot gas of the Perseus cluster, scaled up 57 octaves into the range of human hearing.",
      credit: 'Sonification: NASA/CXC/SAO/K.Arcand, SYSTEM Sounds (M. Russo, A. Santaguida)',
      sourceBadge: 'Current Source: NASA Perseus Sonification'
    }
  },
  synth: {
    ru: {
      title: 'О звуке',
      desc: 'Звук синтезируется в браузере и вдохновлён сонификацией NASA: в 2003 году телескоп Chandra обнаружил в скоплении Персея волны давления горячего газа, которые по высоте лежат примерно на 57 октав ниже до первой октавы. NASA сдвинула их в слышимый диапазон, здесь же высота меняется с гравитационным смещением частоты по мере приближения к дыре.',
      credit: 'Источник идеи: NASA/CXC/SAO/K.Arcand, SYSTEM Sounds (M. Russo, A. Santaguida)',
      sourceBadge: 'Текущий источник: Процедурный синтез (B♭1 58.27 Гц)'
    },
    en: {
      title: 'About the Sound',
      desc: "The audio is synthesized in your browser and inspired by NASA's sonification: in 2003 Chandra revealed pressure waves in the hot gas of the Perseus cluster, roughly 57 octaves below middle C. NASA shifted them into the audible range; here the pitch also follows gravitational frequency shift as you approach the hole.",
      credit: 'Inspired by: NASA/CXC/SAO/K.Arcand, SYSTEM Sounds (M. Russo, A. Santaguida)',
      sourceBadge: 'Current Source: Procedural Synthesis (B♭1 58.27 Hz)'
    }
  },
  custom: {
    ru: {
      title: 'О звуке',
      desc: 'Свой звук: пользовательский аудиофайл. Гравитационное смещение частоты, релятивистский доплер аккреционного диска и эхо фотонной сферы рассчитываются и применяются в реальном времени.',
      credit: '',
      sourceBadge: 'Текущий источник: Пользовательский трек'
    },
    en: {
      title: 'About the Sound',
      desc: 'Custom sound: playing user audio file. Gravitational frequency shift, relativistic accretion disk Doppler effect, and photon sphere echo are computed and applied in real time.',
      credit: '',
      sourceBadge: 'Current Source: Custom Audio Track'
    }
  }
};

/**
 * Generate soft tanh saturation curve for missing fundamental harmonics reproduction
 */
function makeTanhDistortionCurve(samples = 1024, amount = 1.4) {
  const curve = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    curve[i] = Math.tanh(amount * x);
  }
  return curve;
}

export class CosmicAudio {
  constructor() {
    this.ctx = null;
    this.isPlaying = false;
    this.sourceMode = 'nasa'; // 'nasa' | 'synth' | 'custom'
    this.customFileName = null;
    this.isLoadingAudio = false;
    this.onSourceChange = null;
    this.userVolume = 0.60; // Comfortable calibrated default volume
    this.comfortMode = true; // Calmed centered audio: eliminates vestibular motion sickness/nausea

    // Decoded and seamlessly looped AudioBuffer
    this.audioBuffer = null;

    // Buffer playback layers (Doppler approaching & receding layers)
    this.bufferLayers = [];
    this.bufferMasterGain = null;
    this.bufferWarmthFilter = null;

    // Procedural synthesis nodes
    this.synthMasterGain = null;
    this.pitched = [];
    this.subOsc1 = null;
    this.subOsc2 = null;
    this.harm2 = null;
    this.harm3 = null;
    this.harm4 = null;
    this.shimmerOsc = null;
    this.waveShaper = null;
    this.noiseNode = null;
    this.noiseGain = null;
    this.plasmaFilter = null;
    this.synthFilter = null;
    this.lfo = null;
    this.lfoGain = null;

    // Common audio effect pipeline
    this.mixGain = null;
    this.gravGain = null;

    // Photon ring echo delay
    this.dryGain = null;
    this.echoSendGain = null;
    this.echoDelayNode = null;
    this.echoFeedbackGain = null;
    this.postEchoMix = null;

    // Stereo field narrowing matrix
    this.stereoSplitter = null;
    this.stereoMerger = null;
    this.gainLL = null;
    this.gainLR = null;
    this.gainRL = null;
    this.gainRR = null;

    // 3D Spatial positioning & limiter
    this.spatialPanner = null;
    this.compressor = null;
    this.masterGain = null;

    // Fallback timer for suspend
    this.suspendTimeout = null;
  }

  /**
   * Lazy initialization of Web Audio context and node routing graph
   */
  init() {
    if (this.ctx) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioContextClass();

    const now = this.ctx.currentTime;

    // 1. Master Output Gain
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.0001, now);
    this.masterGain.connect(this.ctx.destination);

    // 2. Dynamics Compressor (Brickwall safety limiter near horizon)
    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.setValueAtTime(-6.0, now);
    this.compressor.knee.setValueAtTime(4.0, now);
    this.compressor.ratio.setValueAtTime(6.0, now);
    this.compressor.attack.setValueAtTime(0.003, now);
    this.compressor.release.setValueAtTime(0.12, now);
    this.compressor.connect(this.masterGain);

    // 3. 3D Spatial Panner (HRTF anchored at singularity (0, 0, 0))
    this.spatialPanner = this.ctx.createPanner();
    this.spatialPanner.panningModel = 'HRTF';
    this.spatialPanner.distanceModel = 'linear';
    this.spatialPanner.refDistance = 10.0;
    this.spatialPanner.maxDistance = 500.0;
    this.spatialPanner.rolloffFactor = 0.05; // Retains rich volume regardless of orbital distance
    if (this.spatialPanner.positionX) {
      this.spatialPanner.positionX.setValueAtTime(0, now);
      this.spatialPanner.positionY.setValueAtTime(0, now);
      this.spatialPanner.positionZ.setValueAtTime(0, now);
    } else {
      this.spatialPanner.setPosition(0, 0, 0);
    }
    this.spatialPanner.connect(this.compressor);

    // 4. Stereo Narrowing Matrix (width = 1 - shadowFrac)
    this.stereoSplitter = this.ctx.createChannelSplitter(2);
    this.stereoMerger = this.ctx.createChannelMerger(2);

    this.gainLL = this.ctx.createGain();
    this.gainRR = this.ctx.createGain();
    this.gainRL = this.ctx.createGain();
    this.gainLR = this.ctx.createGain();

    this.gainLL.gain.setValueAtTime(1.0, now);
    this.gainRR.gain.setValueAtTime(1.0, now);
    this.gainRL.gain.setValueAtTime(0.0, now);
    this.gainLR.gain.setValueAtTime(0.0, now);

    this.stereoSplitter.connect(this.gainLL, 0);
    this.gainLL.connect(this.stereoMerger, 0, 0);

    this.stereoSplitter.connect(this.gainLR, 0);
    this.gainLR.connect(this.stereoMerger, 0, 1);

    this.stereoSplitter.connect(this.gainRL, 1);
    this.gainRL.connect(this.stereoMerger, 0, 0);

    this.stereoSplitter.connect(this.gainRR, 1);
    this.gainRR.connect(this.stereoMerger, 0, 1);

    this.stereoMerger.connect(this.spatialPanner);

    // 5. Photon Ring Echo Delay Line (feedback factor e^-pi ~= 0.043; Johnson et al. 2020)
    this.postEchoMix = this.ctx.createGain();
    this.postEchoMix.gain.setValueAtTime(1.0, now);
    this.postEchoMix.connect(this.stereoSplitter);

    this.dryGain = this.ctx.createGain();
    this.dryGain.gain.setValueAtTime(0.85, now);
    this.dryGain.connect(this.postEchoMix);

    this.echoDelayNode = this.ctx.createDelay(3.0);
    this.echoDelayNode.delayTime.setValueAtTime(0.75, now);

    this.echoFeedbackGain = this.ctx.createGain();
    this.echoFeedbackGain.gain.setValueAtTime(0.043, now); // e^-pi = 0.0432139... (-27.3 dB)

    this.echoSendGain = this.ctx.createGain();
    this.echoSendGain.gain.setValueAtTime(0.35, now);

    this.echoDelayNode.connect(this.echoFeedbackGain);
    this.echoFeedbackGain.connect(this.echoDelayNode);
    this.echoDelayNode.connect(this.postEchoMix);

    // 6. Gravitational Volume Scaling (gain ∝ gamma^0.65)
    this.gravGain = this.ctx.createGain();
    this.gravGain.gain.setValueAtTime(1.0, now);
    this.gravGain.connect(this.dryGain);
    this.gravGain.connect(this.echoSendGain);
    this.echoSendGain.connect(this.echoDelayNode);

    // 7. Combined Audio Mix Node
    this.mixGain = this.ctx.createGain();
    this.mixGain.gain.setValueAtTime(1.0, now);
    this.mixGain.connect(this.gravGain);

    // 8. Buffer Layer Master Gain
    this.bufferMasterGain = this.ctx.createGain();
    this.bufferMasterGain.gain.setValueAtTime(0.8, now);
    this.bufferMasterGain.connect(this.mixGain);

    // 9. Procedural Synthesis Layer Setup
    this.initSynthGraph();
  }

  /**
   * Build procedural cosmic drone & pink noise synthesis engine (6.1 & 6.2)
   */
  initSynthGraph() {
    const now = this.ctx.currentTime;

    this.synthMasterGain = this.ctx.createGain();
    // Warm background body when buffer is playing, balanced in synthesis-only mode
    this.synthMasterGain.gain.setValueAtTime(this.audioBuffer ? 0.20 : 0.55, now);
    this.synthMasterGain.connect(this.mixGain);

    // Dynamic Lowpass Filter (cutoff increases with blueshift)
    this.synthFilter = this.ctx.createBiquadFilter();
    this.synthFilter.type = 'lowpass';
    this.synthFilter.frequency.setValueAtTime(160, now);
    this.synthFilter.Q.setValueAtTime(2.2, now);
    this.synthFilter.connect(this.synthMasterGain);

    // 1. Sub-Bass Drone tuned to authentic Perseus B♭1 (58.27 Hz) in pure unison (no binaural clash)
    this.subOsc1 = this.ctx.createOscillator();
    this.subOsc1.type = 'sine';
    this.subOsc1.frequency.setValueAtTime(58.27, now); // B♭1

    this.subOsc2 = this.ctx.createOscillator();
    this.subOsc2.type = 'triangle';
    this.subOsc2.frequency.setValueAtTime(58.27, now);
    this.subOsc2.detune.setValueAtTime(0.0, now); // Kept in pure harmonic phase to avoid nauseating binaural beats

    // B♭ Overtones (missing fundamental reconstruction for laptops / phones)
    this.harm2 = this.ctx.createOscillator(); // 2x: B♭2 (116.54 Hz)
    this.harm2.type = 'sine';
    this.harm2.frequency.setValueAtTime(116.54, now);

    this.harm3 = this.ctx.createOscillator(); // 3x: F3 (174.81 Hz)
    this.harm3.type = 'sine';
    this.harm3.frequency.setValueAtTime(174.81, now);

    this.harm4 = this.ctx.createOscillator(); // 4x: B♭3 (233.08 Hz)
    this.harm4.type = 'sine';
    this.harm4.frequency.setValueAtTime(233.08, now);

    this.shimmerOsc = this.ctx.createOscillator(); // Ethereal ring shimmer B♭2
    this.shimmerOsc.type = 'sine';
    this.shimmerOsc.frequency.setValueAtTime(116.54, now);

    // Track all pitched oscillators for synchronous lockstep detuning
    this.pitched = [
      { osc: this.subOsc1, baseDetune: 0 },
      { osc: this.subOsc2, baseDetune: 0 },
      { osc: this.harm2, baseDetune: 0 },
      { osc: this.harm3, baseDetune: 0 },
      { osc: this.harm4, baseDetune: 0 },
      { osc: this.shimmerOsc, baseDetune: 0 }
    ];

    const subGain = this.ctx.createGain();
    subGain.gain.setValueAtTime(0.40, now);
    this.subOsc1.connect(subGain);
    this.subOsc2.connect(subGain);

    const harm2Gain = this.ctx.createGain();
    harm2Gain.gain.setValueAtTime(0.14, now);
    this.harm2.connect(harm2Gain);
    harm2Gain.connect(subGain);

    const harm3Gain = this.ctx.createGain();
    harm3Gain.gain.setValueAtTime(0.08, now);
    this.harm3.connect(harm3Gain);
    harm3Gain.connect(subGain);

    const harm4Gain = this.ctx.createGain();
    harm4Gain.gain.setValueAtTime(0.04, now);
    this.harm4.connect(harm4Gain);
    harm4Gain.connect(subGain);

    // Soft WaveShaper saturation to generate rich upper harmonics without harsh buzz
    this.waveShaper = this.ctx.createWaveShaper();
    this.waveShaper.curve = makeTanhDistortionCurve(1024, 0.9);
    this.waveShaper.oversample = '2x';
    subGain.connect(this.waveShaper);
    this.waveShaper.connect(this.synthFilter);

    // Shimmer Gain
    const shimmerGain = this.ctx.createGain();
    shimmerGain.gain.setValueAtTime(0.06, now);
    this.shimmerOsc.connect(shimmerGain);
    shimmerGain.connect(this.synthFilter);

    // 2. Relativistic Plasma Wind with Paul Kellet Pink Noise & seamless loop crossfade
    const sampleRate = this.ctx.sampleRate;
    const bufferSize = sampleRate * 4; // 4 second loop
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, sampleRate);
    const data = noiseBuffer.getChannelData(0);

    // Paul Kellet's refined pink noise filter algorithm (-3 dB / octave)
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
      b6 = white * 0.115926;
      data[i] = pink * 0.16;
    }

    // Apply equal-power crossfade between ends of noise buffer to guarantee ZERO click
    const fadeSamples = Math.floor(sampleRate * 0.25);
    for (let i = 0; i < fadeSamples; i++) {
      const t = i / fadeSamples;
      const gainHead = Math.sin(t * Math.PI * 0.5);
      const gainTail = Math.cos(t * Math.PI * 0.5);
      const tailIdx = bufferSize - fadeSamples + i;
      const crossSample = data[i] * gainHead + data[tailIdx] * gainTail;
      data[i] = crossSample;
      data[tailIdx] = crossSample;
    }

    this.noiseNode = this.ctx.createBufferSource();
    this.noiseNode.buffer = noiseBuffer;
    this.noiseNode.loop = true;

    this.plasmaFilter = this.ctx.createBiquadFilter();
    this.plasmaFilter.type = 'bandpass';
    this.plasmaFilter.frequency.setValueAtTime(220, now);
    this.plasmaFilter.Q.setValueAtTime(2.6, now);

    this.noiseGain = this.ctx.createGain();
    this.noiseGain.gain.setValueAtTime(0.35, now);

    this.noiseNode.connect(this.plasmaFilter);
    this.plasmaFilter.connect(this.noiseGain);
    this.noiseGain.connect(this.synthFilter);

    // 3. Slow Tidal Breathing LFO
    this.lfo = this.ctx.createOscillator();
    this.lfo.frequency.setValueAtTime(0.065, now); // ~15.4s cycle

    this.lfoGain = this.ctx.createGain();
    this.lfoGain.gain.setValueAtTime(50, now);
    this.lfo.connect(this.lfoGain);
    this.lfoGain.connect(this.synthFilter.frequency);

    // Start procedural oscillators
    this.subOsc1.start();
    this.subOsc2.start();
    this.harm2.start();
    this.harm3.start();
    this.harm4.start();
    this.shimmerOsc.start();
    this.noiseNode.start();
    this.lfo.start();
  }

  /**
   * Transform raw AudioBuffer into a seamless loop via trailing silence trimming and equal-power crossfade (6.0 #4)
   */
  makeSeamlessBuffer(rawBuffer, fadeDuration = 2.5) {
    const rawLen = rawBuffer.length;
    const sampleRate = rawBuffer.sampleRate;
    const numChannels = rawBuffer.numberOfChannels;

    // 1. Detect trailing silence: audio files often fade out into dead silence
    // (for example, the NASA Perseus sonification MP3 has ~3.8 seconds of silence at the end).
    // Trimming the silent tail before crossfading prevents 2-3 second dropouts / stuttering during loop playback.
    const blockSize = Math.floor(sampleRate * 0.05); // 50ms evaluation block
    let lastAudibleSample = rawLen;
    for (let s = rawLen - blockSize; s >= 0; s -= blockSize) {
      let maxAmp = 0;
      for (let c = 0; c < numChannels; c++) {
        const data = rawBuffer.getChannelData(c);
        for (let i = 0; i < blockSize; i++) {
          const val = Math.abs(data[s + i] || 0);
          if (val > maxAmp) maxAmp = val;
        }
      }
      if (maxAmp > 0.012) {
        lastAudibleSample = Math.min(rawLen, s + blockSize * 2);
        break;
      }
    }

    const trimmedLen = Math.max(Math.floor(sampleRate * 2.0), lastAudibleSample);
    const trimmedDur = trimmedLen / sampleRate;

    const fadeSec = Math.min(fadeDuration, trimmedDur * 0.25);
    const fadeSamples = Math.floor(fadeSec * sampleRate);

    if (fadeSamples < 128 || trimmedDur < 1.0) {
      return rawBuffer;
    }

    const newLength = trimmedLen - fadeSamples;
    const seamlessBuffer = this.ctx.createBuffer(numChannels, newLength, sampleRate);

    for (let c = 0; c < numChannels; c++) {
      const srcData = rawBuffer.getChannelData(c);
      const dstData = seamlessBuffer.getChannelData(c);

      // 1. Copy middle untouched section up to newLength
      for (let i = fadeSamples; i < newLength; i++) {
        dstData[i] = srcData[i];
      }

      // 2. Equal-power crossfade of active tail into head
      for (let i = 0; i < fadeSamples; i++) {
        const t = i / fadeSamples;
        const gainHead = Math.sin(t * Math.PI * 0.5);
        const gainTail = Math.cos(t * Math.PI * 0.5);
        dstData[i] = srcData[i] * gainHead + srcData[newLength + i] * gainTail;
      }
    }

    return seamlessBuffer;
  }

  /**
   * Lazy load the default Perseus sonification MP3 from NASA Chandra (6.0 #1, #7)
   */
  async loadDefaultAudio() {
    if (this.audioBuffer || this.isLoadingAudio) return;
    this.isLoadingAudio = true;

    try {
      const response = await fetch(encodeURI(DEFAULT_AUDIO_URL));
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      const rawBuffer = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Audio decode timeout')), 5000);
        try {
          this.ctx.decodeAudioData(
            arrayBuffer.slice(0),
            (buf) => { clearTimeout(timer); resolve(buf); },
            (err) => { clearTimeout(timer); reject(err || new Error('Audio decode error')); }
          );
        } catch (e) {
          clearTimeout(timer);
          reject(e);
        }
      });
      this.audioBuffer = this.makeSeamlessBuffer(rawBuffer, 2.5);
      this.sourceMode = 'nasa';
      this.customFileName = null;

      if (this.isPlaying) {
        this.startBufferPlayback(1.5);
      }

      if (typeof this.onSourceChange === 'function') {
        this.onSourceChange(this.sourceMode, this.customFileName);
      }
    } catch (err) {
      console.warn('Failed to load NASA Perseus audio, falling back to procedural synthesis:', err);
      this.sourceMode = 'synth';
      this.audioBuffer = null;
      if (this.synthMasterGain && this.ctx) {
        this.synthMasterGain.gain.setTargetAtTime(0.65, this.ctx.currentTime, 0.5);
      }
      if (typeof this.onSourceChange === 'function') {
        this.onSourceChange(this.sourceMode, null);
      }
    } finally {
      this.isLoadingAudio = false;
    }
  }

  /**
   * Instantiate dual accretion disk Doppler playback layers from the loaded seamless buffer (6.0 #3 & 6.3 #3)
   */
  startBufferPlayback(crossfadeSec = 1.2) {
    if (!this.ctx || !this.audioBuffer) return;
    const now = this.ctx.currentTime;

    const oldLayers = this.bufferLayers;
    const oldBufferMaster = this.bufferMasterGain;

    // Create fresh buffer master gain with warm tone lowpass filter
    const newBufferMaster = this.ctx.createGain();
    newBufferMaster.gain.setValueAtTime(0.0001, now);

    const warmthFilter = this.ctx.createBiquadFilter();
    warmthFilter.type = 'lowpass';
    warmthFilter.frequency.setValueAtTime(2000, now);
    warmthFilter.Q.setValueAtTime(0.707, now);

    newBufferMaster.connect(warmthFilter);
    warmthFilter.connect(this.mixGain);

    const dur = this.audioBuffer.duration;
    // In Comfort Mode: single centered phase-aligned stream (prevents comb-filtering & nausea)
    // In Extreme Doppler Mode: dual layers panned left/right with offset to model approaching/receding disk limbs
    const layerCount = this.comfortMode ? 1 : 2;

    // Initial offsets: must ALWAYS stay strictly in the first half of the audio buffer (< dur * 0.50)
    // Layer 0 starts at 0.0, layer 1 starts at dur * 0.25 (clamped to max 45% of buffer duration)
    const maxOffset = dur * 0.45;
    const offsets = [0.0, Math.min(dur * 0.25, maxOffset)];
    const newLayers = [];

    for (let i = 0; i < layerCount; i++) {
      const source = this.ctx.createBufferSource();
      source.buffer = this.audioBuffer;
      source.loop = true;

      const panner = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(this.comfortMode ? 0.70 : 0.55, now);

      if (panner) {
        const panVal = this.comfortMode ? 0.0 : (i === 0 ? 0.22 : -0.22);
        panner.pan.setValueAtTime(panVal, now);
        source.connect(panner);
        panner.connect(gain);
      } else {
        source.connect(gain);
      }
      gain.connect(newBufferMaster);

      const startOffset = Math.min(offsets[i] || 0.0, maxOffset);
      source.start(now, startOffset);
      newLayers.push({ source, panner, gain });
    }

    // Crossfade in new layers
    newBufferMaster.gain.linearRampToValueAtTime(0.75, now + crossfadeSec);
    this.bufferLayers = newLayers;
    this.bufferMasterGain = newBufferMaster;
    this.bufferWarmthFilter = warmthFilter;

    // Gentle atmospheric drone foundation
    if (this.synthMasterGain) {
      this.synthMasterGain.gain.setTargetAtTime(0.20, now, crossfadeSec);
    }

    // Fade out and stop old layers
    if (oldBufferMaster) {
      oldBufferMaster.gain.setValueAtTime(oldBufferMaster.gain.value, now);
      oldBufferMaster.gain.linearRampToValueAtTime(0.0001, now + crossfadeSec);
      setTimeout(() => {
        for (const layer of oldLayers) {
          try {
            layer.source.stop();
            layer.source.disconnect();
          } catch (_) {}
        }
        try {
          oldBufferMaster.disconnect();
        } catch (_) {}
      }, Math.round((crossfadeSec + 0.15) * 1000));
    }
  }

  /**
   * Dynamically swap audio source on the fly via file or URL without restarting the scene (6.0 #2)
   */
  async setSource(fileOrUrl, customName = null) {
    this.init();
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    let arrayBuffer;
    let fileName = customName;

    if (typeof fileOrUrl === 'string') {
      fileName = fileName || fileOrUrl.split('/').pop();
      const res = await fetch(encodeURI(fileOrUrl));
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      arrayBuffer = await res.arrayBuffer();
    } else if (fileOrUrl instanceof Blob || (typeof File !== 'undefined' && fileOrUrl instanceof File)) {
      fileName = fileName || fileOrUrl.name;
      arrayBuffer = await fileOrUrl.arrayBuffer();
    } else {
      throw new Error('Unsupported source format');
    }

    const rawBuffer = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Audio decode timeout')), 5000);
      try {
        this.ctx.decodeAudioData(
          arrayBuffer.slice(0),
          (buf) => { clearTimeout(timer); resolve(buf); },
          (err) => { clearTimeout(timer); reject(err || new Error('Audio decode error')); }
        );
      } catch (e) {
        clearTimeout(timer);
        reject(e);
      }
    });
    this.audioBuffer = this.makeSeamlessBuffer(rawBuffer, 2.5);

    const isNasaDefault = typeof fileOrUrl === 'string' && fileOrUrl.includes('Perseus') && !customName;
    this.sourceMode = isNasaDefault ? 'nasa' : 'custom';
    this.customFileName = fileName;

    if (this.isPlaying) {
      this.startBufferPlayback(1.5);
    }

    if (typeof this.onSourceChange === 'function') {
      this.onSourceChange(this.sourceMode, this.customFileName);
    }

    return this.sourceMode;
  }

  /**
   * Real-time relativistic audio warping during spaceflight (6.1 & 6.3)
   *
   * @param {Object|number} state - { r, gamma, shadowFrac, camPos, camDir, diskSpeed }
   */
  update(state) {
    if (!this.isPlaying || !this.ctx) return;

    // Tolerant scalar fallback for backwards compatibility
    let r, gamma, shadowFrac, camPos, camDir, diskSpeed;
    if (typeof state === 'number') {
      r = Math.max(state, 1.0005);
      gamma = 1 / Math.sqrt(Math.max(1 - 1 / r, 0.0005));
      shadowFrac = 0.0;
      camPos = null;
      camDir = null;
      diskSpeed = 1.0;
    } else if (state && typeof state === 'object') {
      r = Math.max(state.r || 15.0, 1.0005);
      gamma = state.gamma || (1 / Math.sqrt(Math.max(1 - 1 / r, 0.0005)));
      shadowFrac = state.shadowFrac || 0.0;
      camPos = state.camPos || null;
      camDir = state.camDir || null;
      diskSpeed = state.diskSpeed !== undefined ? state.diskSpeed : 1.0;
    } else {
      return;
    }

    const now = this.ctx.currentTime;

    // 1. Relativistic Blueshift Frequency & Time Scale (6.1 & 6.3 #1)
    let timeScale = 1.0;
    let oct = 0.0;

    if (AUDIO_CONFIG.enableGravShift) {
      if (AUDIO_CONFIG.shiftMode === 'blue') {
        timeScale = Math.min(16.0, gamma);
        oct = Math.min(3.5, Math.log2(gamma));
      } else {
        // Redshift mode (disk emission observed by distant observer)
        const alphaCam = Math.sqrt(Math.max(1 - 1 / r, 0.0005));
        const alphaSrc = Math.sqrt(Math.max(1 - 1 / 3.0, 0.0005));
        const factor = Math.min(4.0, Math.max(0.2, alphaSrc / alphaCam));
        timeScale = factor;
        oct = Math.log2(factor);
      }
    }

    // Apply pitch shift to all procedural pitched oscillators synchronously
    const detuneCents = oct * 1200;
    for (const item of this.pitched) {
      item.osc.detune.setTargetAtTime(item.baseDetune + detuneCents, now, 0.15);
    }

    // Drive procedural plasma noise and breathing LFO with timeScale
    if (this.noiseNode) {
      this.noiseNode.playbackRate.setTargetAtTime(timeScale, now, 0.15);
    }
    if (this.lfo) {
      this.lfo.frequency.setTargetAtTime(0.065 * timeScale, now, 0.15);
    }
    if (this.synthFilter) {
      // Cutoff increases with blueshift
      const targetCutoff = Math.min(8000, 160 * (2 ** oct));
      this.synthFilter.frequency.setTargetAtTime(targetCutoff, now, 0.15);
    }

    // 2. Relativistic Energy Volume Scaling (6.3 #2)
    if (this.gravGain) {
      const volScale = AUDIO_CONFIG.enableVolumeScaling 
        ? Math.min(2.5, Math.pow(gamma, 0.65)) 
        : 1.0;
      this.gravGain.gain.setTargetAtTime(volScale, now, 0.15);
    }

    // 3. Accretion Disk Doppler Shift & Beaming (6.3 #3)
    let dApp = 1.0;
    let dRec = 1.0;
    let panApp = 0.0;
    let panRec = 0.0;

    if (!this.comfortMode && AUDIO_CONFIG.enableDopplerLayers && camPos) {
      // Extreme relativistic mode: dual Doppler layers panned left/right
      const beta = Math.min(0.70, Math.max(0.05, 0.48 / Math.sqrt(r)) * Math.min(2.0, Math.max(0.0, diskSpeed)));
      const xzDist = Math.sqrt(camPos.x * camPos.x + camPos.z * camPos.z);
      const sinInclination = r > 0.001 ? Math.min(1.0, xzDist / r) : 0.0;
      const cosTheta = sinInclination;

      const dopplerShift = Math.min(0.12, 0.14 * cosTheta * beta);
      dApp = 1.0 + dopplerShift;
      dRec = 1.0 - dopplerShift;

      panApp = 0.35;
      panRec = -0.35;
    }

    // Update active buffer layers with Doppler parameters
    if (!this.comfortMode && this.bufferLayers && this.bufferLayers.length >= 2) {
      const layerApp = this.bufferLayers[0];
      const layerRec = this.bufferLayers[1];

      // Approaching limb: blueshifted + beaming gain
      layerApp.source.playbackRate.setTargetAtTime(timeScale * dApp, now, 0.15);
      if (layerApp.panner) layerApp.panner.pan.setTargetAtTime(panApp, now, 0.15);
      layerApp.gain.gain.setTargetAtTime(Math.min(0.85, 0.55 * Math.pow(dApp, 1.2)), now, 0.15);

      // Receding limb: redshifted + dimming
      layerRec.source.playbackRate.setTargetAtTime(timeScale * dRec, now, 0.15);
      if (layerRec.panner) layerRec.panner.pan.setTargetAtTime(panRec, now, 0.15);
      layerRec.gain.gain.setTargetAtTime(Math.max(0.30, 0.55 * Math.pow(dRec, 1.2)), now, 0.15);
    } else if (this.bufferLayers && this.bufferLayers.length >= 1) {
      // Comfort Mode: single centered phase-aligned stream, zero binaural wobble/flanging
      this.bufferLayers[0].source.playbackRate.setTargetAtTime(timeScale, now, 0.20);
      if (this.bufferLayers[0].panner) {
        this.bufferLayers[0].panner.pan.setTargetAtTime(0.0, now, 0.20);
      }
    }

    // Synth LFO wobbling filter (disabled in comfort mode to avoid dizzying filter sweeps)
    if (this.lfoGain) {
      this.lfoGain.gain.setTargetAtTime(this.comfortMode ? 0.0 : 45.0, now, 0.25);
    }

    // 4. Photon Ring Echo Delay Line (6.3 #4)
    if (this.echoDelayNode && this.echoSendGain) {
      if (AUDIO_CONFIG.enablePhotonRingEcho) {
        // Echo interval contracts as observer clock slows near horizon
        const targetDelay = this.comfortMode ? 0.40 : Math.max(0.045, Math.min(1.2, 0.75 / gamma));
        this.echoDelayNode.delayTime.setTargetAtTime(targetDelay, now, 0.20);
        this.echoSendGain.gain.setTargetAtTime(this.comfortMode ? 0.15 : 0.35, now, 0.20);
      } else {
        this.echoSendGain.gain.setTargetAtTime(0.0, now, 0.15);
      }
    }

    // 5. Celestial Shadow Stereo Narrowing (6.3 #5)
    if (this.gainLL && this.gainRR && this.gainRL && this.gainLR) {
      if (AUDIO_CONFIG.enableStereoNarrowing) {
        const s = Math.min(Math.max(shadowFrac || 0.0, 0.0), 0.98);
        const direct = 1.0 - 0.5 * s;
        const cross = 0.5 * s;
        this.gainLL.gain.setTargetAtTime(direct, now, 0.15);
        this.gainRR.gain.setTargetAtTime(direct, now, 0.15);
        this.gainRL.gain.setTargetAtTime(cross, now, 0.15);
        this.gainLR.gain.setTargetAtTime(cross, now, 0.15);
      } else {
        this.gainLL.gain.setTargetAtTime(1.0, now, 0.15);
        this.gainRR.gain.setTargetAtTime(1.0, now, 0.15);
        this.gainRL.gain.setTargetAtTime(0.0, now, 0.15);
        this.gainLR.gain.setTargetAtTime(0.0, now, 0.15);
      }
    }

    // 6. 3D Spatial Audio Orientation (6.3 #6)
    if (AUDIO_CONFIG.enableSpatialPanner && camPos && camDir && this.ctx.listener) {
      const listener = this.ctx.listener;
      if (listener.positionX) {
        listener.positionX.setTargetAtTime(camPos.x, now, 0.08);
        listener.positionY.setTargetAtTime(camPos.y, now, 0.08);
        listener.positionZ.setTargetAtTime(camPos.z, now, 0.08);
        listener.forwardX.setTargetAtTime(camDir.x, now, 0.08);
        listener.forwardY.setTargetAtTime(camDir.y, now, 0.08);
        listener.forwardZ.setTargetAtTime(camDir.z, now, 0.08);
        listener.upX.setTargetAtTime(0, now, 0.08);
        listener.upY.setTargetAtTime(1, now, 0.08);
        listener.upZ.setTargetAtTime(0, now, 0.08);
      } else if (typeof listener.setPosition === 'function') {
        listener.setPosition(camPos.x, camPos.y, camPos.z);
        listener.setOrientation(camDir.x, camDir.y, camDir.z, 0, 1, 0);
      }
    }
  }

  /**
   * Toggle audio playback on/off with clean fade ramp and CPU suspension (6.2)
   */
  toggle() {
    this.init();

    if (this.suspendTimeout) {
      clearTimeout(this.suspendTimeout);
      this.suspendTimeout = null;
    }

    const now = this.ctx.currentTime;

    if (this.isPlaying) {
      // Fade out and suspend context
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setValueAtTime(Math.max(this.masterGain.gain.value, 0.0001), now);
      this.masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.0);
      this.isPlaying = false;

      this.suspendTimeout = setTimeout(() => {
        if (!this.isPlaying && this.ctx && this.ctx.state === 'running') {
          this.ctx.suspend().catch(() => {});
        }
      }, 1050);
    } else {
      // Resume context and fade in
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }

      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setValueAtTime(Math.max(this.masterGain.gain.value, 0.0001), now);
      const targetGain = Math.max(0.0001, 0.38 * this.userVolume);
      this.masterGain.gain.exponentialRampToValueAtTime(targetGain, now + 1.2);
      this.isPlaying = true;

      // Lazy load NASA Perseus audio on first sound activation
      if (!this.audioBuffer && !this.isLoadingAudio) {
        this.loadDefaultAudio();
      } else if (this.audioBuffer && (!this.bufferLayers || this.bufferLayers.length === 0)) {
        this.startBufferPlayback(1.0);
      }
    }

    return this.isPlaying;
  }

  /**
   * Set user master volume level (0.0 to 1.0)
   */
  setVolume(val) {
    const v = Math.min(1.0, Math.max(0.0, val));
    this.userVolume = v;
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    if (this.isPlaying) {
      const targetGain = Math.max(0.0001, 0.38 * this.userVolume);
      this.masterGain.gain.setTargetAtTime(targetGain, now, 0.04);
    }
  }

  /**
   * Set Comfort Mode (true = calm centered audio without dizziness/nausea, false = extreme relativistic Doppler)
   */
  setComfortMode(enabled) {
    this.comfortMode = !!enabled;
    if (this.isPlaying && this.audioBuffer) {
      this.startBufferPlayback(0.8);
    }
  }
}
