/**
 * NASA Sonification Cosmic Audio Engine
 *
 * Implements real-time relativistic gravitational audio warping:
 * 1. Authentic NASA Chandra X-ray Observatory Perseus cluster black hole sonification.
 * 2. Seamless continuous looping with trailing silence removal and equal-power crossfade.
 * 3. Playback starting from a random moment in the first half of the recording.
 * 4. Relativistic frequency shift / blueshift (playbackRate warp near horizon).
 * 5. Gravitational energy flux scaling with brickwall DynamicsCompressor safety limiting.
 * 6. Accretion disk Doppler splitting & photon ring feedback delay echo.
 * 7. Celestial horizon stereo narrowing (width = 1 - shadowFrac).
 *
 * Attribution:
 * Sonification: NASA/CXC/SAO/K.Arcand, SYSTEM Sounds (M. Russo, A. Santaguida)
 * Chandra Media Use Policy: https://chandra.si.edu/about/copyright.html
 */

const BASE = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || './';
const normalizedBase = BASE.endsWith('/') ? BASE : BASE + '/';
export const DEFAULT_AUDIO_URL = `${normalizedBase}audio/Data Sonification_ Black Hole at the Center of the Perseus Galaxy Cluster (X-ray).mp3`;

export const AUDIO_CONFIG = {
  shiftMode: 'blue',          // 'blue' (gravitational blueshift for falling observer) or 'red'
  enableGravShift: true,      // 1. Relativistic frequency & time warp
  enableVolumeScaling: true,  // 2. Relativistic energy volume boost with limiter
  enableDopplerLayers: true,  // 3. Accretion disk Doppler splitting (approaching/receding)
  enablePhotonRingEcho: true, // 4. Photon ring feedback delay (feedback e^-pi = 0.043)
  enableStereoNarrowing: true // 5. Celestial horizon stereo narrowing (1 - shadowFrac)
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
  custom: {
    ru: {
      title: 'О звуке',
      desc: 'Свой звук: пользовательский аудиофайл с релятивистскими эффектами Доплера и гравитационного смещения.',
      credit: '',
      sourceBadge: 'Текущий источник: Пользовательский трек'
    },
    en: {
      title: 'About the Sound',
      desc: 'Custom sound: playing user audio file with real-time relativistic Doppler and gravitational warp.',
      credit: '',
      sourceBadge: 'Current Source: Custom Audio Track'
    }
  }
};

export class CosmicAudio {
  constructor() {
    this.ctx = null;
    this.isPlaying = false;
    this.sourceMode = 'nasa'; // 'nasa' | 'custom'
    this.customFileName = null;
    this.isLoadingAudio = false;
    this.onSourceChange = null;
    this.userVolume = 0.85; // Calibrated for clear, comfortable audibility on laptop speakers & headphones
    this.comfortMode = true; // Calmed centered stereo audio (no binaural nausea)

    // Preloaded network buffer
    this._rawArrayBuffer = null;

    // Decoded and seamlessly looped AudioBuffer
    this.audioBuffer = null;

    // Buffer playback layers
    this.bufferLayers = [];
    this.bufferMasterGain = null;

    // Audio effect routing nodes
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

    // Dynamics Limiter & Master Output Gain
    this.compressor = null;
    this.masterGain = null;

    this.suspendTimeout = null;
  }

  /**
   * Preload audio data from network in background so it starts instantly on first user click
   */
  async preload() {
    if (this.audioBuffer || this.isLoadingAudio || this._rawArrayBuffer) return;
    try {
      const response = await fetch(encodeURI(DEFAULT_AUDIO_URL));
      if (response.ok) {
        this._rawArrayBuffer = await response.arrayBuffer();
      }
    } catch (e) {
      console.warn('Preload NASA audio notice:', e);
    }
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

    // 2. Dynamics Compressor (Brickwall safety limiter preventing distortion / speaker blow)
    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.setValueAtTime(-4.0, now);
    this.compressor.knee.setValueAtTime(4.0, now);
    this.compressor.ratio.setValueAtTime(6.0, now);
    this.compressor.attack.setValueAtTime(0.003, now);
    this.compressor.release.setValueAtTime(0.12, now);
    this.compressor.connect(this.masterGain);

    // 3. Stereo Narrowing Matrix (width = 1 - shadowFrac)
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

    this.stereoMerger.connect(this.compressor);

    // 4. Photon Ring Echo Delay Line (feedback factor e^-pi ~= 0.043; Johnson et al. 2020)
    this.postEchoMix = this.ctx.createGain();
    this.postEchoMix.gain.setValueAtTime(1.0, now);
    this.postEchoMix.connect(this.stereoSplitter);

    this.dryGain = this.ctx.createGain();
    this.dryGain.gain.setValueAtTime(0.88, now);
    this.dryGain.connect(this.postEchoMix);

    this.echoDelayNode = this.ctx.createDelay(3.0);
    this.echoDelayNode.delayTime.setValueAtTime(0.65, now);

    this.echoFeedbackGain = this.ctx.createGain();
    this.echoFeedbackGain.gain.setValueAtTime(0.043, now); // e^-pi = 0.0432139... (-27.3 dB)

    this.echoSendGain = this.ctx.createGain();
    this.echoSendGain.gain.setValueAtTime(0.25, now);

    this.echoDelayNode.connect(this.echoFeedbackGain);
    this.echoFeedbackGain.connect(this.echoDelayNode);
    this.echoDelayNode.connect(this.postEchoMix);

    // 5. Gravitational Volume Scaling
    this.gravGain = this.ctx.createGain();
    this.gravGain.gain.setValueAtTime(1.0, now);
    this.gravGain.connect(this.dryGain);
    this.gravGain.connect(this.echoSendGain);
    this.echoSendGain.connect(this.echoDelayNode);

    // 6. Audio Mix Node
    this.mixGain = this.ctx.createGain();
    this.mixGain.gain.setValueAtTime(1.0, now);
    this.mixGain.connect(this.gravGain);

    // 7. Buffer Layer Master Gain
    this.bufferMasterGain = this.ctx.createGain();
    this.bufferMasterGain.gain.setValueAtTime(0.90, now);
    this.bufferMasterGain.connect(this.mixGain);
  }

  /**
   * Transform raw AudioBuffer into a seamless loop via trailing silence trimming and equal-power crossfade
   */
  makeSeamlessBuffer(rawBuffer, fadeDuration = 2.5) {
    const rawLen = rawBuffer.length;
    const sampleRate = rawBuffer.sampleRate;
    const numChannels = rawBuffer.numberOfChannels;

    // Detect trailing silence: NASA sonification MP3 has ~3.8 seconds of dead silence at the tail.
    // Trimming the silent tail before crossfading prevents dropouts during loop playback.
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

      // 1. Copy middle untouched section
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
   * Load default Perseus sonification MP3 from NASA Chandra
   */
  async loadDefaultAudio() {
    if (this.audioBuffer || this.isLoadingAudio) return;
    this.isLoadingAudio = true;
    this.init();

    try {
      let arrayBuffer = this._rawArrayBuffer;
      if (!arrayBuffer) {
        const response = await fetch(encodeURI(DEFAULT_AUDIO_URL));
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        arrayBuffer = await response.arrayBuffer();
      }

      const rawBuffer = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Audio decode timeout')), 10000);
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
      this._rawArrayBuffer = null;

      if (this.isPlaying) {
        this.startBufferPlayback(1.0);
      }

      if (typeof this.onSourceChange === 'function') {
        this.onSourceChange(this.sourceMode, this.customFileName);
      }
    } catch (err) {
      console.warn('Failed to load NASA Perseus audio:', err);
      this.audioBuffer = null;
    } finally {
      this.isLoadingAudio = false;
    }
  }

  /**
   * Instantiate Doppler playback layers from the loaded seamless buffer.
   * Starts playback from a random position in the first half of the recording and loops continuously.
   */
  startBufferPlayback(crossfadeSec = 0.8) {
    if (!this.ctx || !this.audioBuffer) return;
    const now = this.ctx.currentTime;

    const oldLayers = this.bufferLayers;
    const oldBufferMaster = this.bufferMasterGain;

    const newBufferMaster = this.ctx.createGain();
    newBufferMaster.gain.setValueAtTime(0.0001, now);
    newBufferMaster.connect(this.mixGain);

    const dur = this.audioBuffer.duration;
    const layerCount = this.comfortMode ? 1 : 2;

    // Requirement: Start from a random moment strictly in the first half of the recording (< 0.5 * dur)
    const maxFirstHalfOffset = dur * 0.48;
    const randomStart = Math.random() * maxFirstHalfOffset;
    const offsets = [
      randomStart,
      Math.min(maxFirstHalfOffset, randomStart + dur * 0.12)
    ];

    const newLayers = [];

    for (let i = 0; i < layerCount; i++) {
      const source = this.ctx.createBufferSource();
      source.buffer = this.audioBuffer;
      source.loop = true; // Loops continuously

      const panner = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(this.comfortMode ? 0.95 : 0.75, now);

      if (panner) {
        const panVal = this.comfortMode ? 0.0 : (i === 0 ? 0.22 : -0.22);
        panner.pan.setValueAtTime(panVal, now);
        source.connect(panner);
        panner.connect(gain);
      } else {
        source.connect(gain);
      }
      gain.connect(newBufferMaster);

      const startOffset = Math.min(offsets[i] || 0.0, maxFirstHalfOffset);
      source.start(now, startOffset);
      newLayers.push({ source, panner, gain });
    }

    // Crossfade in new layers
    newBufferMaster.gain.linearRampToValueAtTime(0.95, now + crossfadeSec);
    this.bufferLayers = newLayers;
    this.bufferMasterGain = newBufferMaster;

    // Fade out and stop previous layers
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
   * Dynamically swap audio source on the fly via file or URL
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
      const timer = setTimeout(() => reject(new Error('Audio decode timeout')), 10000);
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
      this.startBufferPlayback(1.0);
    }

    if (typeof this.onSourceChange === 'function') {
      this.onSourceChange(this.sourceMode, this.customFileName);
    }

    return this.sourceMode;
  }

  /**
   * Real-time relativistic audio warping during spaceflight
   */
  update(arg1, arg2, arg3, arg4, arg5) {
    if (!this.isPlaying || !this.ctx) return;

    let r, gamma, shadowFrac, camPos, diskSpeed;
    if (typeof arg1 === 'number') {
      r = Math.max(arg1, 1.0005);
      gamma = typeof arg2 === 'number' ? arg2 : (1 / Math.sqrt(Math.max(1 - 1 / r, 0.0005)));
      shadowFrac = typeof arg3 === 'number' ? arg3 : 0.0;
      camPos = (arg4 && typeof arg4 === 'object') ? arg4 : null;
      diskSpeed = typeof arg5 === 'number' ? arg5 : 1.0;
    } else if (arg1 && typeof arg1 === 'object') {
      r = Math.max(arg1.r || 15.0, 1.0005);
      gamma = arg1.gamma || (1 / Math.sqrt(Math.max(1 - 1 / r, 0.0005)));
      shadowFrac = arg1.shadowFrac || 0.0;
      camPos = arg1.camPos || null;
      diskSpeed = arg1.diskSpeed !== undefined ? arg1.diskSpeed : 1.0;
    } else {
      return;
    }

    const now = this.ctx.currentTime;

    // 1. Relativistic Blueshift Frequency & Time Scale
    let timeScale = 1.0;
    if (AUDIO_CONFIG.enableGravShift) {
      if (AUDIO_CONFIG.shiftMode === 'blue') {
        timeScale = Math.min(8.0, gamma);
      } else {
        const alphaCam = Math.sqrt(Math.max(1 - 1 / r, 0.0005));
        const alphaSrc = Math.sqrt(Math.max(1 - 1 / 3.0, 0.0005));
        timeScale = Math.min(4.0, Math.max(0.2, alphaSrc / alphaCam));
      }
    }

    // 2. Relativistic Energy Volume Scaling
    if (this.gravGain) {
      const volScale = AUDIO_CONFIG.enableVolumeScaling 
        ? Math.min(2.2, Math.pow(Math.min(gamma, 100), 0.55)) 
        : 1.0;
      this.gravGain.gain.setTargetAtTime(volScale, now, 0.15);
    }

    // 3. Accretion Disk Doppler Shift
    let dApp = 1.0;
    let dRec = 1.0;
    let panApp = 0.0;
    let panRec = 0.0;

    if (!this.comfortMode && AUDIO_CONFIG.enableDopplerLayers && camPos) {
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

      layerApp.source.playbackRate.setTargetAtTime(timeScale * dApp, now, 0.15);
      if (layerApp.panner) layerApp.panner.pan.setTargetAtTime(panApp, now, 0.15);
      layerApp.gain.gain.setTargetAtTime(Math.min(0.85, 0.60 * Math.pow(dApp, 1.2)), now, 0.15);

      layerRec.source.playbackRate.setTargetAtTime(timeScale * dRec, now, 0.15);
      if (layerRec.panner) layerRec.panner.pan.setTargetAtTime(panRec, now, 0.15);
      layerRec.gain.gain.setTargetAtTime(Math.max(0.30, 0.60 * Math.pow(dRec, 1.2)), now, 0.15);
    } else if (this.bufferLayers && this.bufferLayers.length >= 1) {
      this.bufferLayers[0].source.playbackRate.setTargetAtTime(timeScale, now, 0.20);
      if (this.bufferLayers[0].panner) {
        this.bufferLayers[0].panner.pan.setTargetAtTime(0.0, now, 0.20);
      }
    }

    // 4. Photon Ring Echo Delay Line
    if (this.echoDelayNode && this.echoSendGain) {
      if (AUDIO_CONFIG.enablePhotonRingEcho) {
        const targetDelay = this.comfortMode ? 0.40 : Math.max(0.045, Math.min(1.2, 0.75 / gamma));
        this.echoDelayNode.delayTime.setTargetAtTime(targetDelay, now, 0.20);
        this.echoSendGain.gain.setTargetAtTime(this.comfortMode ? 0.18 : 0.35, now, 0.20);
      } else {
        this.echoSendGain.gain.setTargetAtTime(0.0, now, 0.15);
      }
    }

    // 5. Celestial Shadow Stereo Narrowing
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
  }

  /**
   * Toggle audio playback on/off with clean fade ramp and CPU suspension
   */
  toggle() {
    this.init();

    if (this.suspendTimeout) {
      clearTimeout(this.suspendTimeout);
      this.suspendTimeout = null;
    }

    const now = this.ctx.currentTime;

    if (this.isPlaying) {
      // Fade out
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setValueAtTime(Math.max(this.masterGain.gain.value, 0.0001), now);
      this.masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.8);
      this.isPlaying = false;

      this.suspendTimeout = setTimeout(() => {
        if (!this.isPlaying) {
          // Stop old buffer sources so next playback starts with a fresh random offset
          for (const layer of this.bufferLayers) {
            try {
              layer.source.stop();
              layer.source.disconnect();
            } catch (_) {}
          }
          this.bufferLayers = [];
          if (this.ctx && this.ctx.state === 'running') {
            this.ctx.suspend().catch(() => {});
          }
        }
      }, 850);
    } else {
      // Resume context and fade in with generous, comfortable volume
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }

      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setValueAtTime(Math.max(this.masterGain.gain.value, 0.0001), now);
      const targetGain = Math.max(0.0001, 0.72 * this.userVolume);
      this.masterGain.gain.exponentialRampToValueAtTime(targetGain, now + 0.8);
      this.isPlaying = true;

      // Start buffer playback or trigger loading
      if (!this.audioBuffer && !this.isLoadingAudio) {
        this.loadDefaultAudio();
      } else if (this.audioBuffer && (!this.bufferLayers || this.bufferLayers.length === 0)) {
        this.startBufferPlayback(0.8);
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
      const targetGain = Math.max(0.0001, 0.72 * this.userVolume);
      this.masterGain.gain.setTargetAtTime(targetGain, now, 0.04);
    }
  }

  /**
   * Set Comfort Mode (true = calm centered stereo audio, false = extreme relativistic Doppler)
   */
  setComfortMode(enabled) {
    this.comfortMode = !!enabled;
    if (this.isPlaying && this.audioBuffer) {
      this.startBufferPlayback(0.8);
    }
  }
}
